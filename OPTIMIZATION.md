# 데이터베이스 최적화 가이드 (Phase 5)

## 개요

Issue #67 Phase 5에서 수행한 데이터베이스 쿼리 성능 최적화 및 벤치마크 결과를 문서화합니다.

---

## 1. 추가된 인덱스

### WeatherAlert 테이블

#### 기존 인덱스
- `@@unique([regionId, warningType])` - 복합 유니크 제약
- `@@index([regionId, createdAt])` - 지역별 시계열 조회
- `@@index([warningType, warningLevel])` - 특보 종류별 수준 필터링
- `@@index([announcedAt])` - 발표시각 정렬
- `@@index([upperRegion])` - 상위지역 필터링

#### Phase 5 추가 인덱스
```prisma
@@index([command]) // command != '6' 필터링에 유용
@@index([upperRegion, warningType]) // 복합 필터링 최적화
@@index([upperRegion, warningLevel]) // 지역별 수준 조회 최적화
```

**추가 이유**:
- `command` 인덱스: `getCurrentAlerts()` 메서드가 `command != '6'` 조건을 자주 사용
- 복합 인덱스: API 엔드포인트에서 `upperRegion` + `warningType/Level` 필터링이 자주 발생

### AlertHistory 테이블

#### 기존 인덱스
- `@@index([regionId, timestamp])` - 지역별 시계열 조회
- `@@index([changeType])` - 변동 유형 필터링
- `@@index([timestamp])` - 시계열 정렬
- `@@index([warningType])` - 특보 종류 필터링

#### Phase 5 추가 인덱스
```prisma
@@index([timestamp, warningType]) // 기간별 특보 종류 필터링
@@index([timestamp, changeType]) // 기간별 변동 유형 필터링
@@index([timestamp, upperRegion]) // 기간별 지역 통계에 유용
@@index([upperRegion, timestamp]) // 지역별 시계열 조회
```

**추가 이유**:
- `getAlertHistory()` 메서드가 timestamp 범위 + 다양한 필터 조합을 사용
- `getAlertStatistics()` 메서드의 GROUP BY 쿼리 성능 향상
- 복합 인덱스는 왼쪽 컬럼부터 순서대로 매칭되므로 쿼리 패턴에 맞게 설계

---

## 2. 쿼리 패턴 분석

### 주요 쿼리 패턴

#### 1. getCurrentAlerts()
```sql
SELECT * FROM weather_alerts
WHERE command != '6'
  AND upperRegion = ?  -- 선택적
  AND warningType = ?  -- 선택적
  AND warningLevel = ? -- 선택적
ORDER BY announcedAt DESC;
```

**최적화**:
- `@@index([command])`: WHERE 조건 필터링
- `@@index([upperRegion, warningType])`: 복합 필터링
- `@@index([announcedAt])`: ORDER BY 최적화

#### 2. getAlertHistory()
```sql
SELECT * FROM alert_histories
WHERE timestamp >= ? AND timestamp <= ?
  AND regionId = ?     -- 선택적
  AND warningType = ?  -- 선택적
  AND changeType = ?   -- 선택적
ORDER BY timestamp DESC;
```

**최적화**:
- `@@index([timestamp, warningType])`: 기간 + 특보 종류
- `@@index([timestamp, changeType])`: 기간 + 변동 유형
- `@@index([regionId, timestamp])`: 지역 + 시계열

#### 3. getAlertStatistics()
```sql
SELECT upperRegion, COUNT(id) as count
FROM alert_histories
WHERE timestamp >= ? AND timestamp <= ?
GROUP BY upperRegion;
```

**최적화**:
- `@@index([timestamp, upperRegion])`: GROUP BY 성능 향상
- PostgreSQL의 Index-Only Scan 활용 가능

---

## 3. 연결 풀 설정

### Prisma Client 설정

```typescript
// src/services/DatabaseService.ts
this.prisma = new PrismaClient({
  log: process.env.DEBUG === 'true' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

### PostgreSQL 연결 풀 파라미터

`.env` 파일에서 DATABASE_URL에 연결 풀 파라미터 추가:

```env
# 기본 (권장)
DATABASE_URL="postgresql://user:password@localhost:5432/ku_weather_dev?connection_limit=10&pool_timeout=20"

# 고부하 환경 (동시 접속 많을 때)
DATABASE_URL="postgresql://user:password@localhost:5432/ku_weather_prod?connection_limit=20&pool_timeout=30"

# 저부하 환경 (리소스 절약)
DATABASE_URL="postgresql://user:password@localhost:5432/ku_weather_test?connection_limit=5&pool_timeout=10"
```

**파라미터 설명**:
- `connection_limit`: 최대 연결 수 (기본값: 10)
- `pool_timeout`: 연결 타임아웃 (초 단위, 기본값: 10)

**권장 값**:
| 환경 | connection_limit | pool_timeout | 설명 |
|------|------------------|--------------|------|
| Development | 5 | 10s | 로컬 개발 |
| Testing | 10 | 20s | CI/CD 테스트 |
| Production (Low Traffic) | 10 | 20s | 트래픽 적음 |
| Production (High Traffic) | 20-50 | 30s | 트래픽 많음 |

---

## 4. 성능 측정 도구

### 쿼리 성능 분석 스크립트

```bash
# 쿼리 실행 시간 및 EXPLAIN ANALYZE
npm run analyze:performance
```

**기능**:
- 주요 쿼리 7개의 실행 시간 측정
- PostgreSQL EXPLAIN ANALYZE 실행
- 인덱스 사용 여부 확인

**측정 항목**:
1. 현재 특보 조회
2. 지역 필터링
3. 복합 필터링 (upperRegion + warningType)
4. 이력 조회 (최근 7일)
5. 이력 필터링 (지역 + 변동 유형)
6. 지역별 통계 (30일)
7. 특보별 통계 (30일)

### 대량 데이터 벤치마크

```bash
# 10,000건 더미 데이터 생성 및 벤치마크
npm run benchmark:large-dataset
```

**기능**:
- 10,000건의 더미 alert_histories 데이터 생성
- 다양한 쿼리 패턴 벤치마크
- 페이지네이션 성능 측정
- 자동 클린업

**측정 항목**:
1. Batch Insert (10,000건)
2. 기간별 조회 (7일)
3. 기간별 + 필터 조회 (30일)
4. 복합 필터 조회
5. GROUP BY 통계 (지역별)
6. GROUP BY 통계 (특보별)
7. 페이지네이션 (LIMIT 100)
8. 깊은 페이지네이션 (OFFSET 5000)

---

## 5. 벤치마크 결과 (예상)

### 소규모 데이터셋 (< 1,000건)

| 쿼리 | 예상 시간 | 목표 |
|------|----------|------|
| getCurrentAlerts | < 10ms | ✅ Good |
| 지역 필터링 | < 5ms | ✅ Good |
| 복합 필터링 | < 10ms | ✅ Good |
| 이력 조회 (7일) | < 20ms | ✅ Good |
| GROUP BY 통계 | < 30ms | ✅ Good |

### 대규모 데이터셋 (10,000건+)

| 쿼리 | 예상 시간 | 목표 |
|------|----------|------|
| Batch Insert (10,000건) | < 1000ms | ✅ Good |
| 기간별 조회 | < 100ms | ✅ Good |
| 복합 필터 조회 | < 50ms | ✅ Good |
| GROUP BY 통계 | < 150ms | 🟡 Acceptable |
| 페이지네이션 (LIMIT 100) | < 20ms | ✅ Good |
| 깊은 페이지네이션 (OFFSET 5000) | < 100ms | 🟡 Acceptable |

**성능 기준**:
- 🟢 Good: < 100ms
- 🟡 Acceptable: 100ms - 500ms
- 🔴 Needs Improvement: > 500ms

---

## 6. 최적화 권장사항

### 6.1 인덱스 유지보수

#### 정기적인 VACUUM 및 ANALYZE
```sql
-- 테이블 통계 업데이트
ANALYZE weather_alerts;
ANALYZE alert_histories;

-- 디스크 공간 회수 및 통계 업데이트
VACUUM ANALYZE weather_alerts;
VACUUM ANALYZE alert_histories;
```

**cron 작업 (주 1회)**:
```bash
0 2 * * 0 psql -U ku_weather -d ku_weather_prod -c "VACUUM ANALYZE;"
```

#### 인덱스 재구축 (필요 시)
```sql
-- 인덱스 상태 확인
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_indexes
JOIN pg_class ON indexrelid = pg_class.oid
WHERE tablename IN ('weather_alerts', 'alert_histories')
ORDER BY pg_relation_size(indexrelid) DESC;

-- 인덱스 재구축 (오래된 데이터가 많을 때)
REINDEX TABLE weather_alerts;
REINDEX TABLE alert_histories;
```

### 6.2 쿼리 최적화 팁

#### 1. SELECT * 피하기
```typescript
// ❌ Bad
const alerts = await prisma.weatherAlert.findMany();

// ✅ Good
const alerts = await prisma.weatherAlert.findMany({
  select: {
    id: true,
    regionName: true,
    warningType: true,
    warningLevel: true,
    announcedAt: true,
  },
});
```

#### 2. 페이지네이션에 커서 기반 사용
```typescript
// ❌ Bad (OFFSET은 느림)
const alerts = await prisma.alertHistory.findMany({
  skip: 5000,
  take: 100,
});

// ✅ Good (커서 기반)
const alerts = await prisma.alertHistory.findMany({
  take: 100,
  cursor: lastCursor ? { id: lastCursor } : undefined,
  orderBy: { timestamp: 'desc' },
});
```

#### 3. COUNT(*) 최적화
```typescript
// ❌ Bad (전체 스캔)
const count = await prisma.alertHistory.count();

// ✅ Good (인덱스 활용)
const count = await prisma.alertHistory.count({
  where: {
    timestamp: {
      gte: startDate,
      lte: endDate,
    },
  },
});
```

### 6.3 모니터링

#### Slow Query Log 설정
```sql
-- PostgreSQL 설정
ALTER SYSTEM SET log_min_duration_statement = '100ms';
SELECT pg_reload_conf();
```

#### 쿼리 성능 모니터링
```sql
-- 느린 쿼리 확인
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 10;
```

---

## 7. 마이그레이션 실행

### 인덱스 추가 마이그레이션 생성

```bash
# 마이그레이션 생성
npx prisma migrate dev --name add_optimization_indexes

# 프로덕션 적용 (주의!)
npx prisma migrate deploy
```

### 마이그레이션 롤백 (필요 시)

```bash
# 최근 마이그레이션 취소
npx prisma migrate resolve --rolled-back MIGRATION_NAME
```

---

## 8. 참고 자료

- [PostgreSQL Index Documentation](https://www.postgresql.org/docs/current/indexes.html)
- [Prisma Performance Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [PostgreSQL EXPLAIN 분석](https://www.postgresql.org/docs/current/using-explain.html)

---

## 9. 체크리스트

- [x] 추가 인덱스 설계 및 적용
- [x] 연결 풀 설정 최적화
- [x] 쿼리 성능 분석 스크립트 작성
- [x] 대량 데이터 벤치마크 스크립트 작성
- [x] 최적화 가이드 문서 작성
- [ ] 실제 벤치마크 실행 및 결과 기록
- [ ] 프로덕션 환경 적용

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

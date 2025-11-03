# 기상특보 데이터베이스 운영 매뉴얼

## 📋 목차

1. [개요](#개요)
2. [데이터베이스 구조](#데이터베이스-구조)
3. [로컬 환경 설정](#로컬-환경-설정)
4. [서버 환경 설정](#서버-환경-설정)
5. [마이그레이션](#마이그레이션)
6. [백업 및 복구](#백업-및-복구)
7. [모니터링](#모니터링)
8. [문제 해결](#문제-해결)
9. [유지보수](#유지보수)

---

## 개요

### 기술 스택

- **데이터베이스**: PostgreSQL 15+
- **ORM**: Prisma 6.x
- **언어**: TypeScript/Node.js
- **환경**: 개발(로컬), 스테이징, 프로덕션

### 주요 기능

- 기상특보 데이터 저장 (upsert)
- 특보 변동 이력 관리
- 지역 매핑 캐시
- 통계 및 분석 데이터 제공

---

## 데이터베이스 구조

### ERD (Entity Relationship Diagram)

```
┌─────────────────────┐
│  weather_alerts     │
├─────────────────────┤
│ id (PK)             │
│ regionId            │◄─────┐
│ regionName          │      │
│ upperRegion         │      │
│ warningType         │      │
│ warningLevel        │      │
│ command             │      │
│ announcedAt         │      │
│ effectiveAt         │      │
│ endTime             │      │
│ createdAt           │      │
│ updatedAt           │      │
└─────────────────────┘      │
                             │
┌─────────────────────┐      │
│ alert_histories     │      │
├─────────────────────┤      │
│ id (PK)             │      │
│ alertId             │      │
│ regionId            │──────┘
│ regionName          │
│ upperRegion         │
│ warningType         │
│ warningLevel        │
│ changeType          │
│ previousData (JSON) │
│ currentData (JSON)  │
│ timestamp           │
└─────────────────────┘

┌─────────────────────┐
│ region_mappings     │
├─────────────────────┤
│ id (PK)             │
│ regionId (Unique)   │
│ regionName          │
│ upperRegion         │
│ createdAt           │
└─────────────────────┘
```

### 테이블 상세 설명

#### 1. weather_alerts (기상특보 데이터)

현재 발효 중이거나 최근 발표된 기상특보 정보를 저장합니다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | TEXT | PRIMARY KEY | UUID |
| regionId | TEXT | NOT NULL | 지역코드 (예: L1100000) |
| regionName | TEXT | NOT NULL | 지역명 (예: 서울특별시) |
| upperRegion | TEXT | NULLABLE | 상위 지역 (예: 서울) |
| warningType | TEXT | NOT NULL | 특보종류 (W, R, C, H 등) |
| warningLevel | TEXT | NOT NULL | 특보수준 (1:예비, 2:주의보, 3:경보) |
| command | TEXT | NOT NULL | 특보명령 (1:발표, 3:해제 등) |
| announcedAt | TIMESTAMP(3) | NOT NULL | 발표시각 |
| effectiveAt | TIMESTAMP(3) | NOT NULL | 발효시각 |
| endTime | TIMESTAMP(3) | NULLABLE | 종료시각 (TM_ED) |
| createdAt | TIMESTAMP(3) | DEFAULT NOW | 생성시각 |
| updatedAt | TIMESTAMP(3) | NOT NULL | 수정시각 |

**제약조건**:
- UNIQUE: (regionId, warningType) - 같은 지역의 같은 특보는 하나만 존재

**인덱스**:
- `weather_alerts_regionId_createdAt_idx`: 지역별 최신 특보 조회
- `weather_alerts_warningType_warningLevel_idx`: 특보 종류/수준별 조회
- `weather_alerts_announcedAt_idx`: 발표시각 기준 정렬
- `weather_alerts_upperRegion_idx`: 상위 지역별 그룹핑

**특보 종류 (warningType)**:
- W: 강풍
- R: 호우
- C: 한파
- D: 건조
- O: 해일
- N: 지진해일
- V: 풍랑
- T: 태풍
- S: 대설
- Y: 황사
- H: 폭염
- F: 안개

#### 2. alert_histories (특보 변동 이력)

기상특보의 모든 변동사항을 시계열로 저장합니다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | TEXT | PRIMARY KEY | UUID |
| alertId | TEXT | NULLABLE | WeatherAlert ID 참조 |
| regionId | TEXT | NOT NULL | 지역코드 |
| regionName | TEXT | NOT NULL | 지역명 |
| upperRegion | TEXT | NULLABLE | 상위 지역 |
| warningType | TEXT | NOT NULL | 특보종류 |
| warningLevel | TEXT | NOT NULL | 특보수준 |
| changeType | TEXT | NOT NULL | 변동 유형 |
| previousData | JSONB | NULLABLE | 이전 상태 (JSON) |
| currentData | JSONB | NULLABLE | 현재 상태 (JSON) |
| timestamp | TIMESTAMP(3) | DEFAULT NOW | 변동 발생 시각 |

**변동 유형 (changeType)**:
- NEW: 신규 발표
- RESOLVED: 해제
- LEVEL_UP: 수준 상향 (주의보 → 경보)
- LEVEL_DOWN: 수준 하향 (경보 → 주의보)
- TIME_EXTENDED: 발효시각 연장
- MODIFIED: 내용 변경

**인덱스**:
- `alert_histories_regionId_timestamp_idx`: 지역별 시계열 조회
- `alert_histories_changeType_idx`: 변동 유형별 필터링
- `alert_histories_timestamp_idx`: 시간순 정렬
- `alert_histories_warningType_idx`: 특보 종류별 필터링

#### 3. region_mappings (지역 매핑 캐시)

지역코드와 상위 지역의 매핑 정보를 캐싱합니다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | TEXT | PRIMARY KEY | UUID |
| regionId | TEXT | UNIQUE | 지역코드 |
| regionName | TEXT | NOT NULL | 지역명 |
| upperRegion | TEXT | NOT NULL | 상위 지역 |
| createdAt | TIMESTAMP(3) | DEFAULT NOW | 생성시각 |

**인덱스**:
- `region_mappings_regionId_idx`: 지역코드 검색
- `region_mappings_upperRegion_idx`: 상위 지역별 조회

---

## 로컬 환경 설정

### 1. PostgreSQL 설치 (macOS)

```bash
# Homebrew로 PostgreSQL 15 설치
brew install postgresql@15

# PostgreSQL 서비스 시작
brew services start postgresql@15

# PATH 추가 (선택사항)
echo 'export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 설치 확인
psql --version
# 출력: psql (PostgreSQL) 15.x
```

### 2. 데이터베이스 생성

```bash
# PostgreSQL 접속
psql postgres

# 데이터베이스 생성
CREATE DATABASE ku_weather_dev;

# 사용자 생성 및 권한 부여
CREATE USER ku_weather WITH PASSWORD 'your_secure_password';
ALTER USER ku_weather CREATEDB;  -- Prisma shadow DB를 위해 필요
GRANT ALL PRIVILEGES ON DATABASE ku_weather_dev TO ku_weather;

# 데이터베이스 전환 후 스키마 권한 부여
\c ku_weather_dev
GRANT ALL ON SCHEMA public TO ku_weather;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ku_weather;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ku_weather;

# 연결 확인
\l  -- 데이터베이스 목록
\q  -- 종료
```

### 3. 환경변수 설정

`.env` 파일에 DATABASE_URL 추가:

```env
DATABASE_URL="postgresql://ku_weather:your_secure_password@localhost:5432/ku_weather_dev?schema=public"
```

### 4. Prisma 마이그레이션 실행

```bash
# Prisma Client 생성
npx prisma generate

# 마이그레이션 실행 (테이블 생성)
npx prisma migrate dev

# 데이터베이스 상태 확인
npx prisma studio
# 브라우저에서 http://localhost:5555 접속
```

---

## 서버 환경 설정

### 1. PostgreSQL 설치 (Ubuntu/Debian)

```bash
# PostgreSQL 저장소 추가
sudo apt update
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh

# PostgreSQL 15 설치
sudo apt install -y postgresql-15 postgresql-contrib-15

# 서비스 시작 및 자동 시작 설정
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 상태 확인
sudo systemctl status postgresql
```

### 2. 데이터베이스 및 사용자 생성

```bash
# postgres 사용자로 전환
sudo -u postgres psql

# 데이터베이스 생성
CREATE DATABASE ku_weather_prod;

# 사용자 생성 (강력한 비밀번호 사용)
CREATE USER ku_weather WITH PASSWORD 'very_strong_password_here';
ALTER USER ku_weather CREATEDB;

# 권한 부여
GRANT ALL PRIVILEGES ON DATABASE ku_weather_prod TO ku_weather;

# 데이터베이스 전환
\c ku_weather_prod

# 스키마 권한 부여
GRANT ALL ON SCHEMA public TO ku_weather;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ku_weather;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ku_weather;

# 기본 권한 설정 (향후 생성되는 테이블에도 적용)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ku_weather;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ku_weather;

\q
```

### 3. PostgreSQL 보안 설정

#### 3.1. 방화벽 설정

```bash
# PostgreSQL 포트는 로컬호스트에서만 접근 가능하도록 설정
# (애플리케이션 서버와 DB 서버가 같은 경우)
sudo ufw allow from 127.0.0.1 to any port 5432

# 또는 애플리케이션 서버 IP만 허용 (별도 DB 서버인 경우)
sudo ufw allow from <APP_SERVER_IP> to any port 5432
```

#### 3.2. postgresql.conf 설정

```bash
sudo nano /etc/postgresql/15/main/postgresql.conf
```

```conf
# 연결 설정
listen_addresses = 'localhost'  # 로컬만 허용 (또는 특정 IP)
max_connections = 100           # 최대 연결 수

# 메모리 설정 (서버 사양에 맞게 조정)
shared_buffers = 256MB          # 전체 RAM의 25%
effective_cache_size = 1GB      # 전체 RAM의 50%
work_mem = 16MB                 # 정렬/해시 작업용 메모리

# WAL (Write-Ahead Logging) 설정
wal_level = replica
max_wal_size = 1GB
min_wal_size = 80MB

# 로깅 설정
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_min_duration_statement = 1000  # 1초 이상 걸리는 쿼리 로깅
```

#### 3.3. pg_hba.conf 설정

```bash
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

```conf
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# 로컬 연결
local   all             postgres                                peer
local   all             all                                     peer

# IPv4 로컬 연결
host    ku_weather_prod ku_weather      127.0.0.1/32            md5

# 애플리케이션 서버에서 연결 (필요 시)
# host    ku_weather_prod ku_weather      <APP_SERVER_IP>/32      md5
```

```bash
# 설정 적용
sudo systemctl restart postgresql
```

### 4. 서버 환경변수 설정

스테이징 서버 `.env` 예시:

```env
DATABASE_URL="postgresql://ku_weather:staging_password@localhost:5432/ku_weather_staging?schema=public"
```

프로덕션 서버 `.env` 예시:

```env
DATABASE_URL="postgresql://ku_weather:prod_password@localhost:5432/ku_weather_prod?schema=public"
```

### 5. 프로덕션 마이그레이션 실행

```bash
# 애플리케이션 코드 배포 후

# 프로덕션에서는 migrate deploy 사용 (dev 아님!)
npx prisma migrate deploy

# Prisma Client 생성
npx prisma generate
```

---

## 마이그레이션

### Prisma 마이그레이션 워크플로우

#### 개발 환경 (로컬)

```bash
# 1. schema.prisma 수정
nano prisma/schema.prisma

# 2. 마이그레이션 생성 및 적용
npx prisma migrate dev --name add_new_feature

# 3. Prisma Client 재생성 (자동)
# npx prisma generate (자동 실행됨)
```

#### 프로덕션 환경

```bash
# 1. 코드 배포 (git pull 등)
git pull origin main

# 2. 의존성 설치
npm install

# 3. 마이그레이션 적용 (롤백 불가, 신중하게!)
npx prisma migrate deploy

# 4. Prisma Client 생성
npx prisma generate

# 5. 애플리케이션 재시작
npm run build
pm2 restart ku-weather  # 또는 사용 중인 프로세스 매니저
```

### 수동 DDL 실행 (Prisma 없이)

```sql
-- 1. weather_alerts 테이블
CREATE TABLE "weather_alerts" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "upperRegion" TEXT,
    "warningType" TEXT NOT NULL,
    "warningLevel" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "announcedAt" TIMESTAMP(3) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weather_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "weather_alerts_regionId_createdAt_idx" ON "weather_alerts"("regionId", "createdAt");
CREATE INDEX "weather_alerts_warningType_warningLevel_idx" ON "weather_alerts"("warningType", "warningLevel");
CREATE INDEX "weather_alerts_announcedAt_idx" ON "weather_alerts"("announcedAt");
CREATE INDEX "weather_alerts_upperRegion_idx" ON "weather_alerts"("upperRegion");
CREATE UNIQUE INDEX "weather_alerts_regionId_warningType_key" ON "weather_alerts"("regionId", "warningType");

-- 2. alert_histories 테이블
CREATE TABLE "alert_histories" (
    "id" TEXT NOT NULL,
    "alertId" TEXT,
    "regionId" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "upperRegion" TEXT,
    "warningType" TEXT NOT NULL,
    "warningLevel" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "previousData" JSONB,
    "currentData" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alert_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "alert_histories_regionId_timestamp_idx" ON "alert_histories"("regionId", "timestamp");
CREATE INDEX "alert_histories_changeType_idx" ON "alert_histories"("changeType");
CREATE INDEX "alert_histories_timestamp_idx" ON "alert_histories"("timestamp");
CREATE INDEX "alert_histories_warningType_idx" ON "alert_histories"("warningType");

-- 3. region_mappings 테이블
CREATE TABLE "region_mappings" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "upperRegion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "region_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "region_mappings_regionId_key" ON "region_mappings"("regionId");
CREATE INDEX "region_mappings_regionId_idx" ON "region_mappings"("regionId");
CREATE INDEX "region_mappings_upperRegion_idx" ON "region_mappings"("upperRegion");
```

### 마이그레이션 롤백

```bash
# Prisma는 기본적으로 롤백을 지원하지 않음
# 백업에서 복구하거나 수동으로 이전 상태로 되돌려야 함

# 마이그레이션 히스토리 확인
npx prisma migrate status

# 특정 마이그레이션으로 되돌리기 (수동)
# 1. 백업에서 복구
# 2. 또는 수동으로 DROP/ALTER 실행
```

---

## 백업 및 복구

### 1. 자동 백업 설정 (cron)

```bash
# 백업 스크립트 생성
sudo nano /usr/local/bin/backup-postgres.sh
```

```bash
#!/bin/bash

# 설정
DB_NAME="ku_weather_prod"
DB_USER="ku_weather"
BACKUP_DIR="/backup/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# 백업 디렉토리 생성
mkdir -p $BACKUP_DIR

# 백업 실행
pg_dump -U $DB_USER -d $DB_NAME -F c -f $BACKUP_DIR/${DB_NAME}_${DATE}.backup

# 압축 (선택사항)
gzip $BACKUP_DIR/${DB_NAME}_${DATE}.backup

# 오래된 백업 삭제
find $BACKUP_DIR -name "${DB_NAME}_*.backup.gz" -mtime +$RETENTION_DAYS -delete

# 로그
echo "[$(date)] Backup completed: ${DB_NAME}_${DATE}.backup.gz" >> /var/log/postgres-backup.log
```

```bash
# 실행 권한 부여
sudo chmod +x /usr/local/bin/backup-postgres.sh

# cron 설정 (매일 새벽 2시 백업)
sudo crontab -e
```

```cron
0 2 * * * /usr/local/bin/backup-postgres.sh
```

### 2. 수동 백업

```bash
# 전체 백업
pg_dump -U ku_weather -d ku_weather_prod -F c -f backup_$(date +%Y%m%d).backup

# 압축 백업
pg_dump -U ku_weather -d ku_weather_prod | gzip > backup_$(date +%Y%m%d).sql.gz

# 특정 테이블만 백업
pg_dump -U ku_weather -d ku_weather_prod -t weather_alerts -F c -f weather_alerts_backup.backup
```

### 3. 복구

```bash
# 전체 복구 (데이터베이스 삭제 후 재생성)
dropdb -U ku_weather ku_weather_prod
createdb -U ku_weather ku_weather_prod
pg_restore -U ku_weather -d ku_weather_prod backup_20250128.backup

# 또는 SQL 파일에서 복구
gunzip < backup_20250128.sql.gz | psql -U ku_weather -d ku_weather_prod

# 특정 테이블만 복구
pg_restore -U ku_weather -d ku_weather_prod -t weather_alerts weather_alerts_backup.backup
```

---

## 모니터링

### 1. 데이터베이스 상태 확인

```sql
-- 현재 연결 수
SELECT count(*) FROM pg_stat_activity;

-- 데이터베이스 크기
SELECT pg_size_pretty(pg_database_size('ku_weather_prod'));

-- 테이블 크기
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 인덱스 사용률
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### 2. 성능 모니터링

```sql
-- 느린 쿼리 확인
SELECT
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
  AND state = 'active';

-- 테이블별 통계
SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    n_tup_ins,
    n_tup_upd,
    n_tup_del
FROM pg_stat_user_tables;

-- 데드 튜플 확인
SELECT
    schemaname,
    tablename,
    n_dead_tup,
    n_live_tup,
    round(n_dead_tup::numeric / (n_live_tup + 1), 4) AS dead_ratio
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY dead_ratio DESC;
```

### 3. 로그 모니터링

```bash
# PostgreSQL 로그 확인
sudo tail -f /var/log/postgresql/postgresql-15-main.log

# 느린 쿼리 로그만 필터링
sudo grep "duration:" /var/log/postgresql/postgresql-15-main.log | tail -20
```

### 4. 데이터 통계

```sql
-- 특보 발생 현황
SELECT
    "warningType",
    "warningLevel",
    count(*) as count
FROM weather_alerts
WHERE command != '6'  -- 해제되지 않은 특보만
GROUP BY "warningType", "warningLevel"
ORDER BY count DESC;

-- 일별 특보 변동 통계
SELECT
    DATE("timestamp") as date,
    "changeType",
    count(*) as count
FROM alert_histories
WHERE "timestamp" >= NOW() - INTERVAL '7 days'
GROUP BY DATE("timestamp"), "changeType"
ORDER BY date DESC, count DESC;

-- 지역별 특보 빈도
SELECT
    "upperRegion",
    count(*) as total_alerts
FROM alert_histories
WHERE "changeType" = 'NEW'
  AND "timestamp" >= NOW() - INTERVAL '30 days'
GROUP BY "upperRegion"
ORDER BY total_alerts DESC;
```

---

## 문제 해결

### 1. 연결 실패

**증상**: `connection refused` 또는 `FATAL: database does not exist`

```bash
# PostgreSQL 서비스 상태 확인
sudo systemctl status postgresql

# 서비스 재시작
sudo systemctl restart postgresql

# 데이터베이스 존재 확인
sudo -u postgres psql -c "\l" | grep ku_weather

# 로그 확인
sudo tail -50 /var/log/postgresql/postgresql-15-main.log
```

### 2. 권한 오류

**증상**: `permission denied for schema public`

```sql
-- PostgreSQL 접속
sudo -u postgres psql ku_weather_prod

-- 권한 재부여
GRANT ALL ON SCHEMA public TO ku_weather;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ku_weather;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ku_weather;

-- 기본 권한 설정
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ku_weather;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ku_weather;
```

### 3. 마이그레이션 실패

**증상**: `P3014: Prisma Migrate could not create the shadow database`

```sql
-- CREATEDB 권한 부여
sudo -u postgres psql
ALTER USER ku_weather CREATEDB;
```

### 4. 성능 저하

```sql
-- VACUUM 실행 (데드 튜플 정리)
VACUUM ANALYZE weather_alerts;
VACUUM ANALYZE alert_histories;

-- 인덱스 재생성
REINDEX TABLE weather_alerts;
REINDEX TABLE alert_histories;

-- 테이블 통계 업데이트
ANALYZE weather_alerts;
ANALYZE alert_histories;
```

### 5. 디스크 공간 부족

```bash
# 디스크 사용량 확인
df -h

# PostgreSQL 데이터 디렉토리 크기
sudo du -sh /var/lib/postgresql/15/main

# 오래된 이력 데이터 정리 (애플리케이션 코드 사용)
# DatabaseService.cleanupOldData(365) 호출

# 또는 수동 정리
sudo -u postgres psql ku_weather_prod
DELETE FROM alert_histories WHERE timestamp < NOW() - INTERVAL '1 year';
VACUUM FULL alert_histories;
```

---

## 유지보수

### 1. 정기 작업

#### 매일
- [ ] 백업 확인 (`ls -lh /backup/postgresql`)
- [ ] 로그 확인 (에러 발생 여부)

#### 매주
- [ ] 데이터베이스 크기 모니터링
- [ ] 느린 쿼리 분석
- [ ] 연결 수 확인

#### 매월
- [ ] VACUUM ANALYZE 실행
- [ ] 인덱스 사용률 확인
- [ ] 백업 복구 테스트

### 2. VACUUM 자동화

PostgreSQL의 autovacuum 설정 확인:

```sql
-- autovacuum 설정 확인
SHOW autovacuum;

-- 테이블별 autovacuum 통계
SELECT
    schemaname,
    tablename,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables;
```

### 3. 데이터 정리 정책

애플리케이션 코드에서 정기적으로 실행:

```typescript
// 1년 이상 된 이력 데이터 삭제
await databaseService.cleanupOldData(365);
```

또는 cron으로 직접 실행:

```bash
# 매월 1일 새벽 3시 실행
0 3 1 * * psql -U ku_weather -d ku_weather_prod -c "DELETE FROM alert_histories WHERE timestamp < NOW() - INTERVAL '1 year';"
```

### 4. 성능 최적화

```sql
-- 자주 사용하는 쿼리에 대한 인덱스 추가 (필요 시)
CREATE INDEX idx_custom ON alert_histories ("regionId", "warningType", "timestamp" DESC);

-- 파티셔닝 (데이터가 매우 많을 경우)
-- 월별 파티션 예시
CREATE TABLE alert_histories_2025_01 PARTITION OF alert_histories
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### 5. 모니터링 도구 추가 (선택사항)

- **pgAdmin**: GUI 관리 도구
- **Prometheus + Grafana**: 메트릭 시각화
- **pg_stat_statements**: 쿼리 성능 분석

```sql
-- pg_stat_statements 확장 설치
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 가장 많이 실행된 쿼리 TOP 10
SELECT
    calls,
    total_exec_time,
    mean_exec_time,
    query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;
```

---

## 부록

### A. 유용한 PostgreSQL 명령어

```bash
# 데이터베이스 접속
psql -U ku_weather -d ku_weather_prod

# 데이터베이스 목록
\l

# 테이블 목록
\dt

# 테이블 구조 확인
\d weather_alerts

# 인덱스 목록
\di

# 연결 종료
\q
```

### B. Prisma Studio 사용

```bash
# Prisma Studio 실행 (GUI 데이터 브라우저)
npx prisma studio

# 브라우저에서 http://localhost:5555 접속
# 데이터 조회, 수정, 삭제 가능
```

### C. 환경별 DATABASE_URL

```bash
# 로컬
DATABASE_URL="postgresql://ku_weather:dev_password@localhost:5432/ku_weather_dev?schema=public"

# 스테이징
DATABASE_URL="postgresql://ku_weather:staging_password@localhost:5432/ku_weather_staging?schema=public"

# 프로덕션
DATABASE_URL="postgresql://ku_weather:prod_password@localhost:5432/ku_weather_prod?schema=public"
```

### D. 참고 문서

- [PostgreSQL 공식 문서](https://www.postgresql.org/docs/15/)
- [Prisma 공식 문서](https://www.prisma.io/docs/)
- [PostgreSQL 튜닝 가이드](https://wiki.postgresql.org/wiki/Performance_Optimization)

---

**최종 업데이트**: 2025-01-28
**버전**: 1.0.0

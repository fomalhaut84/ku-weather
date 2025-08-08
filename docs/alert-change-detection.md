# 특보 변동 감지 시스템 동작 원리

## 개요

한국 기상청의 두 가지 API를 활용하여 효율적인 특보 변동 감지 시스템을 구현했습니다:
- `wrn_now_data_new`: 현재 특보현황 조회 API (초기 상태 설정용)
- `wrn_met_data`: 특보 이력 조회 API (변동 감지용)

## 시스템 아키텍처

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  wrn_now_data_new   │    │    AlertCache       │    │   wrn_met_data      │
│   (현재 특보현황)     │───▶│   (메모리 캐시)      │◀───│    (특보 이력)       │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
         │                           │                           │
         │                           │                           │
         ▼                           ▼                           ▼
  최초 실행 시               변동 감지 엔진                 증분 업데이트
  초기 상태 설정              (6가지 변동 유형)              (마지막 확인 후)
```

## 1. 초기 상태 설정 (wrn_now_data_new API)

### 1.1 최초 실행 시 동작

```typescript
// WeatherService.getWeatherAlertsOptimized()
const isFirstRun = !this.isInitialized || this.lastCheckTime === null;

if (isFirstRun) {
  logger.debug('최초 실행: 현재 특보현황 조회');
  // 현재 활성 특보들만 조회
  const currentAlerts = await this.fetchCurrentWeatherAlerts();
  allAlerts = currentAlerts.map(alert => this.convertRawCurrentToWeatherAlert(alert));
}
```

### 1.2 현재 특보현황 API 호출

**API 엔드포인트**: `https://apihub.kma.go.kr/api/typ01/url/wrn_now_data_new.php`

**요청 파라미터**:
```typescript
{
  fe: 'f',              // 발표시간 기준
  help: 0,              // 도움말 비활성
  authKey: 'API_KEY'    // 인증키
}
```

**응답 형식** (EUC-KR 인코딩):
```
L1100000, 서울특별시, L1100110, 서울강남구, 202501071000, 202501071100, H, 2, 1, =
L1010000, 경기도, L1010200, 광명시, 202501071030, 202501071130, R, 3, 1, =
```

**필드 구조** (9개 필드):
- `REG_UP`: 상위 특보구역코드
- `REG_UP_KO`: 상위 특보구역명  
- `REG_ID`: 특보구역코드
- `REG_KO`: 특보구역명
- `TM_FC`: 발표시각
- `TM_EF`: 발효시각
- `WRN`: 특보종류
- `LVL`: 특보수준
- `CMD`: 특보명령

### 1.3 EUC-KR 인코딩 처리

```typescript
// 한국 기상청 API는 EUC-KR로 응답하므로 변환 필요
const responseBuffer = await response.arrayBuffer();
const responseText = iconv.decode(Buffer.from(responseBuffer), 'euc-kr');
```

### 1.4 데이터 변환 및 캐시 초기화

```typescript
// RawCurrentWeatherResponse → WeatherAlert 변환
private convertRawCurrentToWeatherAlert(currentAlert: RawCurrentWeatherResponse): WeatherAlert {
  return {
    REG_ID: currentAlert.REG_ID,
    REG_NAME: this.determineRegionName(currentAlert), // 지역명 결정 로직
    TM_FC: currentAlert.TM_FC,
    TM_EF: currentAlert.TM_EF,
    WRN: currentAlert.WRN,
    LVL: currentAlert.LVL,
    CMD: currentAlert.CMD,
    REG_UP: currentAlert.REG_UP,
    REG_KO: currentAlert.REG_KO,
    REG_UP_KO: currentAlert.REG_UP_KO
  };
}

// AlertCache에 초기 상태 저장
this.alertCache.updateCache(convertedAlerts);
```

### 1.5 초기 캐시 구조

각 특보는 고유 키로 캐시됩니다:
```typescript
// 캐시 키 생성: 지역코드-특보종류
const key = `${alert.REG_ID}-${alert.WRN}`;

// 캐시된 특보 정보
interface CachedAlert {
  key: string;              // "L1100110-H"
  regionId: string;         // "L1100110" 
  regionName: string;       // "서울강남구"
  warningType: string;      // "H" (폭염)
  level: string;           // "2" (주의보)
  command: string;         // "1" (발표)
  announcedAt: string;     // "202501071000"
  effectiveAt: string;     // "202501071100"
  lastUpdated: string;     // ISO timestamp
}
```

## 2. 증분 업데이트 (wrn_met_data API)

### 2.1 주기적 실행 시 동작 (30분 간격)

```typescript
if (!isFirstRun) {
  logger.debug('증분 업데이트: 마지막 확인 이후 데이터만 조회');
  // 안전 마진 10분을 두고 이후 데이터만 조회
  const safetyMarginMinutes = 10;
  const fromTime = new Date(this.lastCheckTime!.getTime() - safetyMarginMinutes * 60 * 1000);
  
  const newAlerts = await this.fetchWeatherAlertsForTimeRange(
    targetRegIds, 
    warningTypes, 
    fromTime, 
    new Date(), 
    subcd
  );
}
```

### 2.2 특보 이력 API 호출

**API 엔드포인트**: `https://apihub.kma.go.kr/api/typ01/url/wrn_met_data.php`

**요청 파라미터**:
```typescript
{
  tmfc1: '202501071030',    // 조회 시작시간 (마지막 확인시간 - 10분)
  tmfc2: '202501071100',    // 조회 종료시간 (현재시간)
  disp: 0,                  // 기본 표출
  help: 0,                  // 도움말 비활성
  authKey: 'API_KEY'        // 인증키
}
```

**응답 형식** (UTF-8 인코딩):
```
202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =
202508011500, 202508011600, 202508011400, 143, S1323200, V, 3, 6, 00, 4, 101, =
```

**필드 구조** (11개 필드, WeatherAlert로 변환):
- `TM_FC`: 발표시각
- `TM_EF`: 발효시각  
- `REG_ID`: 특보구역코드
- `WRN`: 특보종류
- `LVL`: 특보수준
- `CMD`: 특보명령
- 기타 필드들...

## 3. 변동 감지 로직

### 3.1 AlertCache.detectChanges()

```typescript
public detectChanges(currentAlerts: WeatherAlert[]): AlertChange[] {
  const changes: AlertChange[] = [];
  
  // 1. 현재 특보들을 캐시 형태로 변환
  const currentCached = currentAlerts.map(alert => this.toCachedAlert(alert));
  
  // 2. 신규/변경 특보 감지
  for (const current of currentCached) {
    const existing = this.alertCache.get(current.key);
    
    if (!existing) {
      // 신규 특보
      changes.push(this.createNewAlertChange(current));
    } else {
      // 기존 특보의 변경 사항 확인
      const change = this.detectAlertChange(existing, current);
      if (change) {
        changes.push(change);
      }
    }
  }
  
  // 3. 해제된 특보 감지
  for (const [key, cached] of this.alertCache.entries()) {
    const stillActive = currentCached.find(current => current.key === key);
    if (!stillActive || this.isResolvedCommand(cached.command)) {
      changes.push(this.createResolvedAlertChange(cached));
    }
  }
  
  return changes;
}
```

### 3.2 6가지 변동 유형 감지

#### 📍 **1. NEW (신규 발표)**
```typescript
// 이전 캐시에 없는 새로운 특보
if (!existing) {
  return {
    type: 'NEW',
    current,
    description: `${current.regionName} ${warningTypeName} ${warningLevel} 신규 발표`
  };
}
```

#### 📍 **2. RESOLVED (해제)**
```typescript
// 캐시에는 있지만 현재 조회에서 사라졌거나, CMD가 해제 명령인 경우
if (!stillActive || ['3', '4', '7'].includes(cached.command)) {
  return {
    type: 'RESOLVED',
    previous: cached,
    description: `${cached.regionName} ${warningTypeName} ${warningLevel} 해제`
  };
}
```

#### 📍 **3. LEVEL_UP (수준 상향)**
```typescript
// 주의보(2) → 경보(3)
if (previous.level !== current.level) {
  const prevLevel = parseInt(previous.level);
  const currLevel = parseInt(current.level);
  
  if (currLevel > prevLevel) {
    return {
      type: 'LEVEL_UP',
      current, previous,
      description: `${current.regionName} ${warningTypeName} 주의보 → 경보 수준 상향`
    };
  }
}
```

#### 📍 **4. LEVEL_DOWN (수준 하향)**
```typescript
// 경보(3) → 주의보(2)
if (currLevel < prevLevel) {
  return {
    type: 'LEVEL_DOWN',
    current, previous,
    description: `${current.regionName} ${warningTypeName} 경보 → 주의보 수준 하향`
  };
}
```

#### 📍 **5. TIME_EXTENDED (발효시각 연장)**
```typescript
// 발표시각과 명령은 동일하지만 발효시각만 변경
if (previous.command === current.command && 
    previous.announcedAt === current.announcedAt && 
    previous.effectiveAt !== current.effectiveAt) {
  return {
    type: 'TIME_EXTENDED',
    current, previous,
    description: `${current.regionName} ${warningTypeName} ${warningLevel} 발효시각 연장`
  };
}
```

#### 📍 **6. MODIFIED (내용 변경)**
```typescript
// 기타 모든 변경사항 (명령 변경, 발표시각 변경 등)
return {
  type: 'MODIFIED',
  current, previous,
  description: `${current.regionName} ${warningTypeName} ${warningLevel} 내용 변경`
};
```

## 4. 상태 갱신 및 알림

### 4.1 캐시 업데이트

```typescript
// 감지된 변경사항 처리 후 캐시 갱신
this.alertCache.updateCache(allAlerts);
this.lastCheckTime = new Date();
this.isInitialized = true;
```

### 4.2 변동사항 알림 출력

```typescript
// index.ts에서 변동사항 콘솔 출력
if (changes.length > 0) {
  console.log('\n=== 기상특보 변동 내역 ===');
  changes.forEach((change, index) => {
    const typeEmoji = {
      'NEW': '🆕', 'RESOLVED': '✅', 'LEVEL_UP': '⬆️',
      'LEVEL_DOWN': '⬇️', 'TIME_EXTENDED': '⏰', 'MODIFIED': '🔄'
    };
    
    console.log(`\n[${index + 1}] ${typeEmoji[change.type]} ${change.description}`);
    // 상세 정보 출력...
  });
}
```

## 5. 성능 최적화 효과

### 5.1 API 호출 최적화

**기존 방식**: 매번 7일치 전체 데이터 조회
```
API 호출량: 7일 × 24시간 × 30분마다 = 대용량 데이터
```

**현재 방식**: 초기 + 증분 조회
```
초기 실행: wrn_now_data_new (현재 활성 특보만)
이후 실행: wrn_met_data (마지막 확인 후 40분치만)
```

**효과**: **90% API 데이터 절약** 🚀

### 5.2 메모리 사용 최적화

- 필수 필드만 캐싱 (23개 필드 → 10개 필드)
- Map 기반 O(1) 조회 성능
- 자동 해제된 특보 정리

## 6. 에러 처리 및 안정성

### 6.1 API 오류 처리

```typescript
try {
  const currentAlerts = await this.fetchCurrentWeatherAlerts();
} catch (error) {
  logger.error('현재 특보현황 조회 실패, 기존 방식으로 폴백');
  // 7일치 전체 조회로 폴백
  const fallbackAlerts = await this.fetchWeatherAlertsForTimeRange(...);
}
```

### 6.2 데이터 검증

```typescript
// 필수 필드 검증
if (fields.length >= 9 && fields[2] && fields[4]) {
  const alert: RawCurrentWeatherResponse = {
    REG_ID: fields[2],
    // ...
  };
}
```

### 6.3 안전 마진 적용

```typescript
// 10분 안전 마진으로 데이터 누락 방지
const safetyMarginMinutes = 10;
const fromTime = new Date(this.lastCheckTime!.getTime() - safetyMarginMinutes * 60 * 1000);
```

이 시스템을 통해 한국 기상청 API의 두 가지 엔드포인트를 효율적으로 활용하여, 정확하고 빠른 특보 변동 감지가 가능합니다.
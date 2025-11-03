# ku-weather REST API Documentation

## 개요

ku-weather는 기상특보 데이터를 데이터베이스에서 조회할 수 있는 REST API를 제공합니다.

**Base URL**: `http://localhost:3000` (기본 포트, `SERVER_PORT` 환경변수로 변경 가능)

---

## 인증

현재 버전에서는 인증이 필요하지 않습니다. (향후 추가 예정)

---

## 엔드포인트

### 1. Health Check

서버 상태를 확인합니다.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-11-03T05:30:00.000Z",
  "environment": "development",
  "uptime": 12345.678
}
```

---

### 2. API 정보

사용 가능한 API 엔드포인트 목록을 반환합니다.

**Endpoint**: `GET /api`

**Response**:
```json
{
  "message": "ku-weather API Server",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "telegram": "/telegram/webhook",
    "alerts": "/api/alerts (cache-based)",
    "alertsCurrent": "/api/alerts/current (database)",
    "alertsHistory": "/api/alerts/history?startDate={ISO8601}&endDate={ISO8601}",
    "alertsStatistics": "/api/alerts/statistics?startDate={ISO8601}&endDate={ISO8601}&groupBy={region|warningType|level}",
    "alertsFiltered": "/api/alerts?region={regionId}&type={warningType}",
    "subscriptions": "/api/subscriptions/{token}"
  }
}
```

---

### 3. 현재 특보 조회 (데이터베이스)

데이터베이스에서 현재 발효 중인 기상특보를 조회합니다.

**Endpoint**: `GET /api/alerts/current`

**Query Parameters**:
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `regionId` | string | No | 지역코드 | `L1100000` (서울) |
| `warningType` | string | No | 특보종류 | `W` (강풍), `R` (호우), `H` (폭염) 등 |
| `warningLevel` | string | No | 특보수준 | `1` (예비), `2` (주의보), `3` (경보) |
| `upperRegion` | string | No | 상위지역 | `서울특별시`, `경기도` 등 |

**특보종류 코드**:
- `W`: 강풍
- `R`: 호우
- `C`: 한파
- `D`: 건조
- `O`: 해일
- `N`: 지진해일
- `V`: 풍랑
- `T`: 태풍
- `S`: 대설
- `Y`: 황사
- `H`: 폭염
- `F`: 안개

**Request Example**:
```bash
# 모든 현재 특보 조회
curl http://localhost:3000/api/alerts/current

# 서울 지역 특보만 조회
curl http://localhost:3000/api/alerts/current?regionId=L1100000

# 경기도 호우 경보만 조회
curl "http://localhost:3000/api/alerts/current?upperRegion=경기도&warningType=R&warningLevel=3"
```

**Response**:
```json
{
  "success": true,
  "count": 2,
  "filters": {
    "regionId": "L1100000",
    "warningType": "W",
    "warningLevel": "2",
    "upperRegion": "서울특별시"
  },
  "data": [
    {
      "id": "uuid-1",
      "regionId": "L1100000",
      "regionName": "서울특별시",
      "upperRegion": "서울특별시",
      "warningType": "W",
      "warningLevel": "2",
      "command": "1",
      "announcedAt": "2025-01-01T00:00:00.000Z",
      "effectiveAt": "2025-01-01T01:00:00.000Z",
      "endTime": null,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Invalid warningType. Must be one of: W|R|C|D|O|N|V|T|S|Y|H|F"
}
```

---

### 4. 특보 이력 조회

데이터베이스에서 특보 변동 이력을 조회합니다.

**Endpoint**: `GET /api/alerts/history`

**Query Parameters**:
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `startDate` | string (ISO 8601) | **Yes** | 조회 시작 날짜 | `2025-01-01T00:00:00Z` |
| `endDate` | string (ISO 8601) | **Yes** | 조회 종료 날짜 | `2025-01-31T23:59:59Z` |
| `regionId` | string | No | 지역코드 | `L1100000` |
| `warningType` | string | No | 특보종류 | `W`, `R`, `H` 등 |
| `changeType` | string | No | 변동 유형 | `NEW`, `RESOLVED`, `LEVEL_UP`, `LEVEL_DOWN`, `TIME_EXTENDED`, `MODIFIED` |

**Request Example**:
```bash
# 1월 전체 이력 조회
curl "http://localhost:3000/api/alerts/history?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z"

# 서울 지역 신규 특보만 조회
curl "http://localhost:3000/api/alerts/history?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z&regionId=L1100000&changeType=NEW"
```

**Response**:
```json
{
  "success": true,
  "count": 5,
  "filters": {
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-01-31T23:59:59.000Z",
    "regionId": "L1100000",
    "warningType": null,
    "changeType": "NEW"
  },
  "data": [
    {
      "id": "uuid-1",
      "regionId": "L1100000",
      "regionName": "서울특별시",
      "upperRegion": "서울특별시",
      "warningType": "W",
      "warningLevel": "2",
      "changeType": "NEW",
      "previousData": null,
      "currentData": {
        "regionId": "L1100000",
        "regionName": "서울특별시",
        "warningType": "W",
        "level": "2",
        "command": "1"
      },
      "timestamp": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Missing required parameters: startDate and endDate"
}
```

```json
{
  "success": false,
  "error": "startDate must be before endDate"
}
```

---

### 5. 특보 통계 조회

데이터베이스에서 특보 발생 빈도 통계를 조회합니다.

**Endpoint**: `GET /api/alerts/statistics`

**Query Parameters**:
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `startDate` | string (ISO 8601) | **Yes** | 조회 시작 날짜 | `2025-01-01T00:00:00Z` |
| `endDate` | string (ISO 8601) | **Yes** | 조회 종료 날짜 | `2025-01-31T23:59:59Z` |
| `groupBy` | string | **Yes** | 그룹핑 기준 | `region`, `warningType`, `level` |

**Request Example**:
```bash
# 지역별 통계
curl "http://localhost:3000/api/alerts/statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z&groupBy=region"

# 특보 종류별 통계
curl "http://localhost:3000/api/alerts/statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z&groupBy=warningType"

# 특보 수준별 통계
curl "http://localhost:3000/api/alerts/statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z&groupBy=level"
```

**Response** (groupBy=region):
```json
{
  "success": true,
  "count": 3,
  "filters": {
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-01-31T23:59:59.000Z",
    "groupBy": "region"
  },
  "data": [
    {
      "upperRegion": "서울특별시",
      "_count": {
        "id": 25
      }
    },
    {
      "upperRegion": "경기도",
      "_count": {
        "id": 18
      }
    },
    {
      "upperRegion": "강원도",
      "_count": {
        "id": 32
      }
    }
  ]
}
```

**Response** (groupBy=warningType):
```json
{
  "success": true,
  "count": 4,
  "filters": {
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-01-31T23:59:59.000Z",
    "groupBy": "warningType"
  },
  "data": [
    {
      "warningType": "W",
      "_count": {
        "id": 45
      }
    },
    {
      "warningType": "R",
      "_count": {
        "id": 20
      }
    },
    {
      "warningType": "H",
      "_count": {
        "id": 10
      }
    }
  ]
}
```

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Invalid groupBy. Must be one of: region|warningType|level"
}
```

---

### 6. 현재 특보 조회 (캐시 기반)

메모리 캐시에서 현재 활성 특보를 조회합니다. (기존 엔드포인트, 데이터베이스를 거치지 않음)

**Endpoint**: `GET /api/alerts`

**Query Parameters**:
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `region` | string | No | 지역코드 또는 지역명 | `L1100000`, `서울` |
| `type` | string | No | 특보종류 | `W`, `R`, `H` 등 |

**Request Example**:
```bash
curl http://localhost:3000/api/alerts
curl "http://localhost:3000/api/alerts?region=서울&type=W"
```

**Response**:
```json
{
  "success": true,
  "count": 1,
  "alerts": [
    {
      "regionId": "L1100000",
      "regionName": "서울특별시",
      "upperRegion": "서울특별시",
      "warningType": "W",
      "level": "2",
      "command": "1",
      "announcedAt": "202501010000",
      "effectiveAt": "202501010100",
      "endTime": null
    }
  ],
  "lastUpdated": "2025-01-01T00:00:00.000Z",
  "filters": {
    "region": "서울",
    "warningType": "W"
  }
}
```

---

## 에러 코드

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request (잘못된 파라미터) |
| 404 | Not Found (존재하지 않는 엔드포인트) |
| 500 | Internal Server Error (서버 오류) |

---

## 사용 예시

### Python 예제

```python
import requests
from datetime import datetime, timedelta

# 현재 특보 조회
response = requests.get('http://localhost:3000/api/alerts/current')
alerts = response.json()
print(f"현재 {alerts['count']}개의 특보가 발효 중입니다.")

# 최근 7일 이력 조회
end_date = datetime.now()
start_date = end_date - timedelta(days=7)

response = requests.get('http://localhost:3000/api/alerts/history', params={
    'startDate': start_date.isoformat() + 'Z',
    'endDate': end_date.isoformat() + 'Z'
})
history = response.json()
print(f"최근 7일간 {history['count']}건의 특보 변동이 있었습니다.")

# 지역별 통계
response = requests.get('http://localhost:3000/api/alerts/statistics', params={
    'startDate': start_date.isoformat() + 'Z',
    'endDate': end_date.isoformat() + 'Z',
    'groupBy': 'region'
})
stats = response.json()
for item in stats['data']:
    print(f"{item['upperRegion']}: {item['_count']['id']}건")
```

### JavaScript (Node.js) 예제

```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:3000';

// 현재 특보 조회
async function getCurrentAlerts() {
  const response = await axios.get(`${API_BASE}/api/alerts/current`);
  console.log(`현재 ${response.data.count}개의 특보가 발효 중입니다.`);
  return response.data.data;
}

// 특정 지역 호우 경보 조회
async function getRainAlerts(region) {
  const response = await axios.get(`${API_BASE}/api/alerts/current`, {
    params: {
      upperRegion: region,
      warningType: 'R',
      warningLevel: '3'
    }
  });
  return response.data.data;
}

// 실행
getCurrentAlerts();
getRainAlerts('경기도');
```

---

## 웹 대시보드 개발 가이드

웹 대시보드를 개발할 때 다음 API들을 활용하세요:

1. **실시간 현황 표시**: `GET /api/alerts/current`
   - 페이지 로드 시 호출
   - 5-10분 간격으로 자동 갱신

2. **이력 조회**: `GET /api/alerts/history`
   - 사용자가 날짜 범위를 선택하면 호출
   - 타임라인 UI에 표시

3. **통계 차트**: `GET /api/alerts/statistics`
   - 대시보드 하단에 Chart.js 등으로 시각화
   - 지역별, 특보별, 수준별 통계 제공

---

## 환경 설정

API 서버를 활성화하려면 `.env` 파일에 다음 환경변수를 추가하세요:

```env
# HTTP 서버 설정
SERVER_ENABLED=true
SERVER_PORT=3000
CORS_ORIGIN=*

# Telegram Webhook (선택)
TELEGRAM_WEBHOOK_SECRET=your-secret-token
```

---

## 문의 및 기여

- GitHub Issues: https://github.com/fomalhaut84/ku-weather/issues
- Pull Requests: 환영합니다!

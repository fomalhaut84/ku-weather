# 한국 기상청 기상특보 모니터링 시스템

한국 기상청 공공API를 활용하여 특정 지역의 기상특보 정보를 모니터링하고, 특보 또는 예비특보 발생 시 슬랙으로 알림을 전송하는 Node.js 기반 프로젝트입니다.

## 설치 및 설정

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env.example` 파일을 참고하여 `.env` 파일을 생성하고 다음 값들을 설정하세요:

```bash
# 한국 기상청 공공데이터 API 키 (필수)
WEATHER_API_KEY=your_actual_api_key_here

# Slack 웹훅 URL (필수)  
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/ACTUAL/WEBHOOK

# 모니터링할 지역 코드 (선택사항, 빈 값이면 전국)
TARGET_REGION_IDS=11B00000,21F20501

# 체크 간격 (분 단위, 기본값: 30)
CHECK_INTERVAL_MINUTES=30

# 개발 모드
NODE_ENV=development

# 디버그 로그 출력
DEBUG=true
```

#### API 키 획득 방법:
1. [기상청 API Hub](https://apihub.kma.go.kr/)에 회원가입
2. 원하는 API 서비스 활용신청 (기상특보 관련 API)
3. 승인 후 받은 인증키를 `WEATHER_API_KEY`에 설정

**중요**: API 사용을 위해서는 기상청 API Hub에서 별도의 활용신청 승인이 필요합니다.

#### Slack 웹훅 설정:
1. Slack 워크스페이스에서 [Incoming Webhooks](https://api.slack.com/messaging/webhooks) 생성
2. 받은 웹훅 URL을 `SLACK_WEBHOOK_URL`에 설정

### 3. 빌드 및 실행
```bash
# 빌드
npm run build

# 실행
npm start
```

## 주요 기능

- 🌦️ 한국 기상청 기상특보 실시간 모니터링
- 📱 Slack을 통한 즉시 알림
- 🗺️ 지역별 필터링 지원
- ⏰ 설정 가능한 모니터링 주기
- 📊 상세한 로깅 및 디버그 모드

## 지역 코드 예시

- `11B00000`: 서울특별시
- `21F20501`: 부산광역시  
- `27H00000`: 제주특별자치도
- `41A00000`: 경기도
- `42A00000`: 강원도

전체 지역 코드는 [기상청 공공API 문서](https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15056912)를 참고하세요.

## 프로젝트 구조

```
src/
├── config/           # 환경 설정 관리
├── services/         # 외부 API 서비스
│   ├── weatherService.ts  # 기상청 API 연동
│   └── slackService.ts    # Slack 알림 서비스  
├── types/           # TypeScript 타입 정의
├── utils/           # 유틸리티 함수
└── index.ts         # 메인 애플리케이션
```

## 라이센스

MIT
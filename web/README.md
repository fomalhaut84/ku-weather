# 기상특보 현황 웹 대시보드

실시간 기상특보 현황을 확인하고 개인별 알림 설정을 관리하는 Next.js 기반 웹 대시보드입니다.

## 🚀 시작하기

### 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3001](http://localhost:3001)을 열어 확인하세요.

> **참고**: Next.js는 포트 3001에서 실행됩니다. 백엔드 API 서버는 포트 3000을 사용합니다.

### 빌드

```bash
npm run build
npm run start
```

## 📋 주요 기능

### Phase 1 (MVP) ✅
- [x] 실시간 특보 현황 페이지
- [x] 개인별 구독 설정 관리 페이지
- [x] 통합 토큰 기반 인증 (30일 DB 토큰)
- [x] 다중 플랫폼 연동 (Slack, Telegram, Email)
- [ ] 모바일 반응형 디자인

### Phase 2 (고도화) ✅
- [x] 한국 지도 시각화 (Leaflet)
- [x] 차트 및 통계 분석 (Chart.js)
- [x] WebSocket 실시간 업데이트 구조
- [x] 브라우저 알림 (Notification API)

## 🛠️ 기술 스택

- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Visualization**: Chart.js, Leaflet
- **Real-time**: Socket.io-client
- **API**: REST + WebSocket

## 📁 프로젝트 구조

```
web/
├── app/                # Next.js App Router
│   ├── layout.tsx      # 루트 레이아웃
│   ├── page.tsx        # 홈페이지
│   ├── dashboard/      # 특보 현황 페이지 (지도, 차트, 실시간 업데이트)
│   └── settings/       # 구독 설정 페이지
├── components/         # React 컴포넌트
│   ├── MapView.tsx     # Leaflet 지도 시각화
│   ├── ChartView.tsx   # Chart.js 통계 차트
│   └── NotificationManager.tsx  # 브라우저 알림 관리
├── hooks/              # Custom React Hooks
│   └── useWebSocket.ts # WebSocket 연결 관리
├── lib/                # 유틸리티 및 API 함수
│   └── api.ts          # 백엔드 API 클라이언트
├── types/              # TypeScript 타입 정의
└── public/             # 정적 파일
```

## ✨ Phase 2 주요 기능 상세

### 🗺️ 한국 지도 시각화
- 17개 광역시도 좌표 매핑
- 특보 수준별 색상 구분 (정상/예비특보/주의보/경보)
- 인터랙티브 마커 (클릭 시 지역 필터링)
- 툴팁으로 발효 중인 특보 목록 표시

### 📊 차트 및 통계 분석
- **특보 종류별 발생 현황**: Bar Chart
- **특보 수준별 분포**: Pie Chart
- **지역별 Top 10**: Horizontal Bar Chart
- **통계 요약**: 총 발생 건수, 가장 많은 특보/지역
- **기간 선택**: 최근 7일 / 30일

### ⚡ 실시간 업데이트
- Socket.io 기반 WebSocket 연결
- 새로운 특보 자동 추가
- 해제된 특보 자동 제거
- 연결 상태 실시간 표시
- 폴링 모드 자동 폴백

### 🔔 브라우저 알림
- Notification API 활용
- 새로운 특보 발생 시 즉시 알림
- 알림 클릭 시 해당 지역 대시보드 이동
- 권한 관리 및 안내 메시지

## 🔗 연관 이슈

- **Issue #67**: 데이터베이스 연동 (완료)
- **Issue #23**: 다중 플랫폼 알림 시스템 (Phase 1 완료)
- **Issue #26**: 웹 대시보드 개발
  - Phase 1: MVP 완료 (PR #77 머지됨)
  - Phase 2: 고도화 완료 (현재 PR)

## 📝 환경 변수

`.env.local` 파일을 생성하고 다음 변수를 설정하세요:

```env
# 백엔드 API 서버 주소 (포트 3000)
NEXT_PUBLIC_API_URL=http://localhost:3000
BACKEND_URL=http://localhost:3000
```

### 포트 구성

- **웹 대시보드 (Next.js)**: `http://localhost:3001`
- **백엔드 API 서버**: `http://localhost:3000`

## 🤖 Generated with Claude Code

https://claude.com/claude-code

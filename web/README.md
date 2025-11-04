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

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 빌드

```bash
npm run build
npm run start
```

## 📋 주요 기능

### Phase 1 (MVP)
- [ ] 실시간 특보 현황 페이지
- [ ] 개인별 구독 설정 관리 페이지
- [ ] 통합 토큰 기반 인증
- [ ] 다중 플랫폼 연동 (Slack, Telegram, Email)
- [ ] 모바일 반응형 디자인

### Phase 2 (고도화)
- [ ] 한국 지도 시각화
- [ ] 차트 및 통계 분석
- [ ] WebSocket 실시간 업데이트
- [ ] 브라우저 알림

## 🛠️ 기술 스택

- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Query, Zustand
- **Charts**: Chart.js
- **Maps**: Leaflet

## 📁 프로젝트 구조

```
web/
├── app/              # Next.js App Router
│   ├── layout.tsx    # 루트 레이아웃
│   ├── page.tsx      # 홈페이지
│   ├── dashboard/    # 특보 현황 페이지
│   └── settings/     # 구독 설정 페이지
├── components/       # React 컴포넌트
├── lib/              # 유틸리티 함수
└── public/           # 정적 파일
```

## 🔗 연관 이슈

- **Issue #67**: 데이터베이스 연동 (완료)
- **Issue #23**: 다중 플랫폼 알림 시스템 (Phase 1 완료)
- **Issue #26**: 웹 대시보드 개발 (진행 중)

## 📝 환경 변수

`.env.local` 파일을 생성하고 다음 변수를 설정하세요:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
BACKEND_URL=http://localhost:3000
```

## 🤖 Generated with Claude Code

https://claude.com/claude-code

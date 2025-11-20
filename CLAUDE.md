# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고할 가이드를 제공합니다.

## 작업 규칙 (Work Rules)

### 기본 원칙
- **대화 언어**: 모든 대화는 한국어로 진행
- **기본 브랜치**: 특별한 언급이 없는 한 모든 PR의 base 브랜치는 `dev`
- **코드 리뷰**: Codex CLI를 사용한 로컬 리뷰 우선

### PR 생성 워크플로우
1. 피처 브랜치 생성 및 작업 완료
2. **로컬에서 Codex 리뷰 실행**: Claude Code에서 `@codex-cli 현재 브랜치의 모든 변경사항을 리뷰해줘` 요청
3. 리뷰 피드백 반영 및 수정
4. `dev` 브랜치를 base로 PR 생성 및 푸시
5. **GitHub에서 Codex 리뷰 자동 실행** (PR 생성 시)
6. **Codex 피드백 반영**: 커밋 메시지에 `@codex` 멘션하여 자동 리뷰 트리거
7. PR 승인 및 머지

### Codex CLI 사용법

#### 기본 리뷰 명령어
```bash
# 현재 브랜치의 모든 변경사항 리뷰
codex review

# 특정 파일만 리뷰
codex review src/server.ts

# 특정 디렉토리 리뷰
codex review src/services/notifications/

# 커밋 범위 지정 리뷰
codex review HEAD~3..HEAD
```

#### PR 생성 후 워크플로우
```bash
# 1. 브랜치 생성 및 작업
git checkout -b feature/new-feature
# ... 코딩 작업 ...

# 2. 로컬 Codex 리뷰
# Claude Code에서 "@codex-cli 현재 브랜치의 모든 변경사항을 리뷰해줘" 요청

# 3. 피드백 반영 후 PR 생성
gh pr create --base dev --title "..." --body "..."

# 4. GitHub에서 Codex가 자동으로 PR 리뷰 시작

# 5. Codex 피드백 반영 시 커밋 메시지에 @codex 멘션
git commit -m "fix: [문제 설명]

@codex 해당 피드백 반영 완료. 다시 리뷰 부탁드립니다.

[변경사항 설명]
"
git push  # 자동으로 Codex 리뷰 트리거됨

# 6. 머지
gh pr merge <PR_NUMBER>
```

#### 로컬 PR 리뷰 (선택사항)
```bash
# PR 번호로 로컬 리뷰 실행 (예: PR #53)
codex review --pr 53
```

#### Codex 피드백 반영 워크플로우

**GitHub PR에서 Codex 피드백을 받은 경우**:

```bash
# 1. Codex 피드백 확인
gh pr view <PR_NUMBER> --comments

# 2. 피드백 반영 및 수정
# ... 코드 수정 ...

# 3. 테스트 실행
npm test

# 4. 커밋 메시지에 @codex 멘션
git add .
git commit -m "fix: [Codex 피드백 내용 요약]

@codex 해당 피드백 반영 완료. 다시 리뷰 부탁드립니다.

## 변경사항
- [구체적인 수정 내용 1]
- [구체적인 수정 내용 2]

## 테스트 결과
✓ [관련 테스트] 통과
"

# 5. Push (자동으로 Codex 리뷰 트리거)
git push
```

**장점**:
- ✅ 별도의 `gh pr comment` 명령어 불필요
- ✅ 커밋 히스토리에 피드백 반영 내역이 명확히 남음
- ✅ Push와 동시에 Codex 리뷰 자동 트리거
- ✅ 리뷰 컨텍스트가 커밋과 함께 보존됨

#### 고급 옵션
```bash
# 상세한 리뷰 (보안, 성능, 베스트 프랙티스)
codex review --detailed

# 리뷰 결과를 파일로 저장
codex review --output review-report.md

# 브랜치 간 diff 리뷰
codex review main..dev
```

## 프로젝트 개요

한국 기상청 공공API를 활용하여 특정 지역의 기상특보 정보를 모니터링하고, 특보 또는 예비특보 발생 시 다중 플랫폼으로 알림을 전송하는 Node.js 기반 프로젝트입니다.

**현재 버전**: v2.0.0-rc (Release Candidate)
**안정성**: 프로덕션 환경 검증 완료
**주요 업데이트**: 웹 대시보드 구현, 데이터베이스 연동, 360개 테스트

**완료된 기능들의 상세 내용은 [CLAUDE-COMPLETE.md](./CLAUDE-COMPLETE.md)를 참조하세요.**

## 개발 명령어

- `npm run build` - TypeScript 소스코드를 JavaScript로 컴파일
- `npm run start` - 컴파일된 애플리케이션 실행
- `npm test` - 단위 테스트 실행 (**360개 테스트**, 39%+ 커버리지)
- `npm run test:watch` - 테스트 감시 모드 실행
- `npm run test:coverage` - 커버리지 리포트 포함 테스트 실행
- `npm run test:ci` - CI/CD용 테스트 실행
- `cd web && npm run dev` - 웹 대시보드 개발 서버 실행 (포트 3001)
- `cd web && npm run build` - 웹 대시보드 프로덕션 빌드

## 프로젝트 구조

```
src/
├── __tests__/        # 백엔드 테스트 파일 (360개 단위 테스트)
│   ├── config/       # Config 모듈 테스트 (21개, 100% 커버리지)
│   ├── services/     # 서비스 모듈 테스트
│   │   ├── alertCache.test.ts    # AlertCache 테스트 (종합 테스트 포함)
│   │   ├── slackService.test.ts  # SlackService 테스트 (배치 전송 포함)
│   │   ├── weatherService.test.ts # WeatherService 테스트 (통합 시나리오 포함)
│   │   ├── notifications/        # 다중 플랫폼 알림 테스트
│   │   ├── subscriptions/        # 하이브리드 구독 관리 테스트
│   │   └── routes/               # REST API 라우트 테스트
│   ├── types/        # Types 모듈 테스트 (100% 커버리지)
│   └── utils/        # 유틸리티 테스트 (100% 커버리지)
├── config/           # 환경 설정 관리
├── services/         # 핵심 서비스
│   ├── WeatherService.ts      # 기상청 API 연동
│   ├── DatabaseService.ts     # PostgreSQL + Prisma 연동
│   ├── AlertCache.ts          # 특보 변동 감지 캐시
│   ├── notifications/         # 다중 플랫폼 알림 시스템
│   └── subscriptions/         # 하이브리드 구독 관리 시스템
├── routes/           # REST API 라우트
│   ├── alertRoutes.ts         # 특보 조회 API
│   └── subscriptionRoutes.ts  # 구독 관리 API
├── types/            # TypeScript 타입 정의
├── utils/            # 유틸리티 함수 (로거 등)
├── server.ts         # Express 서버 (API + WebSocket)
└── index.ts          # 메인 애플리케이션 진입점

web/                  # Next.js 웹 대시보드 (v15.1.6)
├── app/              # App Router 페이지
│   ├── dashboard/    # 실시간 특보 현황
│   └── settings/     # 구독 설정 관리
├── components/       # React 컴포넌트
│   ├── MapView.tsx              # Leaflet 지도 시각화
│   ├── ChartView.tsx            # Chart.js 통계 차트
│   ├── AdvancedChartView.tsx    # 월별/계절별/연도별 차트
│   ├── HeatmapView.tsx          # 히트맵 3종
│   ├── WeatherForecastCard.tsx  # 날씨 예보 카드
│   └── NotificationManager.tsx  # 브라우저 알림
├── lib/              # 유틸리티 및 API 클라이언트
└── hooks/            # React Hooks
```

## 현재 상태

### ✅ 완료된 핵심 기능들
- ✅ **웹 대시보드 (Issue #26)** - 90% 완료
  - Phase 1 MVP: 실시간 특보 현황, 필터링 시스템
  - Phase 2 고도화: 지도/차트, WebSocket 실시간 업데이트, 브라우저 알림
  - Phase 3 엔터프라이즈: 히트맵 3종, 날씨 예보 API 연동, 고급 통계 차트
  - 남은 작업: 구독 설정 관리 페이지, 사용자 인증 강화
- ✅ **데이터베이스 연동 (Issue #67)** - 100% 완료
  - PostgreSQL + Prisma ORM
  - REST API: `/api/alerts/current`, `/history`, `/statistics`, `/forecast/:regionId`
  - DB 동기화 및 성능 최적화 완료
- ✅ **완전한 테스트 프레임워크** (Jest, **360개 테스트**, 39%+ 커버리지)
- ✅ **Slack 배치 메시지 전송 시스템** (95% 메시지 수 감소)
- ✅ **특보 변동 감지 시스템** (AlertCache 기반, CMD 기반 해제 로직)
- ✅ **다중 플랫폼 알림 시스템** (Telegram, Discord, Email 인터페이스 구현)
- ✅ **하이브리드 구독 관리 시스템** (개인별 맞춤 구독)
- ✅ **WebSocket 실시간 업데이트** (Socket.io)
- ✅ **프로덕션 급 품질 보증** (모든 핵심 모듈 철저한 테스트)

*상세 내용은 [CLAUDE-COMPLETE.md](./CLAUDE-COMPLETE.md) 참조*

## 🚨 **최근 완료 작업** (2025년 11월 3-7일)

### **웹 대시보드 Phase 1-3 및 데이터베이스 연동 완료**

**GitHub 이슈 #26**의 대부분이 완료되었습니다. 5일간 10개 PR을 연속으로 머지하며 웹 대시보드를 구축했습니다.

#### **완료된 PR (11/3 - 11/7)**
- ✅ **PR #76** (11/3): 데이터베이스 연동 (PostgreSQL + Prisma)
- ✅ **PR #77** (11/5): 웹 대시보드 Phase 1 MVP 완료
- ✅ **PR #78** (11/5): Next.js 포트 3001로 변경
- ✅ **PR #79** (11/6): Phase 2 고도화 (지도/차트/실시간)
- ✅ **PR #80** (11/6): WebSocket 실시간 특보 업데이트
- ✅ **PR #81** (11/6): 현재 특보 표시 버그 수정
- ✅ **PR #82** (11/6): 환경별 대시보드 URL 설정
- ✅ **PR #83** (11/6): DB 동기화 안정성 개선
- ✅ **PR #84** (11/7): 고급 통계 차트 (월별/계절별/연도별)
- ✅ **PR #85** (11/7): Phase 3 고급 기능 (히트맵, 날씨 API)

#### **주요 기능**
- ✅ **실시간 특보 현황 대시보드**: Leaflet 지도 + Chart.js 차트
- ✅ **WebSocket 실시간 업데이트**: 새로고침 없이 즉시 반영
- ✅ **히트맵 3종**: 지역×시간, 월×지역, 특보×지역
- ✅ **날씨 예보 통합**: 기상청 단기예보 API 연동
- ✅ **데이터베이스 완전 연동**: PostgreSQL + REST API

#### **개선 효과**
- ✅ **360개 테스트 통과** (177개 → 360개, +103% 증가)
- ✅ **웹 대시보드 90% 완료** - 프로덕션 준비 완료
- ✅ **데이터베이스 기반 분석** - 특보 이력 및 통계 제공
- ✅ **실시간 사용자 경험** - WebSocket + 브라우저 알림

## 향후 개발 계획

### 🔄 TODO: GitHub Issue #23 - 다중 플랫폼 알림 시스템 완료 (Phase 2-5)

#### 현재 상태
- ✅ **Phase 1 완료**: 아키텍처 리팩토링 및 하이브리드 구독 시스템
- ✅ **Phase 2 (90% 완료)**: Telegram Bot 인터페이스 완료, 실제 API 연결만 남음
- ❌ **Phase 3**: Discord Webhook 연동 (미착수)
- 🔄 **Phase 4 (70% 완료)**: Email 인터페이스 구현 완료, SMTP 연결만 남음
- ❌ **Phase 5**: 고도화 및 모니터링 (미착수)

#### 남은 작업들 (예상 2-3주)

##### **Phase 2 완료: Telegram Bot API 연동 (2-3일)**
- [ ] 실제 node-telegram-bot-api 연결 및 메시지 전송 구현
- [ ] Webhook 수신 및 명령어 처리 시스템 테스트
- [ ] 프로덕션 환경에서 실제 Bot 동작 검증

##### **Phase 3: Discord Webhook 연동 (1주)**
- [ ] DiscordService 클래스 및 Rich Embed 메시지 구현
- [ ] Webhook 전송, 에러 처리, 색상/이모지 최적화
- [ ] 환경변수 추가 (DISCORD_WEBHOOK_URL)

##### **Phase 4 완료: Email SMTP 연동 (2-3일)**
- [ ] 실제 nodemailer 연결 및 SMTP 설정
- [ ] HTML 템플릿 연결 및 Reply-to 명령어 파싱 테스트
- [ ] 이메일 보안 설정 (SPF, DKIM) 및 테스트

##### **Phase 5: 고도화 및 모니터링 (1주)**
- [ ] 재시도 로직 및 Circuit breaker 패턴 구현
- [ ] 플랫폼별 성공률 추적 및 통합 모니터링 대시보드
- [ ] 성능 최적화 및 병렬 전송 시스템

## ✅ 완료: 데이터베이스 연동 (Issue #67)

**PostgreSQL + Prisma ORM 완전 구현** (PR #76, #83)
- ✅ 데이터베이스 스키마 설계 및 마이그레이션
- ✅ WeatherAlert, AlertHistory 테이블 구현
- ✅ REST API 엔드포인트: `/api/alerts/current`, `/history`, `/statistics`
- ✅ DB 동기화 및 race condition 해결
- ✅ 성능 최적화 (인덱스, 쿼리 최적화)

*상세 내용은 Issue #67 및 CLAUDE-COMPLETE.md 참조*

---

## 🔄 진행 중: 웹 대시보드 (Issue #26) - 90% 완료

### ✅ **완료된 기능** (PR #77-85)

#### Phase 1: MVP (100% 완료)
- ✅ 실시간 특보 현황 페이지 (데이터베이스 기반)
- ✅ 지역별/특보별/수준별 필터링
- ✅ URL 파라미터 지원
- ✅ 모바일 반응형 디자인
- ✅ 환경별 대시보드 URL 설정

#### Phase 2: 고도화 (100% 완료)
- ✅ Leaflet 지도 시각화
- ✅ Chart.js 통계 차트
- ✅ 타임라인 뷰
- ✅ WebSocket 실시간 업데이트
- ✅ 브라우저 알림

#### Phase 3: 엔터프라이즈 (70% 완료)
- ✅ 히트맵 3종 (지역×시간, 월×지역, 특보×지역)
- ✅ 날씨 예보 API 연동 및 통합
- ✅ 고급 통계 차트 (월별/계절별/연도별)
- ❌ 개인별 구독 설정 관리 페이지 (미완료)
- ❌ 사용자 인증 강화 (미완료)

### 🎯 **남은 작업** (10%)

#### 우선순위 High
- [ ] **개인별 구독 설정 관리 페이지**
  - 통합 토큰 기반 인증 UI
  - WebSubscriptionInterface 연동
  - 구독 CRUD 인터페이스

#### 우선순위 Medium
- [ ] 구독 통계 대시보드
- [ ] OAuth 2.0 사용자 인증 (선택사항)

**상세 내용은 Issue #26 참조**

## API 참고사항

**한국 기상청 API 연동 완료** - 상세 내용은 [CLAUDE-COMPLETE.md](./CLAUDE-COMPLETE.md) 참조

### 연동 완료된 API들
- ✅ **특보자료 API** (wrn_met_data.php) - 완전 구현
- ✅ **특보구역 API** (wrn_reg.php) - 지역 매핑 완료
- ✅ **특보현황 API** (wrn_now_data_new.php) - 캐시 최적화 완료
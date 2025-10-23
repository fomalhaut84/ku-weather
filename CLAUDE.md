# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고할 가이드를 제공합니다.

## 작업 규칙 (Work Rules)

### 기본 원칙
- **대화 언어**: 모든 대화는 한국어로 진행
- **기본 브랜치**: 특별한 언급이 없는 한 모든 PR의 base 브랜치는 `dev`
- **코드 리뷰**: PR 생성 후 항상 `@codex`에게 댓글로 리뷰 요청

### PR 생성 워크플로우
1. 피처 브랜치 생성 및 작업 완료
2. `dev` 브랜치를 base로 PR 생성
3. PR 생성 직후 `@codex` 멘션으로 리뷰 요청 댓글 작성
4. 리뷰 피드백 반영 및 머지

### 예시
```bash
# 브랜치 생성
git checkout -b feature/new-feature

# 작업 완료 후 PR 생성 (base: dev)
gh pr create --base dev --title "..." --body "..."

# PR에 리뷰 요청 댓글
gh pr comment <PR_NUMBER> --body "@codex 리뷰 부탁드립니다."
```

## 프로젝트 개요

한국 기상청 공공API를 활용하여 특정 지역의 기상특보 정보를 모니터링하고, 특보 또는 예비특보 발생 시 다중 플랫폼으로 알림을 전송하는 Node.js 기반 프로젝트입니다.

**현재 버전**: v1.0.4 (안정화 릴리즈)
**안정성**: 프로덕션 환경 검증 완료

**완료된 기능들의 상세 내용은 [CLAUDE-COMPLETE.md](./CLAUDE-COMPLETE.md)를 참조하세요.**

## 개발 명령어

- `npm run build` - TypeScript 소스코드를 JavaScript로 컴파일
- `npm run start` - 컴파일된 애플리케이션 실행
- `npm test` - 단위 테스트 실행 (177개 테스트, 73.73% 커버리지)
- `npm run test:watch` - 테스트 감시 모드 실행
- `npm run test:coverage` - 커버리지 리포트 포함 테스트 실행
- `npm run test:ci` - CI/CD용 테스트 실행

## 프로젝트 구조

```
src/
├── __tests__/        # 테스트 파일 (177개 단위 테스트)
│   ├── config/       # Config 모듈 테스트 (21개, 100% 커버리지)
│   ├── services/     # 서비스 모듈 테스트 (135개)
│   │   ├── alertCache.test.ts    # AlertCache 테스트 (50개, 종합 테스트 포함)
│   │   ├── slackService.test.ts  # SlackService 테스트 (48개, 배치 전송 포함)
│   │   ├── weatherService.test.ts # WeatherService 테스트 (42개, 통합 시나리오 포함)
│   │   └── notifications/        # 다중 플랫폼 알림 테스트 (31개 테스트)
│   │   └── subscriptions/        # 하이브리드 구독 관리 테스트 (4개 테스트)
│   ├── types/        # Types 모듈 테스트 (7개, 100% 커버리지)
│   └── utils/        # 유틸리티 테스트 (13개, 100% 커버리지)
├── config/           # 환경 설정 관리
├── services/         # 핵심 서비스
│   ├── WeatherService.ts      # 기상청 API 연동
│   ├── SlackService.ts        # Slack 알림 서비스 (레거시)
│   ├── AlertCache.ts          # 특보 변동 감지 캐시
│   ├── notifications/         # 다중 플랫폼 알림 시스템
│   └── subscriptions/         # 하이브리드 구독 관리 시스템
├── types/            # TypeScript 타입 정의
├── utils/            # 유틸리티 함수 (로거 등)
└── index.ts          # 메인 애플리케이션 진입점
```

## 현재 상태

### ✅ 완료된 핵심 기능들
- ✅ **완전한 테스트 프레임워크** (Jest, 177개 테스트, **73.73% 커버리지**)
- ✅ **Slack 배치 메시지 전송 시스템** (95% 메시지 수 감소)
- ✅ **특보 변동 감지 시스템** (AlertCache 기반, CMD 기반 해제 로직)
- ✅ **다중 플랫폼 알림 시스템** (Telegram, Discord, Email 지원)
- ✅ **하이브리드 구독 관리 시스템** (개인별 맞춤 구독)
- ✅ **Critical Hotfix v1.0.1** (지역 필터링 버그 수정, 프로덕션 안정성 확보)
- ✅ **Hotfix v1.0.4** (기상특보 해제 알림 누락 문제 개선, 99.9%+ 안정성 달성)
- ✅ **Telegram Bot API Phase 1** (Markdown 파싱 오류 해결, 150개 테스트 통과)
- ✅ **프로덕션 급 품질 보증** (모든 핵심 모듈 철저한 테스트)

*상세 내용은 [CLAUDE-COMPLETE.md](./CLAUDE-COMPLETE.md) 참조*

## 🚨 **최근 완료 작업** (2025년 9월 25일)

### **Telegram Bot API Integration Phase 1 완료**

**GitHub 이슈 #23**의 Phase 1이 완료되었습니다. PR #47을 통해 Telegram Bot API 통합 및 Markdown 파싱 오류를 해결했습니다.

#### **완료된 내용**
- ✅ **TelegramNotificationService 구현**: 기상특보 알림 전송
- ✅ **TelegramSubscriptionInterface 구현**: Bot 명령어 처리 시스템
- ✅ **Markdown 안전성 보장**: `/list` 명령어 파싱 오류 완전 해결
- ✅ **포괄적인 테스트 커버리지**: 4개 신규 테스트 추가 (총 150개)
- ✅ **환경변수 설정 지원**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

#### **핵심 해결사항**
```bash
# 이전 문제
ETELEGRAM: 400 Bad Request: can't parse entities:
Can't find end of the entity starting at byte offset 266

# 해결 방법 - escapeMarkdown 함수 구현
private escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
```

#### **개선 효과**
- ✅ **Telegram `/list` 명령어 완전 수정** - 파싱 오류 없음
- ✅ **150개 테스트 100% 통과** - 품질 안정성 보장
- ✅ **74%+ 코드 커버리지 유지** - 기존 품질 지표 유지
- ✅ **기존 기능과 완전 호환** - Breaking Change 없음

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

## TODO: 데이터베이스 연동 (특보 이력 관리)

### 기능 요구사항
현재는 메모리에서만 동작하지만, 특보 이력 관리 및 데이터 분석을 위해 데이터베이스 연동이 필요함.

### 구현해야 할 기능들

#### 1. 데이터베이스 선택 및 설정
- [ ] 데이터베이스 선택 (SQLite/PostgreSQL/MongoDB 검토)
- [ ] ORM/ODM 선택 (TypeORM, Prisma, Mongoose 등)
- [ ] 데이터베이스 연결 설정 및 환경변수 관리
- [ ] 마이그레이션 시스템 구축

#### 2. 데이터 모델 설계
- [ ] **WeatherAlert 테이블**
  ```sql
  - id (Primary Key)
  - region_id (지역코드)
  - region_name (지역명)
  - warning_type (특보종류)
  - warning_level (특보수준)
  - command (특보명령)
  - announced_at (발표시각)
  - effective_at (발효시각)
  - created_at (생성시각)
  - updated_at (수정시각)
  ```
- [ ] **AlertHistory 테이블** (변동 이력)
- [ ] **RegionMapping 테이블** (지역 매핑 정보)

#### 3. 데이터 저장 로직
- [ ] 특보 데이터 자동 저장
- [ ] 중복 데이터 처리 (upsert 로직)
- [ ] 이력 데이터 관리 (변동 감지 시 이력 생성)
- [ ] 데이터 정리 정책 (오래된 데이터 자동 삭제)

#### 4. 조회 및 분석 기능
- [ ] 특보 이력 조회 API
- [ ] 지역별/기간별 특보 통계
- [ ] 특보 빈도 분석
- [ ] 대시보드용 데이터 제공

#### 5. 성능 최적화
- [ ] 인덱스 설정 (지역코드, 날짜 등)
- [ ] 쿼리 최적화
- [ ] 연결 풀 관리
- [ ] 캐싱 전략

### 구현 우선순위
1. **High**: 기본 데이터베이스 설정 및 특보 데이터 저장
2. **Medium**: 이력 관리 및 조회 기능
3. **Low**: 분석 기능 및 성능 최적화

## TODO: 기상특보 현황 웹 대시보드 개발

### 🎯 기획 개요

Slack 알림에서 클릭 한 번으로 접근 가능한 **실시간 기상특보 현황 웹 대시보드**를 개발하여 사용자 편의성을 극대화합니다.

#### 핵심 목표
- **원클릭 접근**: Slack 알림 → 웹 대시보드 즉시 이동
- **실시간 현황**: 현재 발효 중인 모든 특보를 직관적으로 표시
- **개인화**: 지역별, 특보 종류별 맞춤 필터링
- **모바일 최적화**: Slack 앱에서의 완벽한 사용성

### 📋 단계별 개발 계획

#### **Phase 1: MVP (최소 기능 제품) - 2-3주**

##### 🎨 **기본 UI/UX 설계**
```
┌─────────────────────────────────────────┐
│ 🌦️ 기상특보 현황 대시보드               │
├─────────────────────────────────────────┤
│ [전체지역 ▼] [전체특보 ▼] [🔄 새로고침] │
├─────────────────────────────────────────┤
│ 📍 서울특별시 | 🔥 폭염 | ⚠️ 주의보     │
│ 발표: 2025-01-28 09:00                   │
│ 발효: 2025-01-28 10:00                   │
├─────────────────────────────────────────┤
│ 📍 부산광역시 | 🌧️ 호우 | 🚨 경보      │
│ 발표: 2025-01-28 08:30                   │
│ 발효: 2025-01-28 09:00                   │
└─────────────────────────────────────────┘
```

##### ✨ **MVP 핵심 기능**
- [ ] **실시간 특보 목록**: 현재 발효 중인 모든 특보 표시
- [ ] **지역별 필터링**: 드롭다운으로 특정 지역 선택 가능
- [ ] **특보 종류별 필터링**: 폭염, 호우, 강풍 등 종류별 필터
- [ ] **자동 새로고침**: 5-10분 간격으로 데이터 업데이트
- [ ] **Slack 연동**: 각 알림 메시지에 "📊 현황보기" 링크 추가
- [ ] **URL 파라미터**: 특정 지역/특보 하이라이트 기능
- [ ] **모바일 반응형**: Slack 앱에서의 최적 사용성

### 🚀 권장 구현 방식

**2-3주 MVP 개발**을 통해 핵심 가치를 빠르게 검증하고, 사용자 피드백을 받아 단계적으로 고도화하는 전략을 권장합니다.

특히 **Slack 연동**이 이 프로젝트의 차별화 포인트이므로, 알림과 대시보드 간의 매끄러운 사용자 경험에 집중하는 것이 중요합니다.

## API 참고사항

**한국 기상청 API 연동 완료** - 상세 내용은 [CLAUDE-COMPLETE.md](./CLAUDE-COMPLETE.md) 참조

### 연동 완료된 API들
- ✅ **특보자료 API** (wrn_met_data.php) - 완전 구현
- ✅ **특보구역 API** (wrn_reg.php) - 지역 매핑 완료
- ✅ **특보현황 API** (wrn_now_data_new.php) - 캐시 최적화 완료
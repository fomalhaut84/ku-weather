# v2.0 전면 재작성 스펙

## 1. 목적

ku-weather 프로젝트의 전체 코드베이스를 재작성한다.

### 배경
- v1.x 시리즈는 기능적으로 완성도가 높지만(851개 테스트, 87% 커버리지), 유기적으로 성장하면서 코드 구조에 기술 부채가 누적됨
- `weatherService.ts` 1920줄, `server.ts` 500줄, `DatabaseService.ts` 498줄 등 거대 파일
- 백엔드/프론트엔드 간 타입 중복, DI 부재, 레이어 구분 불명확
- 프론트엔드 디자인이 기능 추가 위주로 성장하여 통일된 디자인 언어 부재

### 목표
1. **코드 품질 향상**: 모듈 기반 레이어드 아키텍처, 명확한 관심사 분리
2. **구조 개선**: pnpm 모노레포, 공유 타입 패키지, 테스트 co-location
3. **기능 점검**: 각 기능의 동작 상태를 검증하고, stub/partial 기능 정리
4. **UI 재디자인**: frontend-design 스킬을 활용한 모던 디자인

### 제약
- 기존 배포된 `main` 브랜치와 태그(v1.0.0~v1.0.9)는 건드리지 않음
- `dev` 브랜치에서 작업
- 기술 스택 유지: Express 5, Next.js 15, Prisma, PostgreSQL, Socket.IO, TypeScript
- Prisma 스키마 및 마이그레이션 유지 (DB 데이터 보존)
- REST API 경로 및 응답 형태 유지 (기존 클라이언트 호환)
- WebSocket 이벤트명 유지

---

## 2. 현재 기능 인벤토리 및 재작성 방침

### 2.1 기상 모니터링 (Weather Monitoring)

| 기능 | 현재 상태 | 재작성 방침 |
|------|----------|------------|
| KMA 특보자료 API 연동 (wrn_met_data) | WORKING | 유지 — `weather.service.ts`로 분리 |
| KMA 특보현황 API 연동 (wrn_now_data_new) | WORKING | 유지 |
| 초단기예보 API (getUltraSrtFcst) | WORKING | 유지 — `forecast.service.ts`로 분리 |
| 동네예보 API (getVilageFcst) | WORKING | 유지 — `forecast.service.ts`로 분리 |
| AlertCache 변동 감지 (6종 변동 타입) | WORKING | 유지 — `alert-cache.ts`로 분리. 복잡한 grace period 로직 리팩토링 검토 |
| 지역 격자 좌표 매핑 (CSV) | WORKING | 유지 — `region-resolver.ts`로 분리 |
| 폴링 스케줄러 | WORKING | 유지 — `monitoring-scheduler.ts`로 추출 |

**주요 분해**: `weatherService.ts` (1920줄) → 5개 파일
- `weather.service.ts` (~300줄): 특보 폴링 + 변동 감지 오케스트레이션
- `alert-cache.ts` (~250줄): 인메모리 캐시 + diff 로직
- `forecast.service.ts` (~200줄): 예보 API 호출
- `region-resolver.ts` (~300줄): 지역코드 매핑, 격자 좌표, CSV 로딩
- `weather.repository.ts` (~200줄): Prisma 쿼리 (DatabaseService에서 추출)

**점검 항목**:
- [ ] AlertCache grace period(30분/2시간) 임계값 적정성 검토
- [ ] Codex P1 마커 표시된 stale cache 핸들링 로직 정리
- [ ] 폴링 간격 설정의 환경변수 검증 (Zod)

### 2.2 알림 시스템 (Notification)

| 기능 | 현재 상태 | 재작성 방침 |
|------|----------|------------|
| Slack 알림 (Webhook + 배치) | WORKING | 유지 — `platforms/slack.service.ts` |
| Telegram 알림 (Bot API + Webhook) | WORKING | 유지 — `platforms/telegram.service.ts` |
| Discord 알림 | STUB | 인터페이스만 유지, 구현 보류 |
| Email 알림 | PARTIAL | 인터페이스만 유지, 구현 보류 |
| MultiplatformNotificationService | WORKING | `notification.orchestrator.ts`로 리네임 |
| NotificationFactory | WORKING | `notification.factory.ts`로 이동 |
| Circuit Breaker | WORKING | `reliability/circuit-breaker.ts`로 이동 |
| Retry 로직 (3회, 지수 백오프) | WORKING | 유지 |
| NotificationStats (플랫폼별 통계) | WORKING | `reliability/notification-stats.ts`로 이동 |
| 메시지 포맷터 (이모지, 색상) | WORKING | 상수를 shared 패키지로 추출 |
| 메시지 그루퍼 (지역별 그룹화) | WORKING | 유지 |

**점검 항목**:
- [ ] Circuit Breaker 통계가 인메모리 전용 — 재시작 시 초기화 허용 여부 확인
- [ ] Discord/Email stub 코드 정리 (불필요한 보일러플레이트 제거)
- [ ] 배치 모드 타임아웃 설정 검증

### 2.3 구독 관리 (Subscription)

| 기능 | 현재 상태 | 재작성 방침 |
|------|----------|------------|
| HybridSubscriptionManager | WORKING | `subscription.service.ts`로 리네임 |
| CommandParser (텔레그램/이메일 명령) | WORKING | `command-parser.ts`로 이동 |
| TelegramSubscriptionInterface | WORKING | `interfaces/telegram-subscription.ts` |
| SlackInteractiveInterface | PARTIAL | 인터페이스 유지, 상태 표기 |
| WebSubscriptionInterface | WORKING | `interfaces/web-subscription.ts` |
| EmailCommandProcessor | STUB | 인터페이스만 유지 |
| 인메모리 구독 저장소 | WORKING | `subscription.repository.ts`로 분리 |

**점검 항목**:
- [ ] TokenService(DB) vs HybridSubscriptionManager(인메모리) 토큰 불일치 해소
- [ ] 구독 데이터의 DB 영속화 여부 결정 (현재 인메모리)
- [ ] 지역명 정규화 로직 통합 (현재 AlertCache, AlertRoutes, 프론트엔드에 분산)

### 2.4 인증 (Auth)

| 기능 | 현재 상태 | 재작성 방침 |
|------|----------|------------|
| TokenService (DB 기반 토큰 관리) | WORKING | `auth/token.service.ts`로 이동 |
| WebAccessToken (30일 만료) | WORKING | 유지 |
| Telegram Webhook 인증 (timing-safe) | WORKING | 미들웨어로 추출 |

### 2.5 REST API

| 엔드포인트 | 현재 상태 | 재작성 방침 |
|-----------|----------|------------|
| `GET /api/alerts/current` | WORKING | `weather.controller.ts` |
| `GET /api/alerts/history` | WORKING | `weather.controller.ts` |
| `GET /api/alerts/statistics` | WORKING | `weather.controller.ts` |
| `GET /api/alerts` (레거시 캐시 기반) | WORKING | 제거 검토 — DB 기반으로 통합 |
| `GET /api/forecast/:regionId` | WORKING | `weather.controller.ts` |
| `POST /api/subscriptions/auth` | WORKING | `subscription.controller.ts` |
| `GET /api/subscriptions/me` | WORKING | `subscription.controller.ts` |
| `PUT /api/subscriptions/update` | WORKING | `subscription.controller.ts` |
| `DELETE /api/subscriptions/delete` | WORKING | `subscription.controller.ts` |
| `GET /api/subscriptions/stats` | WORKING | `subscription.controller.ts` |
| `GET /api/subscriptions/regions` | WORKING | `subscription.controller.ts` |
| `GET /api/subscriptions/warning-types` | WORKING | `subscription.controller.ts` |
| `GET /api/notifications/stats` | WORKING | `notification.controller.ts` |
| `GET /api/notifications/health` | WORKING | `notification.controller.ts` |
| `POST /api/notifications/circuit-breaker/:platform/reset` | WORKING | `notification.controller.ts` |
| `POST /telegram/webhook` | WORKING | 별도 webhook 핸들러 |

### 2.6 WebSocket

| 기능 | 현재 상태 | 재작성 방침 |
|------|----------|------------|
| Socket.IO 서버 초기화 | WORKING | `infra/websocket/socket-server.ts` |
| 이벤트 핸들링 (disconnect, error) | MINIMAL | 알림 브로드캐스트 이벤트 구현 강화 |
| 실시간 특보 브로드캐스트 | STUB | `alert:new`, `alert:removed`, `alert:updated` 구현 |

**점검 항목**:
- [ ] WebSocket 이벤트 스펙 확정 (이벤트명, 페이로드)
- [ ] 프론트엔드 useWebSocket 훅과의 연동 검증

### 2.7 웹 대시보드 (Frontend)

| 페이지 | 현재 상태 | 재작성 방침 |
|--------|----------|------------|
| Dashboard (실시간 특보 현황) | WORKING | frontend-design으로 재디자인 |
| Monitoring (알림 통계) | WORKING | frontend-design으로 재디자인 |
| Settings (구독 설정) | WORKING | frontend-design으로 재디자인 |
| MapView (Leaflet 지도) | WORKING | 유지, 디자인 통합 |
| ChartView / AdvancedChartView | WORKING | 유지, 디자인 통합 |
| HeatmapView (3종) | WORKING | 유지, 디자인 통합 |
| WeatherForecastCard | WORKING | 유지, 디자인 통합 |
| NotificationManager (브라우저 알림) | WORKING | 유지 |

**디자인 재구성 범위**:
- 페이지 구성: 디자인 시안 단계에서 결정 (기존 3페이지 유지 or 재구성)
- 디자인 톤/스타일: 시안 비교 후 사용자 선택
- 반응형: 모바일 우선 재설계
- 접근성: WCAG AA 유지

### 2.8 데이터베이스

| 모델 | 현재 상태 | 재작성 방침 |
|------|----------|------------|
| WeatherAlert | WORKING | 스키마 유지. 쿼리를 `weather.repository.ts`로 이동 |
| AlertHistory | WORKING | 스키마 유지. 쿼리를 `weather.repository.ts`로 이동 |
| RegionMapping | WORKING | 스키마 유지 |
| WebAccessToken | WORKING | 스키마 유지. 쿼리를 `auth/token.service.ts`로 이동 |

---

## 3. 기술 설계

### 3.1 프로젝트 구조 (pnpm 모노레포)

```
ku-weather/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── prisma/                         # 기존 스키마 유지
│
├── packages/
│   └── shared/                     # @ku-weather/shared
│       └── src/
│           ├── types/
│           │   ├── weather.ts      # WeatherAlertDto, CachedAlert, AlertChange
│           │   ├── api.ts          # ApiResponse<T>, AlertFilters, HistoryParams
│           │   ├── notification.ts # NotificationResult, PlatformConfig
│           │   └── subscription.ts # UserSubscription, Region, WarningType
│           ├── constants/
│           │   ├── warning-types.ts    # 타입명, 이모지, 색상 매핑
│           │   ├── warning-levels.ts   # 수준명, 색상 매핑
│           │   └── regions.ts          # 지역 매핑
│           ├── errors.ts           # AppError, NotFoundError, ValidationError, ExternalServiceError
│           └── index.ts
│
├── apps/
│   ├── server/                     # @ku-weather/server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.ts             # Composition Root
│   │       ├── config/
│   │       │   ├── index.ts
│   │       │   └── env.schema.ts  # Zod 환경변수 검증
│   │       ├── infra/
│   │       │   ├── http/
│   │       │   │   ├── server.ts
│   │       │   │   └── middleware/  # error-handler, auth, request-logger
│   │       │   ├── websocket/
│   │       │   │   └── socket-server.ts
│   │       │   └── database/
│   │       │       └── prisma-client.ts
│   │       ├── modules/
│   │       │   ├── weather/
│   │       │   │   ├── weather.controller.ts
│   │       │   │   ├── weather.service.ts
│   │       │   │   ├── weather.repository.ts
│   │       │   │   ├── alert-cache.ts
│   │       │   │   ├── forecast.service.ts
│   │       │   │   ├── region-resolver.ts
│   │       │   │   └── *.test.ts (co-located)
│   │       │   ├── notification/
│   │       │   │   ├── notification.controller.ts
│   │       │   │   ├── notification.orchestrator.ts
│   │       │   │   ├── notification.factory.ts
│   │       │   │   ├── platforms/
│   │       │   │   │   ├── platform.interface.ts
│   │       │   │   │   ├── slack.service.ts
│   │       │   │   │   └── telegram.service.ts
│   │       │   │   └── reliability/
│   │       │   │       ├── circuit-breaker.ts
│   │       │   │       └── notification-stats.ts
│   │       │   ├── subscription/
│   │       │   │   ├── subscription.controller.ts
│   │       │   │   ├── subscription.service.ts
│   │       │   │   ├── subscription.repository.ts
│   │       │   │   ├── command-parser.ts
│   │       │   │   └── interfaces/
│   │       │   └── auth/
│   │       │       └── token.service.ts
│   │       ├── scheduler/
│   │       │   └── monitoring-scheduler.ts
│   │       └── utils/
│   │
│   └── web/                        # @ku-weather/web
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       └── src/
│           ├── app/                # 페이지 구성은 디자인 단계에서 확정
│           ├── features/           # 피처 기반 구조
│           ├── shared/             # 공통 UI 컴포넌트
│           └── lib/                # API 클라이언트
```

### 3.2 핵심 아키텍처 패턴

**Composition Root (`app.ts`)**:
- 모든 의존성을 생성자 주입으로 연결
- DI 프레임워크 없이 단순하게 유지
- 전체 의존성 그래프가 한 파일에서 가시적

**Controller → Service → Repository 레이어**:
- Controller: HTTP 요청 파싱 + 응답 포맷팅만 담당
- Service: 비즈니스 로직
- Repository: Prisma 쿼리 캡슐화

**에러 계층**:
- `AppError` (base) → `NotFoundError`, `ValidationError`, `ExternalServiceError`
- error-handler 미들웨어에서 일괄 처리

**Config 검증**:
- Zod 스키마로 환경변수 타입 안전성 보장
- 앱 시작 시 검증 실패 → 즉시 종료

### 3.3 공유 타입 전략

| 타입 | 위치 | 용도 |
|------|------|------|
| `KmaWeatherAlert` (REG_ID, WRN 등) | server 전용 | KMA API 원본 응답 |
| `WeatherAlertDto` (regionId, warningType 등) | shared | API 응답 = Prisma 모델 형태 |
| `AlertChange`, `CachedAlert` | shared | 변동 감지 결과 |
| `ApiResponse<T>` | shared | 표준 API 응답 envelope |
| 특보 상수 (타입명, 이모지, 색상) | shared/constants | 양쪽에서 사용 |

---

## 4. 구현 단계

### Phase 0: 모노레포 기반 (1-2일)
- [ ] pnpm 워크스페이스 초기화
- [ ] `tsconfig.base.json` 설정
- [ ] 루트 `package.json` 워크스페이스 스크립트
- [ ] 기존 빌드/테스트 정상 동작 확인

### Phase 1: shared 패키지 (1일)
- [ ] `packages/shared` 생성
- [ ] 공유 타입 추출 (`src/types/` + `web/types/` → `packages/shared/src/types/`)
- [ ] 공유 상수 추출 (`src/index.ts` + `web/types/alert.ts` 중복 → `packages/shared/src/constants/`)
- [ ] 에러 계층 생성 (`packages/shared/src/errors.ts`)
- [ ] 양쪽 import 경로 변경 → `@ku-weather/shared`
- [ ] 중복 타입 파일 제거

### Phase 2: 백엔드 인프라 (2일)
- [ ] `apps/server/src/infra/http/server.ts` — Express 앱 설정
- [ ] `apps/server/src/infra/http/middleware/` — error-handler, auth, request-logger 추출
- [ ] `apps/server/src/infra/websocket/socket-server.ts` — Socket.IO 추출
- [ ] `apps/server/src/infra/database/prisma-client.ts` — Prisma 싱글턴 추출
- [ ] `apps/server/src/config/env.schema.ts` — Zod 기반 config

### Phase 3: weather 모듈 (2일)
- [ ] `region-resolver.ts` 추출 (격자 좌표, CSV, 지역 캐시)
- [ ] `forecast.service.ts` 추출 (초단기/동네 예보)
- [ ] `weather.repository.ts` 생성 (DB 쿼리 추출)
- [ ] `weather.service.ts` 슬림화 (특보 폴링 + 변동 감지만)
- [ ] `alert-cache.ts` 이동 + 리팩토링
- [ ] `weather.controller.ts` 생성 (alertRoutes 추출)
- [ ] 테스트 co-location 이동
- [ ] **기능 점검**: 기상 모니터링 E2E 동작 확인

### Phase 4: notification 모듈 (2일)
- [ ] `notification.orchestrator.ts` (MultiplatformNotificationService 이동)
- [ ] `platforms/` 하위 구조 (slack, telegram)
- [ ] `reliability/` 하위 구조 (circuit-breaker, stats)
- [ ] `notification.controller.ts` 생성 (notificationRoutes 추출)
- [ ] Discord/Email stub 코드 정리
- [ ] 테스트 co-location 이동
- [ ] **기능 점검**: 알림 전송 + 통계 + circuit breaker 동작 확인

### Phase 5: subscription + auth 모듈 (1일)
- [ ] `subscription.service.ts` (HybridSubscriptionManager 이동)
- [ ] `subscription.repository.ts` (인메모리 저장소 분리)
- [ ] `command-parser.ts` 이동
- [ ] `interfaces/` 하위 구조 (telegram, slack, web, email)
- [ ] `auth/token.service.ts` (TokenService 이동)
- [ ] `subscription.controller.ts` 생성 (subscriptionRoutes 추출)
- [ ] 테스트 co-location 이동
- [ ] **기능 점검**: 구독 CRUD + 토큰 인증 동작 확인

### Phase 6: Composition Root + 진입점 (1일)
- [ ] `app.ts` — Composition Root 작성
- [ ] `main.ts` — 진입점 (~30줄)
- [ ] `monitoring-scheduler.ts` — 모니터링 루프 추출
- [ ] graceful shutdown 구현
- [ ] 기존 `src/index.ts`, `src/server.ts` 제거
- [ ] `package.json` 스크립트 업데이트
- [ ] **기능 점검**: 전체 앱 기동 + API + WebSocket E2E 확인

### Phase 7: 프론트엔드 UI 디자인 + 재구조화 (3-4일)
- [ ] frontend-design 스킬로 디자인 시안 생성 (2-3개 스타일)
- [ ] 사용자 디자인 승인
- [ ] 승인된 디자인을 `docs/designs/v2-frontend/`에 저장
- [ ] `apps/web/src/` 구조 이동
- [ ] 피처 기반 디렉토리 구조 적용
- [ ] API 클라이언트 분리 (`lib/api-client.ts` + `lib/api/*.ts`)
- [ ] `@ku-weather/shared` 타입 사용
- [ ] 승인된 디자인 기반 UI 구현
- [ ] **기능 점검**: 전체 페이지 렌더링 + API 통신 + WebSocket 확인

### Phase 8: 마무리 (1일)
- [ ] 루트 스크립트: `pnpm dev`, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm typecheck`
- [ ] ESLint + Prettier 통합 설정
- [ ] Jest 설정 업데이트 (co-located 패턴)
- [ ] CLAUDE.md 최종 업데이트
- [ ] 불필요 브랜치 정리 (선택)

---

## 5. 테스트 계획

### 단위 테스트
- 기존 851개 테스트를 새 구조로 마이그레이션
- co-located 패턴 (`*.test.ts` 소스 파일 옆)
- 모듈별 Phase 완료 시 해당 테스트 전체 통과 확인

### 통합 테스트
- Phase 6 완료 후 전체 앱 기동 테스트
- API 엔드포인트 supertest 테스트

### E2E 점검
- Phase 6 완료 후: 서버 기동 → API 요청 → WebSocket 연결
- Phase 7 완료 후: 웹 대시보드 전체 페이지 렌더링 + API 통신

### 검증 기준
- `pnpm test` 전체 통과
- `pnpm build` 전체 성공 (shared → server → web)
- `pnpm lint` 에러 0건
- `pnpm typecheck` 에러 0건

---

## 6. 변경하지 않는 것

| 항목 | 이유 |
|------|------|
| `prisma/schema.prisma` + 마이그레이션 | DB 데이터 보존 |
| REST API 경로 + 응답 형태 | 기존 클라이언트 호환 |
| WebSocket 이벤트명 | 프론트엔드 호환 |
| `.env` 환경변수 | Zod 검증만 추가 |
| KMA API 호출 로직 | 외부 API 계약 유지 |

---

## 7. 추가 의존성

| 패키지 | 용도 | 적용 범위 |
|--------|------|----------|
| `zod` | 환경변수 검증 | server |
| `pnpm` | 워크스페이스 관리 | 루트 (npm 대체) |
| `@tanstack/react-query` | 데이터 페칭/캐싱 | web (Phase 7, 선택) |

---

## 8. 제외 사항

- Discord/Email 알림 구현 완성 (별도 이슈로 관리)
- OAuth 2.0 사용자 인증 (별도 이슈)
- 구독 데이터 DB 영속화 (별도 이슈)
- 프론트엔드 E2E 테스트 (Playwright, 별도 이슈)

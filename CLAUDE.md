# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

한국 기상청 공공API 기반 기상특보 모니터링 시스템 — 특보/예비특보 발생 시 다중 플랫폼(Slack, Telegram, Discord, Email)으로 알림 전송. 웹 대시보드로 실시간 현황 시각화.

## Tech Stack

- **Backend**: Express 5 (TypeScript) — REST API + WebSocket
- **Frontend**: Next.js 15 (App Router, React 19, TypeScript)
- **DB**: PostgreSQL + Prisma ORM
- **Styling**: Tailwind CSS
- **Charts**: Chart.js, Nivo (GeoJSON), Recharts
- **Maps**: Leaflet + react-leaflet
- **Real-time**: Socket.IO
- **Notifications**: Slack (배치 전송), Telegram (node-telegram-bot-api)
- **Monorepo**: pnpm workspaces
- **Test**: Jest + supertest

## Commands

```bash
pnpm install             # 전체 의존성 설치
npm run build            # 백엔드 빌드 (tsc)
npm run build:shared     # shared 패키지 빌드
npm run build:all        # shared → 백엔드 빌드
npm test                 # 백엔드 테스트
npm run typecheck        # TypeScript 타입 검사
cd web && npm run dev    # 프론트엔드 개발 서버 (포트 3001)
cd web && npm run build  # 프론트엔드 빌드
```

검증 순서 (PR 전 필수):
```bash
npm run typecheck && npm test && npm run build
```

> **Note**: pnpm 워크스페이스 전체 스크립트(`pnpm dev`, `pnpm lint` 등)는 Phase 8에서 통합 설정 예정.
> 현재는 기존 npm 스크립트 + `pnpm --filter` 명령으로 개별 패키지 실행.

패키지별 명령:
```bash
pnpm --filter @ku-weather/shared build   # shared 패키지 빌드
npx prisma migrate dev                   # 마이그레이션 생성+적용 (개발)
npx prisma migrate deploy               # 마이그레이션 적용 (프로덕션)
npx prisma studio                        # DB 브라우저 GUI
```

## Project Structure

```
ku-weather/
├── pnpm-workspace.yaml
├── package.json                    # 루트: 공통 스크립트
├── tsconfig.base.json              # 공유 TS 설정
├── prisma/                         # DB 스키마 + 마이그레이션
│
├── packages/
│   └── shared/                     # @ku-weather/shared
│       └── src/
│           ├── types/              # 공유 타입 (WeatherAlertDto, ApiResponse 등)
│           ├── constants/          # 특보 타입명, 이모지, 색상, 레벨
│           └── errors.ts           # 에러 계층 (AppError, NotFoundError 등)
│
├── apps/
│   ├── server/                     # @ku-weather/server (Express 백엔드)
│   │   └── src/
│   │       ├── main.ts             # 진입점
│   │       ├── app.ts              # Composition Root (DI 연결)
│   │       ├── config/             # 환경설정 (Zod 검증)
│   │       ├── infra/              # 인프라 (http, websocket, database)
│   │       ├── modules/            # 피처 모듈
│   │       │   ├── weather/        # 기상 모니터링
│   │       │   ├── notification/   # 다중 플랫폼 알림
│   │       │   ├── subscription/   # 구독 관리
│   │       │   └── auth/           # 토큰 인증
│   │       ├── scheduler/          # 모니터링 스케줄러
│   │       └── utils/              # logger, formatter
│   │
│   └── web/                        # @ku-weather/web (Next.js 프론트엔드)
│       └── src/
│           ├── app/                # App Router 페이지
│           ├── features/           # 피처 기반 구조
│           │   ├── dashboard/      # 대시보드 (실시간 특보 현황)
│           │   ├── monitoring/     # 알림 모니터링
│           │   ├── settings/       # 구독 설정
│           │   └── visualization/  # 지도/차트/히트맵
│           ├── shared/             # 공통 UI 컴포넌트
│           └── lib/                # API 클라이언트
```

## Architecture

```
Frontend (Next.js SSR/CSR)
    ↕ REST API + WebSocket
Backend (Express + Modules)
    ↕
PostgreSQL  ←  Scheduler (기상청 API 폴링)
    ↕
Notification Orchestrator
    ↕
Slack / Telegram / Discord / Email
```

**핵심 설계 결정:**
- **모듈 기반 레이어드 아키텍처**: 각 모듈 내 controller → service → repository
- **Composition Root**: `app.ts`에서 모든 의존성 생성자 주입. DI 프레임워크 없이 단순하게.
- **공유 타입 패키지**: `@ku-weather/shared`로 백엔드/프론트엔드 타입 중복 제거
- **KMA API 폴링**: 설정 간격으로 기상청 API 호출, AlertCache로 변동 감지, 변동 시 알림 전송
- **WebSocket**: Socket.IO로 대시보드 실시간 업데이트 (이벤트: `alert:new`, `alert:removed`, `alert:updated`)

## Key Domain Rules

- **특보 타입**: 강풍(W), 호우(R), 한파(C), 건조(D), 해일(O), 풍랑(V), 태풍(T), 대설(S), 황사(Y), 폭염(H), 안개(F)
- **특보 수준**: 예비(1), 주의보(2), 경보(3)
- **특보 명령**: 발표(1), 대치(2), 해제(3), 연장(5), 변경(6)
- **변동 감지**: CMD 기반 해제 로직. 대치(2) 시 이전 특보 자동 해제.
- **알림 배치 전송**: Slack은 여러 변동을 하나의 메시지로 그룹화 (95% 메시지 수 감소)
- **Circuit Breaker**: 알림 플랫폼 장애 시 자동 차단/복구

## Coding Conventions

- 한국어 UI, 코드/변수명은 영어.
- 컴포넌트: 함수형 + hooks. default export.
- API 응답: `{ success: boolean, data?: T, error?: string }` 형태 통일.
- DB 접근: repository 레이어를 통해서만. controller에서 Prisma 직접 호출 금지.
- 날짜: ISO 8601. 금액/숫자: `toLocaleString('ko-KR')`.
- 테스트: 소스 파일 옆에 co-located (`*.test.ts`).
- 커밋: conventional commits (`feat(scope): desc (#issue)`)

## Workflow

모든 기능 개발은 10단계 워크플로우를 따른다. **상세: `.claude/rules/workflow.md`**

```
기획 → 문서화(docs/specs/) → GitHub 이슈 → UI/UX 디자인(frontend-design 스킬)
→ 구현 계획 → 개발 → 테스트 → 코드 리뷰(P1/P2=0까지) → PR → [사용자 머지] → 이슈 종료
```

- 브랜치: `main`(배포) → `dev`(개발) → `feat/<issue>-<n>` / `fix/<issue>-<n>` (dev에서 생성, dev로 PR)
- hotfix: main에서 생성 → main + dev 양쪽 머지
- 릴리즈: dev → main 머지 후 `v{major}.{minor}.{patch}` 태그
- PR 머지는 사용자가 직접 수행. `gh` CLI로 이슈/PR 생성.

## Current Rewrite Status

v2.0 전면 재작성 진행 중. 기존 코드(v1.x)는 `CLAUDE-COMPLETE.md` 참조.

진행 순서:
1. Phase 0-1: 모노레포 기반 + shared 패키지
2. Phase 2-6: 백엔드 모듈별 재작성 + 기능 점검
3. UI 디자인: frontend-design 스킬로 시안 → 사용자 승인
4. Phase 7: 승인된 디자인 기반 프론트엔드 재구성
5. Phase 8: DX 개선 및 마무리

## Detailed Rules (`.claude/rules/`)

- `workflow.md` — 10단계 워크플로우 전문, 브랜치/릴리즈/코드리뷰 절차
- `api-routes.md` — API controller 패턴, 에러 응답, repository 규칙
- `components.md` — 컴포넌트 규칙, 색상, 접근성, 반응형

## Reference Docs

- `docs/specs/` — 기능별 상세 스펙
- `docs/designs/` — 승인된 UI/UX 디자인 프로토타입
- `CLAUDE-COMPLETE.md` — 완료된 기능 상세 이력 (v1.x 시리즈)

## API Reference

### 기상청 공공API (외부)
- **특보자료 API** (wrn_met_data.php) — 특보 상세 데이터
- **특보구역 API** (wrn_reg.php) — 지역 매핑
- **특보현황 API** (wrn_now_data_new.php) — 현재 특보 목록

### REST API (내부)
- `GET /api/alerts/current` — 현재 활성 특보
- `GET /api/alerts/history` — 특보 이력 조회
- `GET /api/alerts/statistics` — 특보 통계
- `GET /api/alerts/forecast/:regionId` — 지역별 날씨 예보
- `GET /api/subscriptions` — 구독 목록
- `POST /api/subscriptions` — 구독 생성
- `GET /api/notifications/stats` — 알림 통계

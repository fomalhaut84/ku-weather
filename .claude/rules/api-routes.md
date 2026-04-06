# API Routes 규칙

이 규칙은 apps/server/src/ 내 controller 및 route 파일에 적용.

- 모든 controller method는 try-catch로 감싸고, 에러 시 `{ success: false, error: string }` 형태로 응답
- 성공 시 `{ success: true, data: T, count?: number }` 형태로 응답
- DB 접근은 반드시 repository 레이어를 통해 수행 (controller에서 Prisma 직접 호출 금지)
- 날짜는 ISO 8601 형식으로 반환
- 페이지네이션 응답은 `{ success: true, data: T[], meta: { total, page, limit } }` 형태

# 컴포넌트 규칙

이 규칙은 apps/web/src/ 내 React 컴포넌트 파일에 적용.

- 함수형 컴포넌트 + hooks만 사용. class 컴포넌트 금지.
- default export 사용.
- UI 텍스트는 한국어. props/변수명은 영어.
- 특보 수준별 색상: 경보=#ef4444(red), 주의보=#f59e0b(amber), 예비=#3b82f6(blue)
- Tailwind CSS 기반 스타일링. 인라인 style 최소화.
- 반응형 디자인 필수 (모바일 우선).
- 접근성: WCAG AA 준수 (htmlFor/id, ARIA, 스킵 링크).

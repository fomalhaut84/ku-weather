# Security Policy

## 보안 취약점 보고

ku-weather 프로젝트의 보안 취약점을 발견하셨다면 다음 방법으로 보고해주세요.

### 보고 방법

1. **GitHub Security Advisories** (권장)
   - https://github.com/fomalhaut84/ku-weather/security/advisories/new
   - 비공개로 보고 가능

2. **Issue 생성**
   - 긴급하지 않은 보안 문제는 GitHub Issue로 보고

3. **이메일**
   - 민감한 보안 취약점은 이메일로 보고 (프로젝트 관리자)

## 지원되는 버전

| 버전 | 지원 여부 | 설명 |
| --- | --- | --- |
| v2.0.x (dev) | :white_check_mark: | 웹 대시보드 포함, 최신 기능 |
| v1.0.x (main) | :white_check_mark: | 백엔드 전용, 안정 버전 |
| < 1.0.0 | :x: | 지원 종료 |

## 보안 업데이트 정책

### 자동 보안 검사

- **Dependabot**: 매주 월요일 의존성 취약점 스캔
- **CodeQL**: 매주 수요일 코드 보안 분석
- **npm audit**: PR 생성 시 자동 실행

### 보안 패치 절차

1. **Critical/High 취약점**: 즉시 패치 (24시간 이내)
2. **Moderate 취약점**: 7일 이내 패치
3. **Low 취약점**: 월간 보안 업데이트에 포함

### 릴리즈 정책

- **보안 패치**: 마이너 버전 증가 (v1.0.8 → v1.0.9)
- **기능 추가**: 메이저 버전 증가 (v1.x → v2.0)

## 보안 관련 이슈

현재 알려진 보안 이슈:

- Issue #95: Telegram 라이브러리 교체 (request 패키지 SSRF)
  - 위험도: Moderate
  - 실제 영향: 낮음 (polling:false 사용)
  - 예정: telegraf로 마이그레이션

## 보안 체크리스트

### 개발자

- [ ] 새로운 의존성 추가 시 `npm audit` 실행
- [ ] PR 생성 시 보안 스캔 통과 확인
- [ ] 환경변수에 민감 정보 저장 (코드에 하드코딩 금지)
- [ ] API 키는 `.env` 파일 사용

### 배포

- [ ] 프로덕션 환경변수 안전하게 관리
- [ ] HTTPS/SSL 인증서 사용
- [ ] 방화벽 설정 확인
- [ ] 로그에 민감 정보 노출 방지

## 참고 자료

- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [npm Audit Documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

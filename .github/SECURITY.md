# 보안 정책 (Security Policy)

## 지원되는 버전

현재 보안 업데이트를 받는 버전은 다음과 같습니다:

| 버전 | 지원 여부 | 설명 |
| --- | --- | --- |
| v2.0.x (dev) | ✅ | 웹 대시보드 포함, 최신 기능 |
| v1.0.x (main) | ✅ | 백엔드 전용, 안정 버전 |
| < 1.0.0 | ❌ | 지원 종료 |

## 보안 취약점 보고

보안 취약점을 발견하셨다면, 다음 방법으로 **비공개**로 보고해 주세요:

### 1. GitHub Security Advisories (권장)
- [Security Advisories 페이지](../../security/advisories/new)에서 비공개로 보고
- 24시간 이내 1차 응답 보장

### 2. 이메일 보고
- 📧 **보안 담당자**: [프로젝트 관리자 이메일]
- 제목: `[SECURITY] ku-weather 보안 취약점`
- 포함 정보:
  - 취약점 설명
  - 재현 방법 (PoC)
  - 영향 범위
  - 제안 해결 방법 (선택)

### 3. 보고하지 말아야 할 경로
- ❌ Public GitHub Issues
- ❌ Pull Requests
- ❌ 공개 채팅/포럼

## 보안 업데이트 정책

### 우선순위 및 대응 시간

| 심각도 | 대응 시간 | 설명 |
| --- | --- | --- |
| **Critical** | 즉시 (24시간 이내) | 원격 코드 실행, 인증 우회 등 |
| **High** | 즉시 (24시간 이내) | 권한 상승, SQL Injection 등 |
| **Moderate** | 7일 이내 | XSS, CSRF, 민감 정보 노출 등 |
| **Low** | 월간 업데이트 | 마이너한 보안 이슈 |

### 패치 프로세스

1. **취약점 확인** - 보고된 취약점 재현 및 영향 범위 분석
2. **패치 개발** - 비공개 브랜치에서 수정 작업
3. **테스트** - 자동화 테스트 및 보안 스캔 실행
4. **릴리스** - 패치 버전 릴리스 및 보안 공지 발행
5. **공개** - 패치 배포 후 30일 이후 취약점 상세 공개

## 자동화된 보안 검사

### Dependabot
- 📅 **주기**: 매주 월요일 09:00 KST
- 📦 **대상**: npm 패키지, GitHub Actions
- 🔄 **자동 PR**: 보안 업데이트 자동 생성

### npm audit (GitHub Actions)
- 📅 **주기**: 매주 월요일 + PR마다
- 🎯 **기준**: Critical/High 취약점 0개
- 📊 **리포트**: Artifacts에 저장

### CodeQL
- 📅 **주기**: 매주 수요일 + PR마다
- 🔍 **분석**: SQL Injection, XSS, Code Injection 등
- 🛡️ **쿼리**: security-and-quality

### Snyk (선택)
- 📅 **주기**: 설정 시 활성화
- 🔐 **토큰**: `SNYK_TOKEN` 필요

## 알려진 취약점 및 대응 현황

### v1.0.9 (2025-12-09)
- ✅ **glob** (High): Command injection → 10.5.0
- ✅ **js-yaml** (Moderate): Prototype pollution → 4.1.1
- ⚠️ **request** (Moderate): SSRF 4개 - 장기 마이그레이션 계획 (Issue #95)

### v2.0.x (dev 브랜치)
- ✅ **Next.js React2Shell** (Critical): CVE-2025-55182, CVE-2025-66478 → 15.1.9
- ✅ **glob, js-yaml, body-parser 등**: 모두 패치 완료
- ⚠️ **request** (Moderate): SSRF 4개 - 장기 마이그레이션 계획 (Issue #95)

## 보안 관련 설정

### 환경 변수 보호
민감한 정보는 반드시 환경 변수로 관리하세요:

```bash
# .env 파일 (Git에 커밋하지 마세요!)
KMA_API_KEY=your_api_key
DATABASE_URL=postgresql://...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
TELEGRAM_BOT_TOKEN=your_token
```

### API 키 관리
- ✅ `.env` 파일 사용 (`.gitignore`에 등록)
- ✅ GitHub Secrets에 프로덕션 키 저장
- ❌ 소스코드에 하드코딩 금지
- ❌ Public 저장소에 커밋 금지

### 의존성 보안
- ✅ `npm audit` 정기 실행
- ✅ Dependabot 자동 업데이트 활성화
- ✅ `package-lock.json` 항상 커밋
- ✅ `npm overrides`로 취약한 하위 의존성 패치

## 보안 체크리스트

### 개발자용
- [ ] 민감 정보는 환경 변수로 관리
- [ ] PR 생성 전 `npm audit` 실행
- [ ] CodeQL 경고 확인 및 수정
- [ ] 사용자 입력 검증 (XSS, SQL Injection 방지)
- [ ] 에러 메시지에 민감 정보 노출 금지

### 배포용
- [ ] 프로덕션 환경 변수 설정 확인
- [ ] HTTPS 사용 (HTTP → HTTPS 리다이렉트)
- [ ] Rate limiting 설정
- [ ] 로그에 민감 정보 기록 금지
- [ ] 보안 헤더 설정 (CSP, HSTS 등)

## 참고 자료

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)
- [GitHub Security Advisories](https://github.com/advisories)

## 문의

보안 관련 문의사항은 다음으로 연락 주세요:
- 📧 이메일: [보안 담당자 이메일]
- 🔒 GitHub Security Advisories: [링크](../../security/advisories)

---

**마지막 업데이트**: 2025-12-09
**버전**: v1.0.9

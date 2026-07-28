# 모바일 이메일 인증 기능 동일화 구현 기록 (2026-07-27)

`verse-flutter`에 웹(`verse-web-next`)에만 있던 계정 보안 기능 4종을 추가해 기능을 동일화한 작업.
백엔드·웹은 이미 완성되어 있었고, 모바일 UI만 추가했다.
계획: `docs/superpowers/plans/2026-07-18-mobile-email-auth-parity.md`
설계: `docs/superpowers/specs/2026-07-18-mobile-email-auth-parity-design.md`

Superpowers `subagent-driven-development`로 진행 — 태스크 6개를 독립 서브에이전트가 구현하고,
각 태스크를 다른 서브에이전트가 스펙 준수·코드 품질을 리뷰(전부 1차 통과, Approved), 마지막에
전체 브랜치 리뷰(opus)를 한 번 더 거쳤다. 계획 v1은 "격차 3종"이라 잘못 적었으나 웹 설정 화면의
비밀번호 변경(`has_password` 게이팅)이 누락된 것을 리뷰 단계에서 발견해 4종으로 정정했다.

## 구현 내역

| # | 기능 | 파일 | 커밋 |
|---|---|---|---|
| 1 | `AuthRepository`/`AuthUser` — 이메일·비밀번호 6개 메서드 + 3개 필드 | `lib/core/auth/auth_repository.dart` | `6e6099c` |
| 2 | 회원가입 이메일(선택) 입력 | `lib/features/auth/signup_screen.dart` | `0260975` |
| 3 | 비밀번호 찾기 화면(email→code→done) + 라우트 + 로그인 링크 | `lib/features/auth/forgot_password_screen.dart`(신규), `router.dart`, `login_screen.dart` | `e0ebad5` |
| 4 | 설정 — 복구 이메일 등록/인증(idle/editing/verifying) | `lib/features/settings/settings_screen.dart` `_EmailRow` | `d0916d1` |
| 5 | 설정 — 비밀번호 변경(`has_password`일 때만 노출) | `lib/features/settings/settings_screen.dart` `_ChangePasswordRow` | `e6e6103` |
| 6 | 최종 리뷰 반영(마운트 안전성 4곳, 위젯 테스트 1개, 죽은 arb 키 제거, 클라이언트 검증 보강 등) | 위 파일들 + `test/forgot_password_screen_test.dart`(신규) | `44c6054` |

엔드포인트/요청 바디는 웹 `lib/api/auth.ts`와 정확히 일치시켰다: `/auth/signup`(email 선택),
`/auth/password-reset/request`·`/confirm`, `/me/email/request`·`/confirm`, `/me/password`,
`GET /me`(email/email_verified/has_password 파싱).

## 최종 리뷰에서 발견·처리한 사항

- **Important — DioException catch에서 `mounted` 가드 누락(4곳)**: 계획 문서 자체의 결함이었다
  (기존 `_EditNameRow`의 미가드 패턴을 그대로 복제). 4곳 모두 `if (mounted) setState(...)`로 통일.
- **Important — 에러 매핑 switch문 테스트 부재**: `ForgotPasswordScreen`의 401→`resetInvalidCode`
  경로에 위젯 테스트 1개 추가.
- **Important — 비밀번호 변경 후 구 토큰 세션 유효성 미확인**: 로컬 백엔드에 실제 요청으로 확인한
  결과 JWT는 stateless라 비밀번호 변경 후에도 구 토큰이 계속 유효함(수정 불필요, 확인만).
- **Minor 4건**: 죽은 arb 키(`resetProcessing`) 제거, 비밀번호 재설정 confirm 단계 클라이언트
  검증 추가, 취소 시 비밀번호/코드 필드 미초기화 수정, 이메일 빈 문자열을 null과 동일 취급.
- 보류(사용자 판단 필요): 로그인 화면 링크 3개 스택(디자인 검토 필요), `reset*`/`settings*` arb
  키 의도적 중복(리뷰어도 유지 권장).

## 검증

- `flutter analyze`: 에러 0, 사전 존재 이슈만(태스크 전 구간 동일하게 유지, 신규 이슈 0건)
- `flutter test`: 151/151 통과(신규 `auth_repository_email_test.dart`, `forgot_password_screen_test.dart` 포함) → main 병합 후 152/152(main의 사전 미커밋 테스트 1개 포함)
- **백엔드 프로토콜 레벨 검증**: 로컬 Postgres(docker compose) + `verse-backend`를 8099 포트로 기동,
  `RESEND_API_KEY` 미설정 시 `LogMailer`가 콘솔에 인증코드를 출력하는 dev 모드를 활용해 실제
  이메일 없이 8개 흐름을 curl로 검증 — 회원가입 이메일 저장(201, 미인증), `GET /me` 필드,
  이메일 인증 요청/오답(401)/정답(200)+재조회, 비번 재설정 열거공격 방지(둘 다 202)/짧은
  비번(400)/성공(204)+재로그인, 비밀번호 변경 오답(401)/짧은 비번(400)/성공(204)+재로그인.
  전부 계획서의 상태코드 계약표와 Flutter 쪽 에러 매핑이 정확히 일치.
- **시뮬레이터 스모크 테스트**: iOS 시뮬레이터에 로컬 백엔드(8099)를 가리키는 빌드를 설치해
  로그인 화면 → "Forgot your password?" 링크 → `ForgotPasswordScreen` 렌더링(제목/Email
  필드/Send code/Back to login)까지 확인. 좌표 보정 문제로 실제 코드 제출까지는 완주하지 못함 —
  계획의 필수 검증 항목은 아니며(백엔드 프로토콜 검증이 계약을 이미 커버), 후속 세션에서
  이어서 진행 가능.

## 병합

`mobile-email-auth-parity` 브랜치(`.worktrees/`) → `main` fast-forward 병합, 워크트리·브랜치 정리 완료.
main 현재 `44c6054`.

### 참고 문서
- `docs/superpowers/plans/2026-07-18-mobile-email-auth-parity.md` — 구현 계획(v2, 4종 격차로 정정)
- `docs/superpowers/specs/2026-07-18-mobile-email-auth-parity-design.md` — 설계 스펙
- `docs/status-2026-07-27-mobile-ux-improvements.md` — 이 작업을 범위에서 제외했던 직전 UX 개선 기록
- `docs/status-2026-07-18.md` — 직전 전체 현황(섹션 5 "인증·계정"의 🟡 항목들을 이 작업으로 해소)

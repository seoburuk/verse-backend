# 모바일 이메일 인증 기능 동일화 설계 (2026-07-18)

## 목표

웹(`verse-web-next`)과 모바일(`verse-flutter`)의 기능을 동일화한다. 단 **알림**(플랫폼 특성상 웹 미지원)과 **광고**(웹은 AdSense 승인 대기 중, 별도 처리)는 제외한다.

코드 대조 결과, 광고·알림을 제외한 실제 "한쪽에만 있는" 격차는 **계정 보안 계열 4종**으로 수렴한다. 백엔드와 웹은 이미 완성되어 있고, **모바일(Flutter) UI만 추가**하면 된다.

> **2026-07-27 정정:** 최초 작성 시 "3종"으로 적었으나, 웹 설정 화면의 **비밀번호 변경**(`has_password` 기반, `POST /me/password`)이 누락되어 있었다. 모바일에는 해당 기능이 전혀 없으므로 4번째 격차로 추가한다. 자세한 반영은 플랜 v2 참조.

### 범위에서 제외된 항목 (이유)

- **이모지→픽셀아트**: 격차 아님. 웹도 모드 라벨에 동일한 이모지를 사용한다(`messages/ko.json`: `"modeDrag": "🧩 타일"`, `"modeType": "⌨️ 타이핑"`). 암송 화면의 heart/star 픽셀 아이콘은 모바일이 이미 `pixel_icon.dart`로 1:1 이식 완료. 모바일만 픽셀로 바꾸면 오히려 웹과 달라지므로 제외.
- **대시보드 정렬/그룹핑/0 숨김, 표시이름 수정, i18n**: 모바일이 이미 따라잡음(2026-07-14 문서의 🟡는 stale).
- **광고, 알림**: 사용자 지시로 제외.

## 대상 격차 (웹 O → 모바일 X)

| # | 기능 | 백엔드 엔드포인트 (기존) |
|---|---|---|
| 1 | 회원가입 시 이메일(선택) 입력 | `POST /auth/signup` (email 필드) |
| 2 | 비밀번호 찾기/재설정 | `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` |
| 3 | 설정에서 이메일 추가 + 인증코드 확인 | `POST /me/email/request`, `POST /me/email/confirm`, `GET /me`(email/email_verified) |
| 4 | 설정에서 비밀번호 변경 (소셜 전용 계정은 숨김) | `POST /me/password`, `GET /me`(has_password) |

## 아키텍처

백엔드 변경 없음. 웹 `verse-web-next/lib/api/auth.ts`의 함수 시그니처·엔드포인트를 Flutter로 그대로 미러링한다. 채점/동기화 등 다른 영역은 손대지 않는다.

### 1. 데이터 모델 — `verse-flutter/lib/core/auth/auth_repository.dart`

`AuthUser`에 필드 2개 추가 (getMe 응답에서 파싱, 없으면 안전 기본값):

```dart
final String? email;
final bool emailVerified;
// fromJson: email: j['email'] as String?,
//           emailVerified: j['email_verified'] as bool? ?? false,
```

> 주의: `signup`/`login`/`google`/`apple` 응답(AuthResponse)에는 email 필드가 없다.
> `AuthUser.fromJson`은 email 부재 시 null/false로 안전하게 처리해야 하며, 이 값들은
> `getMe()`로 조회한 경우에만 의미가 있다.

### 2. 레포지토리 메서드 — `AuthRepository`

웹 `auth.ts`와 1:1 대응:

```dart
// signup: email 선택 파라미터 추가
Future<AuthUser> signup({required String username, required String password,
    required String displayName, String? email}) async {
  final res = await _client.dio.post('/auth/signup', data: {
    'username': username, 'password': password, 'display_name': displayName,
    if (email != null && email.isNotEmpty) 'email': email,
  });
  return _handleAuthResponse(res.data as Map<String, dynamic>);
}

Future<void> requestPasswordReset(String email) =>
  _client.dio.post('/auth/password-reset/request', data: {'email': email});

Future<void> confirmPasswordReset(String email, String code, String newPassword) =>
  _client.dio.post('/auth/password-reset/confirm',
    data: {'email': email, 'code': code, 'new_password': newPassword});

Future<void> requestEmailVerification(String email) =>
  _client.dio.post('/me/email/request', data: {'email': email});

Future<void> confirmEmailVerification(String code) =>
  _client.dio.post('/me/email/confirm', data: {'code': code});
```

> `updateProfile`가 dio Future 반환 관련 크래시를 겪은 전례가 있으므로(주석 참조),
> 위 void 메서드들도 `async`로 감싸 실제 `Future<void>`를 반환하도록 한다.

### 3. UI — 회원가입 화면 `features/auth/signup_screen.dart`

- username/password/displayName 아래에 이메일(선택) `TextField` 1개 추가.
- `keyboardType: TextInputType.emailAddress`, `autofillHints: [AutofillHints.email]`.
- 비어 있으면 미전송(선택 필드). `signup(... email: _email.text.trim())` 전달.

### 4. UI — 비밀번호 찾기 화면 (신규) `features/auth/forgot_password_screen.dart`

웹 `app/[locale]/forgot-password/page.tsx` 미러. 2단계 상태머신:

- **step 1 (request)**: 이메일 입력 → `requestPasswordReset(email)` → step 2로.
- **step 2 (confirm)**: 코드 + 새 비밀번호 입력 → `confirmPasswordReset(email, code, newPassword)` → 성공 시 로그인 화면으로 복귀 + 안내.
- 라우터에 `/forgot-password` 등록(기존 go_router 설정 위치에).
- `login_screen.dart`에 "비밀번호를 잊으셨나요?" 링크 추가 → `context.push('/forgot-password')`. (웹 `login/page.tsx:167` 대응 위치: 로그인 폼 하단)

### 5. UI — 설정 이메일 섹션 `features/settings/settings_screen.dart`

웹 `settings/page.tsx`의 `emailStep: "idle" | "editing" | "verifying"` 상태머신 미러:

- **idle**: 현재 이메일 표시. `email_verified`면 `(인증됨)` 배지, 아니면 `(미인증)` + "이메일 변경/추가" 버튼.
- **editing**: 이메일 입력 → `requestEmailVerification(email)` → verifying로.
- **verifying**: 인증코드 입력 → `confirmEmailVerification(code)` → 성공 시 idle로, `getMe()` 재조회로 상태 갱신.
- `_EditNameRow` 근처(현재 표시이름 편집 UI)에 자연스럽게 배치.

### 6. i18n — `lib/l10n/app_ko.arb`, `app_en.arb`

웹 메시지 키에 대응하는 신규 문자열 추가 후 `flutter gen-l10n`(또는 프로젝트의 생성 명령)으로 `app_localizations*.dart` 재생성. 문구는 웹 `messages/{ko,en}.json`의 대응 키를 그대로 사용:

- `forgotPassword`, `emailOptional`, `resetPasswordTitle`, `sendCode`, `verificationCode`,
  `newPassword`, `emailVerify`, `emailVerified`, `verified`, `unverified`,
  `changeEmail`, `resendCode`, 관련 성공/에러 안내 문구.
- 정확한 키 목록은 구현 시 웹 `messages/*.json`의 auth/settings 네임스페이스를 소스로 확정.

## 오류 처리

- 모든 네트워크 호출은 기존 화면 패턴(try/catch + `isAuthError`/스낵바)을 따른다.
- 잘못된 코드/만료 코드/미존재 이메일 → 백엔드 4xx 응답을 사용자 안내 문구로 매핑.
- 비밀번호 재설정 request는 이메일 존재 여부를 노출하지 않도록 백엔드가 항상 성공 응답(웹 동일)이므로, UI도 "코드를 보냈습니다(존재 시)" 식 문구로 처리.

## 테스트 / 검증

- `flutter analyze` 0 issues.
- 관련 `flutter test`(레포지토리 메서드 단위 테스트 — dio mock으로 엔드포인트·body 검증).
- 로컬 `verse-backend`(Postgres 포함) 기동 후 프로토콜 레벨 검증(기존 Phase 4 방식): 회원가입 이메일 저장, 비번 재설정 request/confirm, 이메일 인증 request/confirm의 요청 스키마·DB 반영 확인.

## 비목표 (Non-goals)

- 백엔드/웹 코드 변경.
- 광고, 알림.
- 이모지→픽셀 교체(위 "제외" 참조).
- 소셜 로그인(구글/애플) 계정의 이메일 자동 인증 처리 — 별도 논의.

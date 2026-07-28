# 모바일 이메일 인증 기능 동일화 Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹에만 있는 계정 보안 기능 4종(회원가입 이메일·비밀번호 재설정·설정 이메일 인증·비밀번호 변경)을 모바일(Flutter)에 추가해 기능을 동일화한다.

**Architecture:** 백엔드·웹은 이미 완성. 웹 `verse-web-next/lib/api/auth.ts`의 엔드포인트를 Flutter `AuthRepository`로 미러링하고, 화면 3곳(회원가입/신규 비번찾기/설정)에 UI를 붙인다. 다른 영역은 손대지 않는다.

**Tech Stack:** Flutter, Riverpod, dio, go_router, flutter gen-l10n(arb).

## v1 대비 변경 사항 (평가 반영)

1. **비밀번호 변경(`POST /me/password`) 추가** — v1 스펙의 "격차 3종 수렴"은 틀렸다. 웹 설정에는 `has_password` 기반 비밀번호 변경 UI가 있고(`app/[locale]/(app)/settings/page.tsx:358`) 모바일엔 없다. Task 5로 편입하고 `AuthUser.hasPassword` 파싱을 Task 1에 추가.
2. **에러 처리를 상태코드 매핑으로 교체** — v1의 `_snack('$e')`는 raw DioException을 사용자에게 노출한다. 기존 `_EditNameRow._save`(`settings_screen.dart:421`)·`signup_screen._messageFor`(`signup_screen.dart:77`) 패턴대로 상태코드 → 로컬라이즈 문구로 매핑하고 인라인 `_error` 텍스트로 표시한다. (v1이 근거로 든 "login_screen의 스낵바 패턴"은 존재하지 않는다 — login_screen은 스낵바를 쓰지 않는다.)
3. **비번 재설정 request의 가짜 성공 처리 삭제** — 백엔드가 이미 계정 존재 여부와 무관하게 항상 202를 반환한다(`auth_handler.go:245` 주석: "열거 공격 방지"). 앱이 catch해서 성공인 척할 필요가 없다. 웹과 동일하게 성공 시에만 다음 단계로 진행한다.
4. **UI를 픽셀 테마 위젯으로 통일** — v1의 `ListTile`/`FilledButton` 대신 기존 `PixelCard`/`ElevatedButton`/`_SettingsRow`를 쓴다.
5. **arb 키를 웹 `messages/*.json`에서 그대로 가져옴** — 아래 각 태스크에 확정된 ko/en 문구를 명시했다(더 이상 "구현 시 확정" 없음).
6. **라인 번호 정정** — login signup 링크는 `login_screen.dart:170`, `_EditNameRow` 렌더는 `settings_screen.dart:303`.

## Global Constraints

- 백엔드/웹 코드는 수정하지 않는다.
- 엔드포인트·요청 body는 웹 `auth.ts`와 정확히 일치시킨다: `/auth/signup`(email), `/auth/password-reset/request`{email}, `/auth/password-reset/confirm`{email,code,new_password}, `/me/email/request`{email}, `/me/email/confirm`{code}, `/me/password`{current_password,new_password}, `/me`(email/email_verified/has_password 파싱).
- `Future<void>` 반환 메서드는 반드시 `async`로 감싸 실제 void future를 반환한다(dio Future 반환 크래시 전례, `auth_repository.dart:91` 주석 참조).
- 신규 사용자 문자열은 하드코딩 금지 — `app_ko.arb`(template)/`app_en.arb`에 추가 후 `flutter gen-l10n`으로 생성물 재생성. 기존 키들은 `@` 메타데이터 없이 평문 문자열만 쓰므로 동일하게 한다.
- 테스트는 기존 dio `_FakeAdapter`(`test/favorites_sync_service_test.dart:14`) 패턴을 사용해 실제 네트워크 없이 엔드포인트·body를 검증한다.
- 라우트 추가는 `lib/app/router.dart`의 기존 `GoRoute` 목록(`/signup` 다음)에 한다.

## 백엔드 계약 (검증 완료 — 에러 매핑의 근거)

`errStatus`(`internal/handler/handler.go:32`) 기준 도메인 에러 → HTTP 매핑:
`ErrInvalidInput`/`ErrProfanity`/`ErrNoPassword`→400, `ErrUnauthorized`→401, `ErrNotFound`→404, `ErrConflict`→409, `ErrRateLimited`→429.

| 엔드포인트 | 성공 | 400 | 401 | 429 |
|---|---|---|---|---|
| `POST /auth/signup` | 201 | 필수필드 누락/욕설 | — | IP당 분당 10회 |
| `POST /auth/password-reset/request` | **202 (항상)** | invalid json만 | — | — |
| `POST /auth/password-reset/confirm` | 204 | 새 비번 8자 미만 | 이메일 미존재·코드 불일치·코드 없음 | 코드 시도 5회 초과 |
| `POST /me/email/request` | 202 | 이메일 형식 오류(`@` 없음) | 미인증 | 시간당 코드 3회 초과 |
| `POST /me/email/confirm` | 200 | invalid json | 코드 불일치/없음 | 시도 5회 초과 |
| `POST /me/password` | 204 | 새 비번 8자 미만 / 소셜계정(비번 없음) | 현재 비번 불일치 | — |

추가 확정 사실:
- 회원가입 시 이메일은 **저장만 되고 인증 코드는 발송되지 않는다**(`auth_service.go:68` `SetPendingEmail`). 인증은 설정 화면에서 별도 진행. 또한 handler가 `_ = h.auth.SetPendingEmail(...)`로 에러를 버리므로(`auth_handler.go:32`) **이메일이 잘못돼도 회원가입은 실패하지 않는다** → 앱에서 이메일 검증 실패 UI가 필요 없다.
- 인증 코드는 6자리 숫자, TTL 10분(`auth_service.go:60`).
- `GET /me` 응답에 `email`(optional), `email_verified`, `has_password` 포함(`auth_handler.go:170`). `signup`/`login`/`google`/`apple` 응답(TokenResponse)에는 없다 → `AuthUser.fromJson`은 부재 시 안전 기본값으로 처리해야 한다.

---

## File Structure

- `lib/core/auth/auth_repository.dart` — 모델 필드 3개 + 메서드 6개 (Task 1)
- `test/auth_repository_email_test.dart` — 신규 레포지토리 단위 테스트 (Task 1)
- `lib/features/auth/signup_screen.dart` — 이메일 선택 필드 (Task 2)
- `lib/features/auth/forgot_password_screen.dart` — 신규 화면 (Task 3)
- `lib/app/router.dart` — `/forgot-password` 라우트 (Task 3)
- `lib/features/auth/login_screen.dart` — 비번찾기 링크 (Task 3)
- `lib/features/settings/settings_screen.dart` — 이메일 인증 섹션(Task 4) + 비밀번호 변경 섹션(Task 5)
- `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb` — 신규 키 (Task 2·3·4·5에서 필요분 추가)

---

### Task 1: AuthRepository — 이메일/비번 필드 + 6개 메서드

**Files:**
- Modify: `lib/core/auth/auth_repository.dart`
- Test: `test/auth_repository_email_test.dart` (create)

**Interfaces:**
- Consumes: `ApiClient`(기존, `dio`/`tokenStore`), dio `_FakeAdapter` 패턴.
- Produces:
  - `AuthUser.email` (`String?`), `AuthUser.emailVerified` (`bool`), `AuthUser.hasPassword` (`bool`)
  - `Future<AuthUser> signup({required String username, required String password, required String displayName, String? email})`
  - `Future<void> requestPasswordReset(String email)`
  - `Future<void> confirmPasswordReset(String email, String code, String newPassword)`
  - `Future<void> requestEmailVerification(String email)`
  - `Future<void> confirmEmailVerification(String code)`
  - `Future<void> changePassword(String currentPassword, String newPassword)`

- [ ] **Step 1: Write the failing test**

`test/auth_repository_email_test.dart`:

```dart
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/auth/auth_repository.dart';
import 'package:verse_flutter/core/network/api_client.dart';

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = [];
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? s, Future<void>? c) async {
    requests.add(options);
    return handler(options);
  }
  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object data, {int statusCode = 200}) {
  return ResponseBody.fromBytes(utf8.encode(jsonEncode(data)), statusCode,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});
}

/// 백엔드가 202/204로 빈 본문을 주는 엔드포인트용.
ResponseBody _empty(int statusCode) => ResponseBody.fromBytes(Uint8List(0), statusCode);

const _tokenResponse = {
  'access_token': 't', 'user_id': 1, 'username': 'u',
  'display_name': 'D', 'theme': 'dark', 'language': 'ko',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late ApiClient client;
  late _FakeAdapter adapter;
  late AuthRepository repo;

  void useAdapter(_FakeAdapter a) {
    adapter = a;
    client.dio.httpClientAdapter = a;
  }

  setUp(() {
    client = ApiClient(TokenStore());
    repo = AuthRepository(client);
    useAdapter(_FakeAdapter((_) async => _empty(204)));
  });

  test('signup includes email when provided', () async {
    useAdapter(_FakeAdapter((_) async => _json(_tokenResponse, statusCode: 201)));
    await repo.signup(username: 'u', password: 'p', displayName: 'D', email: 'a@b.com');
    final req = adapter.requests.single;
    expect(req.path, '/auth/signup');
    expect((req.data as Map)['email'], 'a@b.com');
  });

  test('signup omits email when empty', () async {
    useAdapter(_FakeAdapter((_) async => _json(_tokenResponse, statusCode: 201)));
    await repo.signup(username: 'u', password: 'p', displayName: 'D', email: '');
    expect((adapter.requests.single.data as Map).containsKey('email'), false);
  });

  test('signup omits email when null', () async {
    useAdapter(_FakeAdapter((_) async => _json(_tokenResponse, statusCode: 201)));
    await repo.signup(username: 'u', password: 'p', displayName: 'D');
    expect((adapter.requests.single.data as Map).containsKey('email'), false);
  });

  test('requestPasswordReset posts email', () async {
    useAdapter(_FakeAdapter((_) async => _empty(202)));
    await repo.requestPasswordReset('a@b.com');
    expect(adapter.requests.single.path, '/auth/password-reset/request');
    expect((adapter.requests.single.data as Map)['email'], 'a@b.com');
  });

  test('confirmPasswordReset posts email/code/new_password', () async {
    await repo.confirmPasswordReset('a@b.com', '123456', 'newpass12');
    final body = adapter.requests.single.data as Map;
    expect(adapter.requests.single.path, '/auth/password-reset/confirm');
    expect(body['email'], 'a@b.com');
    expect(body['code'], '123456');
    expect(body['new_password'], 'newpass12');
  });

  test('requestEmailVerification posts email', () async {
    useAdapter(_FakeAdapter((_) async => _empty(202)));
    await repo.requestEmailVerification('a@b.com');
    expect(adapter.requests.single.path, '/me/email/request');
    expect((adapter.requests.single.data as Map)['email'], 'a@b.com');
  });

  test('confirmEmailVerification posts code', () async {
    useAdapter(_FakeAdapter((_) async => _json({'verified': true})));
    await repo.confirmEmailVerification('123456');
    expect(adapter.requests.single.path, '/me/email/confirm');
    expect((adapter.requests.single.data as Map)['code'], '123456');
  });

  test('changePassword posts current/new password', () async {
    await repo.changePassword('old12345', 'new12345');
    final body = adapter.requests.single.data as Map;
    expect(adapter.requests.single.path, '/me/password');
    expect(body['current_password'], 'old12345');
    expect(body['new_password'], 'new12345');
  });

  test('getMe parses email/email_verified/has_password', () async {
    useAdapter(_FakeAdapter((_) async => _json({
          'user_id': 1, 'username': 'u', 'display_name': 'D',
          'theme': 'dark', 'language': 'ko',
          'email': 'a@b.com', 'email_verified': true, 'has_password': true,
        })));
    final me = await repo.getMe();
    expect(me.email, 'a@b.com');
    expect(me.emailVerified, true);
    expect(me.hasPassword, true);
  });

  // signup/login 응답(TokenResponse)에는 email 계열 필드가 없다 — 크래시 대신 기본값.
  test('AuthUser defaults email fields when absent', () async {
    useAdapter(_FakeAdapter((_) async => _json(_tokenResponse, statusCode: 201)));
    final user = await repo.signup(username: 'u', password: 'p', displayName: 'D');
    expect(user.email, isNull);
    expect(user.emailVerified, false);
    expect(user.hasPassword, false);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd verse-flutter && flutter test test/auth_repository_email_test.dart`
Expected: FAIL (email 파라미터/메서드 미정의, `emailVerified`/`hasPassword` 게터 없음)

- [ ] **Step 3: Write minimal implementation**

`lib/core/auth/auth_repository.dart` — `AuthUser`에 필드 3개 추가:

```dart
  final String? email;
  final bool emailVerified;
  final bool hasPassword;
```

생성자에 `this.email, this.emailVerified = false, this.hasPassword = false` 추가. `fromJson`에:

```dart
        // 이 세 필드는 GET /me 응답에만 있다 — signup/login 응답에는 없으므로
        // 부재 시 안전 기본값으로 떨어뜨린다(비번 변경 UI는 false면 감춰진다).
        email: j['email'] as String?,
        emailVerified: j['email_verified'] as bool? ?? false,
        hasPassword: j['has_password'] as bool? ?? false,
```

`signup` 시그니처를 `{required String username, required String password, required String displayName, String? email}`로 바꾸고 body에 `if (email != null && email.isNotEmpty) 'email': email,` 추가.

메서드 5개 추가 (클래스 내부, `deleteAccount` 근처). 모두 `async`로 감싸 실제 `Future<void>`를 반환한다(`updateProfile` 주석의 크래시 전례):

```dart
  /// 웹 auth.ts requestPasswordReset 대응. 백엔드는 계정 존재 여부와 무관하게
  /// 항상 202를 주므로(열거 공격 방지) 호출부는 성공을 그대로 신뢰하면 된다.
  Future<void> requestPasswordReset(String email) async {
    await _client.dio.post('/auth/password-reset/request', data: {'email': email});
  }

  Future<void> confirmPasswordReset(String email, String code, String newPassword) async {
    await _client.dio.post('/auth/password-reset/confirm',
        data: {'email': email, 'code': code, 'new_password': newPassword});
  }

  Future<void> requestEmailVerification(String email) async {
    await _client.dio.post('/me/email/request', data: {'email': email});
  }

  Future<void> confirmEmailVerification(String code) async {
    await _client.dio.post('/me/email/confirm', data: {'code': code});
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    await _client.dio.post('/me/password',
        data: {'current_password': currentPassword, 'new_password': newPassword});
  }
```

- [ ] **Step 4: Run tests + analyze**

Run: `cd verse-flutter && flutter test test/auth_repository_email_test.dart && flutter analyze`
Expected: PASS, 0 issues. (기존 `signup` 호출부 `signup_screen.dart:59`는 email 미전달이어도 선택 파라미터라 컴파일 OK.)

- [ ] **Step 5: Commit**

```bash
git add verse-flutter/lib/core/auth/auth_repository.dart verse-flutter/test/auth_repository_email_test.dart
git commit -m "feat(mobile): AuthRepository 이메일 인증/비밀번호 재설정·변경 메서드 추가"
```

---

### Task 2: 회원가입 화면 이메일(선택) 필드

**Files:**
- Modify: `lib/features/auth/signup_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`

**Interfaces:**
- Consumes: `AuthRepository.signup(..., email:)` (Task 1)
- Produces: 없음(화면 내부)

- [ ] **Step 1: arb 키 추가**

웹 `messages/ko.json:34` / `en.json:34`의 `auth.emailOptional`을 그대로 가져온다.

| key | ko | en |
|---|---|---|
| `signupEmailOptional` | `이메일 (선택)` | `Email (optional)` |

- [ ] **Step 2: 생성물 재생성**

Run: `cd verse-flutter && flutter gen-l10n`
Expected: `l.signupEmailOptional` 게터 생성.

- [ ] **Step 3: 이메일 컨트롤러 + 필드 추가**

`signup_screen.dart`: `final _email = TextEditingController();` 추가(라인 32 부근), `dispose()`에 `_email.dispose();`. `AutofillGroup` 안 displayName TextField(라인 113) 아래에:

```dart
                    const SizedBox(height: 12),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: InputDecoration(labelText: l.signupEmailOptional),
                    ),
```

`_signup()`의 signup 호출(라인 59)에 `email: _email.text.trim()` 전달.

> 이메일 형식 검증은 넣지 않는다 — 백엔드가 `SetPendingEmail` 실패를 무시하므로(`auth_handler.go:32`) 잘못된 이메일이 가입을 막지 않고, 웹도 브라우저 `type="email"` 외 별도 검증이 없다.

- [ ] **Step 4: analyze**

Run: `cd verse-flutter && flutter analyze`
Expected: 0 issues.

- [ ] **Step 5: Commit**

```bash
git add verse-flutter/lib/features/auth/signup_screen.dart verse-flutter/lib/l10n/
git commit -m "feat(mobile): 회원가입에 이메일(선택) 입력 추가"
```

---

### Task 3: 비밀번호 찾기 화면 + 라우트 + 로그인 링크

**Files:**
- Create: `lib/features/auth/forgot_password_screen.dart`
- Modify: `lib/app/router.dart`
- Modify: `lib/features/auth/login_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`

**Interfaces:**
- Consumes: `AuthRepository.requestPasswordReset`, `confirmPasswordReset` (Task 1); `authRepositoryProvider`(`app/providers.dart`, `login_screen.dart:11`과 동일 import).
- Produces: `ForgotPasswordScreen` 위젯, `/forgot-password` 라우트.

- [ ] **Step 1: arb 키 추가**

웹 `messages/{ko,en}.json`의 `reset` 네임스페이스(231~243행) + `auth.forgotPassword`(33행)에서 그대로 가져온다. 에러 문구는 백엔드 상태코드 매핑용으로 신규 작성.

| key | ko | en |
|---|---|---|
| `resetTitle` | `비밀번호 재설정` | `Reset password` |
| `resetForgotPassword` | `비밀번호를 잊으셨나요?` | `Forgot your password?` |
| `resetEmail` | `이메일` | `Email` |
| `resetCode` | `인증 코드` | `Verification code` |
| `resetNewPassword` | `새 비밀번호` | `New password` |
| `resetSendCode` | `코드 받기` | `Send code` |
| `resetResetPassword` | `비밀번호 재설정` | `Reset password` |
| `resetProcessing` | `처리 중...` | `Processing...` |
| `resetCodeSentHint` | `{email} 로 코드를 보냈습니다` | `We sent a code to {email}` |
| `resetDoneMessage` | `비밀번호가 변경되었습니다` | `Your password has been changed` |
| `resetBackToLogin` | `로그인으로 돌아가기` | `Back to login` |
| `resetEmailRequired` | `이메일을 입력해 주세요` | `Please enter your email` |
| `resetPasswordTooShort` | `새 비밀번호는 8자 이상이어야 해요` | `New password must be at least 8 characters` |
| `resetInvalidCode` | `이메일 또는 인증 코드가 올바르지 않아요` | `Email or verification code is incorrect` |
| `resetTooManyAttempts` | `시도 횟수를 초과했어요. 코드를 다시 받아 주세요` | `Too many attempts. Please request a new code` |
| `resetGenericError` | `오류가 발생했습니다` | `Something went wrong` |

`resetCodeSentHint`는 플레이스홀더가 있으므로 `app_ko.arb`(template)에 `@` 메타데이터가 필요하다:

```json
  "resetCodeSentHint": "{email} 로 코드를 보냈습니다",
  "@resetCodeSentHint": {
    "placeholders": { "email": { "type": "String" } }
  },
```

Run: `cd verse-flutter && flutter gen-l10n`

- [ ] **Step 2: 화면 작성**

`lib/features/auth/forgot_password_screen.dart` — 웹 `app/[locale]/forgot-password/page.tsx`의 3단계(`email`/`code`/`done`)를 미러링한다. 기존 auth 화면들과 동일하게 `PixelCard` + `ElevatedButton` + 인라인 `_error` 텍스트를 쓴다:

```dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

import '../../app/providers.dart';
import '../../shared/theme/pixel_theme.dart';

enum _Step { email, code, done }

/// 웹 forgot-password/page.tsx 미러 — 이메일로 6자리 코드를 받아(10분 유효)
/// 새 비밀번호로 교체한다. 백엔드는 request 단계에서 계정 존재 여부와 무관하게
/// 항상 202를 주므로(열거 공격 방지) 성공/실패로 계정 유무를 알 수 없다.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _newPassword = TextEditingController();
  _Step _step = _Step.email;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _newPassword.dispose();
    super.dispose();
  }

  Future<void> _request(AppLocalizations l) async {
    if (_email.text.trim().isEmpty) {
      setState(() => _error = l.resetEmailRequired);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).requestPasswordReset(_email.text.trim());
      if (mounted) setState(() => _step = _Step.code);
    } catch (_) {
      if (mounted) setState(() => _error = l.resetGenericError);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirm(AppLocalizations l) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).confirmPasswordReset(
            _email.text.trim(),
            _code.text.trim(),
            _newPassword.text,
          );
      if (mounted) setState(() => _step = _Step.done);
    } on DioException catch (e) {
      // auth_service.ConfirmPasswordReset: 400=새 비번 8자 미만,
      // 401=이메일 미존재/코드 불일치, 429=코드 시도 5회 초과.
      setState(() => _error = switch (e.response?.statusCode) {
            400 => l.resetPasswordTooShort,
            401 => l.resetInvalidCode,
            429 => l.resetTooManyAttempts,
            _ => l.resetGenericError,
          });
    } catch (_) {
      if (mounted) setState(() => _error = l.resetGenericError);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l.resetTitle)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PixelCard(child: Column(children: _fields(l))),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loading ? null : () => _onPrimary(l),
                child: _loading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(_primaryLabel(l)),
              ),
              Center(
                child: TextButton(
                  onPressed: () => context.pop(),
                  child: Text(l.resetBackToLogin),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _fields(AppLocalizations l) => switch (_step) {
        _Step.email => [
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: InputDecoration(labelText: l.resetEmail),
            ),
          ],
        _Step.code => [
            Text(l.resetCodeSentHint(_email.text.trim())),
            const SizedBox(height: 12),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: InputDecoration(labelText: l.resetCode),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _newPassword,
              obscureText: true,
              autofillHints: const [AutofillHints.newPassword],
              decoration: InputDecoration(labelText: l.resetNewPassword),
            ),
          ],
        _Step.done => [Text(l.resetDoneMessage)],
      };

  String _primaryLabel(AppLocalizations l) => switch (_step) {
        _Step.email => l.resetSendCode,
        _Step.code => l.resetResetPassword,
        _Step.done => l.resetBackToLogin,
      };

  void _onPrimary(AppLocalizations l) {
    switch (_step) {
      case _Step.email:
        _request(l);
      case _Step.code:
        _confirm(l);
      case _Step.done:
        context.pop(); // push로 열렸으므로 pop하면 로그인 화면으로 돌아간다
    }
  }
}
```

> 완료 후 `context.go('/login')` 대신 `context.pop()`을 쓴다 — 이 화면은 로그인 화면에서 push로 열리므로, 기존 auth 화면들의 pop 기반 복귀 패턴(`login_screen.dart:17` `_afterAuthSuccess`)과 일치한다.

- [ ] **Step 3: 라우트 등록**

`lib/app/router.dart`의 `/signup`(라인 31) 다음 줄에:

```dart
    GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
```

상단에 `import '../features/auth/forgot_password_screen.dart';` 추가(라인 5 부근, 기존 auth import들과 같이).

- [ ] **Step 4: 로그인 화면 링크 추가**

`login_screen.dart`의 signup 유도 버튼(`context.push('/signup')`, 라인 168~173) 다음에:

```dart
            Center(
              child: TextButton(
                onPressed: () => context.push('/forgot-password'),
                child: Text(l.resetForgotPassword),
              ),
            ),
```

- [ ] **Step 5: analyze**

Run: `cd verse-flutter && flutter analyze`
Expected: 0 issues.

- [ ] **Step 6: Commit**

```bash
git add verse-flutter/lib/features/auth/forgot_password_screen.dart verse-flutter/lib/app/router.dart verse-flutter/lib/features/auth/login_screen.dart verse-flutter/lib/l10n/
git commit -m "feat(mobile): 비밀번호 찾기 화면 + 로그인 화면 링크 추가"
```

---

### Task 4: 설정 이메일 인증 섹션

**Files:**
- Modify: `lib/features/settings/settings_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`

**Interfaces:**
- Consumes: `AuthRepository.requestEmailVerification`, `confirmEmailVerification`, `getMe`(email/emailVerified) (Task 1).
- Produces: 없음(설정 화면 내부 `_EmailRow` 위젯).

- [ ] **Step 1: arb 키 추가**

웹 `messages/{ko,en}.json`의 `settings` 네임스페이스(99~115행)에서 가져온다.

| key | ko | en |
|---|---|---|
| `settingsRecoveryEmail` | `복구 이메일` | `Recovery email` |
| `settingsNoEmail` | `등록된 이메일 없음` | `No email on file` |
| `settingsAddEmail` | `이메일 등록` | `Add email` |
| `settingsChangeEmail` | `이메일 변경` | `Change email` |
| `settingsEmailVerifiedBadge` | `인증됨` | `verified` |
| `settingsEmailUnverifiedBadge` | `미인증` | `unverified` |
| `settingsSendCode` | `코드 받기` | `Send code` |
| `settingsVerify` | `인증하기` | `Verify` |
| `settingsEmailVerifiedDone` | `이메일이 인증되었습니다` | `Email verified` |
| `settingsEmailInvalid` | `올바른 이메일을 입력해 주세요` | `Please enter a valid email` |
| `settingsCodeRateLimited` | `코드 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요` | `Too many code requests. Please try again later` |
| `settingsCodeInvalid` | `인증 코드가 올바르지 않아요` | `Verification code is incorrect` |
| `settingsSecurityError` | `오류가 발생했습니다` | `Something went wrong` |

기존 `settingsCancel`/`settingsSave`/`settingsSaving`/`settingsCode`는 재사용 가능한지 확인하고, `settingsCode`가 없으면 추가:

| key | ko | en |
|---|---|---|
| `settingsCode` | `인증 코드` | `Verification code` |

Run: `cd verse-flutter && flutter gen-l10n`

- [ ] **Step 2: 이메일 섹션 위젯 추가**

`settings_screen.dart`에 `_EmailRow`(ConsumerStatefulWidget)를 `_EditNameRow`(라인 400) 뒤에 추가한다. 웹의 `emailStep: "idle" | "editing" | "verifying"` 상태머신을 미러링하고, 레이아웃·에러표시·버튼 배치는 `_EditNameRow`를 그대로 따른다(`_SettingsRow` + 편집 시 `Container`+`Border`):

```dart
enum _EmailStep { idle, editing, verifying }

/// 웹 settings/page.tsx의 emailStep 상태머신 미러 — 이메일을 등록하면
/// 6자리 코드가 발송되고(10분 유효), 코드를 확인하면 email_verified가 된다.
class _EmailRow extends ConsumerStatefulWidget {
  const _EmailRow({required this.email, required this.verified, required this.onVerified});
  final String? email;
  final bool verified;
  final VoidCallback onVerified;

  @override
  ConsumerState<_EmailRow> createState() => _EmailRowState();
}

class _EmailRowState extends ConsumerState<_EmailRow> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  _EmailStep _step = _EmailStep.idle;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _sendCode(AppLocalizations l) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).requestEmailVerification(_email.text.trim());
      if (mounted) setState(() => _step = _EmailStep.verifying);
    } on DioException catch (e) {
      // RequestEmailVerification: 400=이메일 형식, 429=시간당 3회 초과.
      setState(() => _error = switch (e.response?.statusCode) {
            400 => l.settingsEmailInvalid,
            429 => l.settingsCodeRateLimited,
            _ => l.settingsSecurityError,
          });
    } catch (_) {
      if (mounted) setState(() => _error = l.settingsSecurityError);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _confirm(AppLocalizations l) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).confirmEmailVerification(_code.text.trim());
      if (!mounted) return;
      setState(() => _step = _EmailStep.idle);
      widget.onVerified(); // 상위에서 getMe 재조회
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.settingsEmailVerifiedDone)),
      );
    } on DioException catch (e) {
      // ConfirmEmailVerification: 401=코드 불일치/없음, 429=시도 5회 초과.
      setState(() => _error = switch (e.response?.statusCode) {
            401 => l.settingsCodeInvalid,
            429 => l.settingsCodeRateLimited,
            _ => l.settingsSecurityError,
          });
    } catch (_) {
      if (mounted) setState(() => _error = l.settingsSecurityError);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final p = context.pixel;

    if (_step == _EmailStep.idle) {
      final badge = widget.verified ? l.settingsEmailVerifiedBadge : l.settingsEmailUnverifiedBadge;
      return _SettingsRow(
        title: l.settingsRecoveryEmail,
        subtitle: widget.email == null ? l.settingsNoEmail : '${widget.email} ($badge)',
        trailing: TextButton(
          onPressed: () {
            _email.text = widget.email ?? '';
            setState(() {
              _step = _EmailStep.editing;
              _error = null;
            });
          },
          child: Text(widget.email == null ? l.settingsAddEmail : l.settingsChangeEmail),
        ),
        onTap: () {},
      );
    }

    final editing = _step == _EmailStep.editing;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: p.border, width: 1))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.settingsRecoveryEmail, style: TextStyle(color: p.text, fontSize: 15)),
          const SizedBox(height: 8),
          if (editing)
            TextField(
              controller: _email,
              enabled: !_saving,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(labelText: l.settingsRecoveryEmail),
            )
          else
            TextField(
              controller: _code,
              enabled: !_saving,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: InputDecoration(labelText: l.settingsCode),
            ),
          if (_error != null) Text(_error!, style: TextStyle(color: p.red, fontSize: 12)),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: _saving ? null : () => setState(() => _step = _EmailStep.idle),
                child: Text(l.settingsCancel),
              ),
              TextButton(
                onPressed: _saving ? null : () => editing ? _sendCode(l) : _confirm(l),
                child: Text(_saving
                    ? l.settingsSaving
                    : (editing ? l.settingsSendCode : l.settingsVerify)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
```

`_AccountGroupState.build`의 `_EditNameRow` 렌더(라인 303) 다음 줄에 추가:

```dart
              _EmailRow(
                email: me.email,
                verified: me.emailVerified,
                onVerified: () => setState(() => _meFuture = ref.read(authRepositoryProvider).getMe()),
              ),
```

> `me`는 `getMe()` 결과인 `AuthUser`이고 `if (me != null)` 블록 안이므로 `me.email`/`me.emailVerified`를 바로 쓸 수 있다(Task 1에서 필드 추가됨).

- [ ] **Step 3: analyze**

Run: `cd verse-flutter && flutter analyze`
Expected: 0 issues.

- [ ] **Step 4: Commit**

```bash
git add verse-flutter/lib/features/settings/settings_screen.dart verse-flutter/lib/l10n/
git commit -m "feat(mobile): 설정에 복구 이메일 인증 섹션 추가"
```

---

### Task 5: 설정 비밀번호 변경 섹션

> v1에 없던 신규 태스크 — 웹에는 있고 모바일에는 없는 4번째 격차.

**Files:**
- Modify: `lib/features/settings/settings_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`

**Interfaces:**
- Consumes: `AuthRepository.changePassword`, `AuthUser.hasPassword` (Task 1).
- Produces: 없음(설정 화면 내부 `_ChangePasswordRow` 위젯).

- [ ] **Step 1: arb 키 추가**

웹 `messages/{ko,en}.json`의 `settings` 네임스페이스(109~115행)에서 가져온다.

| key | ko | en |
|---|---|---|
| `settingsPassword` | `비밀번호` | `Password` |
| `settingsChangePassword` | `비밀번호 변경` | `Change password` |
| `settingsCurrentPassword` | `현재 비밀번호` | `Current password` |
| `settingsNewPassword` | `새 비밀번호` | `New password` |
| `settingsPasswordChanged` | `비밀번호가 변경되었습니다` | `Password changed` |
| `settingsPasswordTooShort` | `새 비밀번호는 8자 이상이어야 해요` | `New password must be at least 8 characters` |
| `settingsCurrentPasswordWrong` | `현재 비밀번호가 올바르지 않아요` | `Current password is incorrect` |

(`settingsSecurityError`는 Task 4에서 이미 추가됨.)

Run: `cd verse-flutter && flutter gen-l10n`

- [ ] **Step 2: 비밀번호 변경 위젯 추가**

`settings_screen.dart`에 `_ChangePasswordRow`를 `_EmailRow` 뒤에 추가. 구조는 `_EditNameRow`와 동일:

```dart
/// 웹 settings/page.tsx의 비밀번호 변경 블록 미러. 소셜 로그인 전용 계정은
/// 비밀번호가 없어(has_password=false) 상위에서 아예 렌더하지 않는다.
class _ChangePasswordRow extends ConsumerStatefulWidget {
  const _ChangePasswordRow();

  @override
  ConsumerState<_ChangePasswordRow> createState() => _ChangePasswordRowState();
}

class _ChangePasswordRowState extends ConsumerState<_ChangePasswordRow> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _editing = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _save(AppLocalizations l) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).changePassword(_current.text, _next.text);
      if (!mounted) return;
      _current.clear();
      _next.clear();
      setState(() => _editing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.settingsPasswordChanged)),
      );
    } on DioException catch (e) {
      // ChangePassword: 400=새 비번 8자 미만, 401=현재 비번 불일치.
      // (400 ErrNoPassword는 has_password 게이트 때문에 여기 도달하지 않는다.)
      setState(() => _error = switch (e.response?.statusCode) {
            400 => l.settingsPasswordTooShort,
            401 => l.settingsCurrentPasswordWrong,
            _ => l.settingsSecurityError,
          });
    } catch (_) {
      if (mounted) setState(() => _error = l.settingsSecurityError);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final p = context.pixel;

    if (!_editing) {
      return _SettingsRow(
        title: l.settingsPassword,
        trailing: TextButton(
          onPressed: () => setState(() {
            _editing = true;
            _error = null;
          }),
          child: Text(l.settingsChangePassword),
        ),
        onTap: () => setState(() => _editing = true),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: p.border, width: 1))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.settingsPassword, style: TextStyle(color: p.text, fontSize: 15)),
          const SizedBox(height: 8),
          TextField(
            controller: _current,
            obscureText: true,
            enabled: !_saving,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(labelText: l.settingsCurrentPassword),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _next,
            obscureText: true,
            enabled: !_saving,
            autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(labelText: l.settingsNewPassword),
          ),
          if (_error != null) Text(_error!, style: TextStyle(color: p.red, fontSize: 12)),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: _saving ? null : () => setState(() => _editing = false),
                child: Text(l.settingsCancel),
              ),
              TextButton(
                onPressed: _saving ? null : () => _save(l),
                child: Text(_saving ? l.settingsSaving : l.settingsSave),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
```

`_AccountGroupState.build`의 `_EmailRow`(Task 4에서 추가) 다음 줄에:

```dart
              if (me.hasPassword) const _ChangePasswordRow(),
```

> 웹과 동일하게 소셜 전용 계정에서는 섹션을 감춘다. 웹은 대신 안내 문구(`socialAccountNoPassword`)를 띄우지만, 모바일 설정은 문구 없는 행 목록이라 감추기만 한다.

- [ ] **Step 3: analyze**

Run: `cd verse-flutter && flutter analyze`
Expected: 0 issues.

- [ ] **Step 4: Commit**

```bash
git add verse-flutter/lib/features/settings/settings_screen.dart verse-flutter/lib/l10n/
git commit -m "feat(mobile): 설정에 비밀번호 변경 섹션 추가"
```

---

### Task 6: 통합 검증

**Files:** 없음(검증만)

- [ ] **Step 1: 전체 테스트 + 정적 분석**

Run: `cd verse-flutter && flutter analyze && flutter test`
Expected: 0 issues, 전체 테스트 PASS(기존 + Task 1 신규).

- [ ] **Step 2: 프로토콜 레벨 백엔드 검증**

로컬 `verse-backend`(Postgres 포함) 기동 후, 실제 요청으로 검증(기존 Phase 4 방식):
- `POST /v1/auth/signup` email 포함 → 201, DB `users.email` 저장 + `email_verified=false` 확인
- `POST /v1/me/email/request` → 202, `auth_codes`에 `verify_email` 행 생성 → `POST /v1/me/email/confirm` → 200, `email_verified=true`
- `POST /v1/auth/password-reset/request` → 202(미존재 이메일도 202인지 함께 확인) → `confirm` → 204, 새 비번으로 로그인 성공
- `POST /v1/me/password` → 204, 새 비번으로 로그인 성공 / 틀린 현재 비번 → 401
- `GET /v1/me` 응답에 `email`/`email_verified`/`has_password` 포함 확인

기대: 웹과 동일한 응답 스키마·상태코드·DB 반영.

- [ ] **Step 3: 실기기 스모크 테스트**

이메일 발송이 실제로 되는 경로(코드 수신)는 단위 테스트로 못 잡으므로 1회 수동 확인:
- 신규 가입(이메일 입력) → 설정에서 코드 받기 → 메일 수신 → 인증 → `(인증됨)` 배지 표시
- 로그아웃 → 비밀번호 찾기 → 코드 수신 → 재설정 → 새 비번 로그인
- ko/en 전환 시 신규 문구가 모두 번역되어 나오는지 확인(하드코딩 잔재 탐지)

- [ ] **Step 4: 최종 커밋(있을 경우)**

검증 중 수정이 없으면 커밋 없음. 있으면:

```bash
git add -A && git commit -m "fix(mobile): 이메일 인증 통합 검증 반영"
```

---

## Self-Review

- **Spec coverage:** 격차 4종(회원가입 이메일=Task 2, 비번 재설정=Task 3, 설정 이메일 인증=Task 4, 비밀번호 변경=Task 5) + 모델/레포(Task 1) + 검증(Task 6) 모두 매핑됨. 이모지 항목은 스펙에서 명시적으로 제외됨.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드가 있고, arb 문구는 웹 `messages/*.json`에서 확정된 값으로 표에 명시했다. "구현 시 확정" 항목 없음.
- **Type consistency:** `signup(email:)`, `requestPasswordReset`, `confirmPasswordReset(email,code,newPassword)`, `requestEmailVerification`, `confirmEmailVerification(code)`, `changePassword(current,new)`, `AuthUser.email`/`emailVerified`/`hasPassword` 명칭이 Task 1 정의와 Task 2–5 사용처에서 일치.
- **Error-path coverage:** 각 화면의 catch가 백엔드 실제 상태코드(위 계약 표)와 1:1 대응하며, raw 예외 문자열을 사용자에게 노출하는 경로가 없다.
- **검증 한계:** 단위 테스트는 요청 스키마만 검증한다. 코드 발송/수신, 레이트리밋 실동작, arb 번역 누락은 Task 6 Step 2·3의 수동 검증에 의존한다.

## Non-goals

백엔드/웹 변경, 광고, 알림, 이모지→픽셀 교체(스펙 참조), 소셜 로그인 계정의 이메일 자동 인증, 코드 재발송(resend) 버튼(웹에도 없음 — 취소 후 재시도로 대체).

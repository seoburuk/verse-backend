# UMP 동의폼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EEA/UK/스위스 사용자에게 광고 노출 전 Google UMP 동의폼을 표시하고, 동의 완료 후에만 광고 SDK를 초기화한다.

**Architecture:** `google_mobile_ads`가 이미 포함한 UMP API(`ConsentInformation`, `ConsentForm`)를 콜백 기반에서 `Future` 기반으로 감싸는 `UmpConsentGate` 클래스 하나를 신설한다. 이 클래스가 순서(UMP → canRequestAds 대기 → ATT)를 강제하고, `AdService.init()`은 이 게이트를 통과한 뒤에만 `MobileAds.instance.initialize()`를 부른다. 설정 화면에는 동의 재설정 진입점을 추가한다.

**Tech Stack:** Flutter 3 / Riverpod · `google_mobile_ads` 5.3.1(잠긴 버전, `pubspec.yaml`은 `^5.2.0`) · `app_tracking_transparency`(기존 ATT 처리)

## Global Constraints

- **저장소:** `verse-flutter/`는 독립 git 저장소(현재 `main`). 이 계획의 모든 태스크는 여기서만 작업한다.
- **UMP 먼저, ATT 다음.** Google 권장 순서. `AdService.init()`의 현재 순서(ATT → `MobileAds.initialize()`)를 뒤집는다.
- **거부해도 광고는 계속 노출한다(비개인화).** SDK가 `AdRequest`에 NPA 플래그를 자동 반영하므로 `_loadInterstitial`/`_loadRewarded`의 광고 로드 코드는 건드리지 않는다.
- **`MobileAds.instance.initialize()`는 `canRequestAds()`가 `true`가 된 뒤에만 호출한다.** 이 순서를 어기면 동의 없이 광고 SDK가 활성화되어 정책 위반이다.
- **디버그 지역 강제는 `kDebugMode`로만 감싼다.** release 빌드에 `DebugGeography` 설정이 들어가면 안 된다.
- **실패는 조용히 넘긴다.** `requestConsentInfoUpdate` 실패 시 이번 세션은 광고 없이 진행하고 예외를 던지지 않는다. 기존 `AdService.init()`의 실패 처리 패턴과 동일하다.
- **실제 API 확인 완료:** `ConsentInformation.instance`는 재할당 가능한 정적 필드(테스트에서 페이크로 교체 가능). `ConsentForm`의 정적 메서드(`loadAndShowConsentFormIfRequired`, `showPrivacyOptionsForm`)는 내부적으로 `UserMessagingChannel.instance`(별도 플랫폼 채널)를 직접 호출하므로 `ConsentInformation` 페이크로는 가로챌 수 없다 — 이 계획은 자체 `ConsentFormLoader` 인터페이스로 감싸 테스트 가능하게 만든다.
- `DebugGeography`의 EEA 값은 **`debugGeographyEea`**다(`debugGeographyEEA`가 아니다 — 대소문자 주의).
- l10n 문자열은 `lib/l10n/app_ko.arb`(템플릿)와 `lib/l10n/app_en.arb`를 **둘 다** 수정하고 `flutter gen-l10n`을 돌린다. 생성 파일(`app_localizations*.dart`)은 커밋한다.
- `*.g.dart`(drift 생성 파일)는 이 계획에서 건드리지 않는다.
- 각 태스크는 `flutter test`가 통과한 상태로 끝난다.

---

### Task 1: `UmpConsentGate` — 동의 순서 강제 로직

**Files:**
- Create: `lib/core/ads/ump_consent_gate.dart`
- Test: `test/ump_consent_gate_test.dart`

**Interfaces:**
- Consumes: `package:google_mobile_ads/google_mobile_ads.dart`의 `ConsentInformation`, `ConsentStatus`, `ConsentRequestParameters`, `ConsentDebugSettings`, `DebugGeography`, `PrivacyOptionsRequirementStatus`
- Produces:
  - `abstract class ConsentFormLoader { Future<void> loadAndShowIfRequired(); Future<void> showPrivacyOptionsForm(); }`
  - `class RealConsentFormLoader implements ConsentFormLoader`
  - `class UmpConsentGate(ConsentInformation info, ConsentFormLoader formLoader, {bool debugForceEea = false})`
  - `Future<bool> UmpConsentGate.ensureConsent()` — UMP 흐름을 완료하고 `canRequestAds()` 최종값을 반환. 내부 실패는 삼키고 `false`를 반환한다.
  - `Future<PrivacyOptionsRequirementStatus> UmpConsentGate.privacyOptionsStatus()`
  - `Future<void> UmpConsentGate.reopenPrivacyOptions()` — 설정 화면이 호출

- [ ] **Step 1: 실패하는 테스트 작성**

`test/ump_consent_gate_test.dart` 생성:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:verse_flutter/core/ads/ump_consent_gate.dart';

/// ConsentInformation은 추상 클래스라 완전히 페이크로 구현할 수 있다.
class _FakeConsentInformation implements ConsentInformation {
  _FakeConsentInformation({
    required this.statusAfterUpdate,
    this.updateShouldFail = false,
  });

  final ConsentStatus statusAfterUpdate;
  final bool updateShouldFail;

  bool requestUpdateCalled = false;
  ConsentRequestParameters? lastParams;

  /// requestConsentInfoUpdate 직후 canRequestAds가 돌려줄 값.
  /// 폼을 보여준 뒤에는 true로 바뀌는 시나리오를 흉내내기 위해 가변으로 둔다.
  bool canRequestAdsValue = false;

  @override
  void requestConsentInfoUpdate(
    ConsentRequestParameters params,
    OnConsentInfoUpdateSuccessListener successListener,
    OnConsentInfoUpdateFailureListener failureListener,
  ) {
    requestUpdateCalled = true;
    lastParams = params;
    if (updateShouldFail) {
      failureListener(FormError(errorCode: 1, message: 'network'));
      return;
    }
    canRequestAdsValue = statusAfterUpdate == ConsentStatus.notRequired ||
        statusAfterUpdate == ConsentStatus.obtained;
    successListener();
  }

  @override
  Future<bool> isConsentFormAvailable() async => statusAfterUpdate == ConsentStatus.required;

  @override
  Future<ConsentStatus> getConsentStatus() async => statusAfterUpdate;

  @override
  Future<void> reset() async {}

  @override
  Future<bool> canRequestAds() async => canRequestAdsValue;

  @override
  Future<PrivacyOptionsRequirementStatus> getPrivacyOptionsRequirementStatus() async =>
      statusAfterUpdate == ConsentStatus.obtained
          ? PrivacyOptionsRequirementStatus.required
          : PrivacyOptionsRequirementStatus.notRequired;
}

class _FakeFormLoader implements ConsentFormLoader {
  int loadCalls = 0;
  int privacyCalls = 0;

  /// loadAndShowIfRequired가 호출되면 동의가 완료된 것으로 친다.
  final void Function()? onLoad;

  _FakeFormLoader({this.onLoad});

  @override
  Future<void> loadAndShowIfRequired() async {
    loadCalls++;
    onLoad?.call();
  }

  @override
  Future<void> showPrivacyOptionsForm() async {
    privacyCalls++;
  }
}

void main() {
  test('동의가 필요 없는 지역이면 폼을 띄우지 않고 true를 반환한다', () async {
    final info = _FakeConsentInformation(statusAfterUpdate: ConsentStatus.notRequired);
    final formLoader = _FakeFormLoader();
    final gate = UmpConsentGate(info, formLoader);

    final result = await gate.ensureConsent();

    expect(result, isTrue);
    expect(formLoader.loadCalls, 0);
  });

  test('동의가 필요하면 폼을 띄우고, 완료 후 true를 반환한다', () async {
    final info = _FakeConsentInformation(statusAfterUpdate: ConsentStatus.required);
    final formLoader = _FakeFormLoader(onLoad: () {});
    final gate = UmpConsentGate(info, formLoader);
    // 폼이 완료되면 canRequestAds가 true로 바뀌는 상황을 흉내낸다.
    formLoader.onLoad;
    info.canRequestAdsValue = false;
    final formLoaderWithSideEffect = _FakeFormLoader(onLoad: () => info.canRequestAdsValue = true);
    final gate2 = UmpConsentGate(info, formLoaderWithSideEffect);

    final result = await gate2.ensureConsent();

    expect(formLoaderWithSideEffect.loadCalls, 1);
    expect(result, isTrue);
  });

  test('이미 동의를 받았으면(obtained) 폼을 다시 띄우지 않는다', () async {
    final info = _FakeConsentInformation(statusAfterUpdate: ConsentStatus.obtained);
    final formLoader = _FakeFormLoader();
    final gate = UmpConsentGate(info, formLoader);

    final result = await gate.ensureConsent();

    expect(result, isTrue);
    expect(formLoader.loadCalls, 0);
  });

  test('requestConsentInfoUpdate가 실패하면 false를 반환하고 예외를 던지지 않는다', () async {
    final info = _FakeConsentInformation(
      statusAfterUpdate: ConsentStatus.unknown,
      updateShouldFail: true,
    );
    final formLoader = _FakeFormLoader();
    final gate = UmpConsentGate(info, formLoader);

    final result = await gate.ensureConsent();

    expect(result, isFalse);
    expect(formLoader.loadCalls, 0);
  });

  test('debugForceEea가 true면 요청 파라미터에 EEA 디버그 지역이 실린다', () async {
    final info = _FakeConsentInformation(statusAfterUpdate: ConsentStatus.required);
    final formLoader = _FakeFormLoader(onLoad: () => info.canRequestAdsValue = true);
    final gate = UmpConsentGate(info, formLoader, debugForceEea: true);

    await gate.ensureConsent();

    expect(info.lastParams?.consentDebugSettings?.debugGeography, DebugGeography.debugGeographyEea);
  });

  test('debugForceEea가 false면 디버그 지역 설정이 실리지 않는다', () async {
    final info = _FakeConsentInformation(statusAfterUpdate: ConsentStatus.notRequired);
    final formLoader = _FakeFormLoader();
    final gate = UmpConsentGate(info, formLoader);

    await gate.ensureConsent();

    expect(info.lastParams?.consentDebugSettings, isNull);
  });

  test('privacyOptionsStatus는 정보 갱신 없이 현재 상태를 그대로 조회한다', () async {
    final info = _FakeConsentInformation(statusAfterUpdate: ConsentStatus.obtained);
    final gate = UmpConsentGate(info, _FakeFormLoader());

    expect(await gate.privacyOptionsStatus(), PrivacyOptionsRequirementStatus.required);
  });

  test('reopenPrivacyOptions는 폼 로더의 privacy 옵션 폼을 연다', () async {
    final info = _FakeConsentInformation(statusAfterUpdate: ConsentStatus.obtained);
    final formLoader = _FakeFormLoader();
    final gate = UmpConsentGate(info, formLoader);

    await gate.reopenPrivacyOptions();

    expect(formLoader.privacyCalls, 1);
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `flutter test test/ump_consent_gate_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'package:verse_flutter/core/ads/ump_consent_gate.dart'`

- [ ] **Step 3: 구현**

`lib/core/ads/ump_consent_gate.dart` 생성:

```dart
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

/// ConsentForm의 정적 메서드는 UserMessagingChannel.instance(별도 플랫폼
/// 채널)를 직접 호출해 ConsentInformation 페이크로는 가로챌 수 없다. 테스트
/// 가능하게 만들기 위한 최소 인터페이스다.
abstract class ConsentFormLoader {
  Future<void> loadAndShowIfRequired();
  Future<void> showPrivacyOptionsForm();
}

class RealConsentFormLoader implements ConsentFormLoader {
  @override
  Future<void> loadAndShowIfRequired() =>
      ConsentForm.loadAndShowConsentFormIfRequired((_) {});

  @override
  Future<void> showPrivacyOptionsForm() =>
      ConsentForm.showPrivacyOptionsForm((_) {});
}

/// UMP 동의 흐름을 강제한다: 동의 정보 갱신 → 필요하면 폼 표시 →
/// canRequestAds가 true가 될 때까지. 이 순서가 끝나기 전에는 광고 SDK를
/// 초기화하면 안 된다(스펙 §1).
///
/// 거부해도(비개인화만 동의) ensureConsent는 true를 반환한다 — SDK가
/// AdRequest에 NPA 플래그를 자동으로 반영하므로 광고 자체는 계속 노출된다.
/// false는 오직 "동의 정보 갱신 자체가 실패했다"(오프라인 등)는 뜻이다.
class UmpConsentGate {
  UmpConsentGate(this._info, this._formLoader, {this.debugForceEea = false});

  final ConsentInformation _info;
  final ConsentFormLoader _formLoader;

  /// kDebugMode에서만 켜야 한다 — release 빌드에 들어가면 안 된다.
  final bool debugForceEea;

  Future<bool> ensureConsent() async {
    final updated = await _requestConsentInfoUpdate();
    if (!updated) return false;

    if (await _info.canRequestAds()) return true;

    await _formLoader.loadAndShowIfRequired();
    return _info.canRequestAds();
  }

  Future<bool> _requestConsentInfoUpdate() {
    final completer = Completer<bool>();
    final params = ConsentRequestParameters(
      consentDebugSettings: debugForceEea
          ? ConsentDebugSettings(debugGeography: DebugGeography.debugGeographyEea)
          : null,
    );
    _info.requestConsentInfoUpdate(
      params,
      () => completer.complete(true),
      (error) => completer.complete(false),
    );
    return completer.future;
  }

  Future<PrivacyOptionsRequirementStatus> privacyOptionsStatus() =>
      _info.getPrivacyOptionsRequirementStatus();

  /// 설정 화면의 재설정 진입점이 호출한다.
  Future<void> reopenPrivacyOptions() => _formLoader.showPrivacyOptionsForm();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/ump_consent_gate_test.dart`
Expected: PASS (8개)

- [ ] **Step 5: 전체 테스트로 회귀 확인**

Run: `flutter test`
Expected: All tests passed!

- [ ] **Step 6: 정적 분석**

Run: `flutter analyze lib/core/ads/ump_consent_gate.dart test/ump_consent_gate_test.dart`
Expected: No issues found.

- [ ] **Step 7: 커밋**

```bash
git add lib/core/ads/ump_consent_gate.dart test/ump_consent_gate_test.dart
git commit -m "feat: UMP 동의 게이트 — 동의 정보 갱신·폼 표시·canRequestAds 순서 강제"
```

---

### Task 2: `AdService.init()`에 게이트 배선

**Files:**
- Modify: `lib/core/ads/ad_service.dart`

**Interfaces:**
- Consumes: Task 1의 `UmpConsentGate`, `RealConsentFormLoader`
- Produces: `AdService.init()`가 새 순서(UMP → ATT → MobileAds.initialize)로 동작

이 태스크는 플랫폼 채널을 직접 호출하는 코드라 `flutter test`로 자동 검증할 수 없다. 회귀는 "다른 코드가 여전히 컴파일되고 기존 테스트가 깨지지 않는다"로 확인하고, 실제 순서 동작은 Task 1의 단위 테스트가 이미 보장한다.

- [ ] **Step 1: `AdService.init()` 수정**

`lib/core/ads/ad_service.dart`의 import와 `init()`을 교체한다.

파일 상단 import에 추가:

```dart
import 'package:flutter/foundation.dart';

import 'ump_consent_gate.dart';
```

`InterstitialAd? _interstitialAd;` 위에 게이트 필드 추가:

```dart
  final UmpConsentGate _consentGate =
      UmpConsentGate(ConsentInformation.instance, RealConsentFormLoader(), debugForceEea: kDebugMode);
```

`init()`을 다음으로 교체 (UMP 먼저, 그 다음 ATT, 그 다음 초기화):

```dart
  Future<void> init() async {
    // UMP 동의가 끝나기 전에는 광고 SDK를 초기화하면 안 된다(정책 위반).
    // ensureConsent가 false를 반환해도(오프라인 등 실패) 앱은 광고 없이
    // 계속 진행한다 — 다음 실행 때 다시 시도한다.
    await _consentGate.ensureConsent();
    await _requestTrackingAuthorization();
    await MobileAds.instance.initialize();
    _loadInterstitial();
    _loadRewarded();
  }

  /// 설정 화면의 "광고 동의 설정" 행이 호출한다.
  Future<PrivacyOptionsRequirementStatus> privacyOptionsStatus() =>
      _consentGate.privacyOptionsStatus();

  Future<void> reopenPrivacyOptions() => _consentGate.reopenPrivacyOptions();
```

`_requestTrackingAuthorization` 메서드와 그 위 주석은 그대로 둔다 — 위치만 `init()` 안에서 두 번째 호출로 밀렸을 뿐 내용은 변경하지 않는다.

- [ ] **Step 2: 컴파일 확인**

Run: `flutter analyze lib/core/ads/ad_service.dart`
Expected: No issues found.

- [ ] **Step 3: 전체 테스트로 회귀 확인**

Run: `flutter test`
Expected: All tests passed! — `AdService`를 참조하는 기존 코드(`adServiceProvider`, `reading_screen.dart`의 `showInterstitial()` 호출 등)가 계속 컴파일되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add lib/core/ads/ad_service.dart
git commit -m "feat: 광고 초기화를 UMP 동의 완료 이후로 미룬다"
```

---

### Task 3: 설정 화면 — 광고 동의 재설정 행

**Files:**
- Modify: `lib/features/settings/settings_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`

**Interfaces:**
- Consumes: Task 2의 `AdService.privacyOptionsStatus()`, `AdService.reopenPrivacyOptions()`, 기존 `adServiceProvider`
- Produces: 설정 화면에 조건부로 보이는 `_AdConsentRow` 위젯

이 태스크도 플랫폼 채널을 직접 여는 코드(`showPrivacyOptionsForm`)라 위젯 테스트로 실제 폼 표시를 검증할 수 없다. `flutter analyze`와 전체 스위트 회귀로 검증한다.

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`에 추가 (`"settingsBookmarks"` 근처, 다른 설정 행들과 같은 자리):

```json
  "settingsAdConsent": "광고 동의 설정",
  "settingsAdConsentNotRequired": "이 지역에서는 동의가 필요하지 않아요",
```

`lib/l10n/app_en.arb`에 추가:

```json
  "settingsAdConsent": "Ad consent settings",
  "settingsAdConsentNotRequired": "Consent isn't required in this region",
```

Run: `flutter gen-l10n`
Expected: 에러 없이 완료. `grep -c settingsAdConsent lib/l10n/app_localizations.dart`가 0보다 크다.

- [ ] **Step 2: `_AdConsentRow` 위젯 추가**

`lib/features/settings/settings_screen.dart`에서 `_RecallModeRow` 클래스 정의 아래에 새 위젯을 추가한다:

```dart
/// 광고 동의 재설정 진입점. Google 정책상 EEA 사용자가 나중에 동의를
/// 바꾸거나 철회할 경로가 있어야 한다(스펙 §5). 이 지역에서 동의가 필요
/// 없으면(PrivacyOptionsRequirementStatus.notRequired) 안내만 하고 폼을
/// 열지 않는다.
class _AdConsentRow extends ConsumerWidget {
  const _AdConsentRow({this.isLast = false});
  final bool isLast;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    return _SettingsRow(
      title: l.settingsAdConsent,
      trailing: const Icon(Icons.chevron_right, size: 18),
      isLast: isLast,
      onTap: () async {
        final adService = ref.read(adServiceProvider);
        final status = await adService.privacyOptionsStatus();
        if (status != PrivacyOptionsRequirementStatus.required) {
          if (context.mounted) {
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(l.settingsAdConsentNotRequired)));
          }
          return;
        }
        await adService.reopenPrivacyOptions();
      },
    );
  }
}
```

파일 상단 import에 추가:

```dart
import 'package:google_mobile_ads/google_mobile_ads.dart';
```

- [ ] **Step 3: 행을 목록에 배치**

`build` 메서드의 `children` 목록에서 `const _HapticsRow(isLast: true),` 를 다음으로 교체:

```dart
          const _HapticsRow(),
          const _AdConsentRow(isLast: true),
```

- [ ] **Step 4: 컴파일 확인**

Run: `flutter analyze lib/features/settings/settings_screen.dart`
Expected: No issues found.

- [ ] **Step 5: 전체 테스트로 회귀 확인**

Run: `flutter test`
Expected: All tests passed! — 기존 `settings_nav_rows_test.dart` 등이 행 목록에 항목이 하나 늘어난 것과 충돌하지 않는지 확인한다. 충돌한다면(예: 행 개수를 정확히 세는 테스트) 새 행 개수를 반영해 기대값만 수정한다 — 기존 테스트가 확인하던 다른 내용은 그대로 둔다.

- [ ] **Step 6: 커밋**

```bash
git add lib/features/settings/settings_screen.dart lib/l10n/
git commit -m "feat: 설정 화면에 광고 동의 재설정 진입점 추가"
```

---

## 완료 확인

- [ ] `cd verse-flutter && flutter test` — 전부 통과
- [ ] `cd verse-flutter && flutter analyze` — 이슈 없음
- [ ] 실기기(디버그 빌드)에서 수동 확인:
  - 앱을 처음 실행하면 EEA 강제 설정 덕분에 동의폼이 뜨는지(한국 실기기는 `kDebugMode`가 아니면 절대 뜨지 않는다는 점 확인 — release 빌드로도 한 번 띄워 EEA 지역 흉내가 안 나오는지 확인)
  - 동의 완료 후 통독/암송 화면에서 전면광고가 정상 노출되는지
  - 설정 → 광고 동의 설정 → 폼이 다시 뜨는지(또는 비-EEA 지역이면 스낵바가 뜨는지)
  - iOS에서 UMP 흐름 뒤에 ATT 팝업이 이어서 뜨는지(순서 확인)

## 남은 선행 과제

- **App Store/Play Console의 개인정보 취급방침 URL이 UMP 콘솔에 등록되어 있는지 확인.** 등록되어 있지 않으면 `isConsentFormAvailable()`이 항상 false를 반환해 이 기능이 무력화된다. 이 계획의 범위 밖이며 AdMob 콘솔에서 별도로 설정해야 한다.

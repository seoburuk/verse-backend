# UMP 동의폼 설계 (2026-07-29)

EEA/UK/스위스 사용자에게 광고 노출 전 개인정보 동의를 수집한다. Google의
User Messaging Platform(UMP)을 통합해 AdMob 정책을 준수한다.

**배경:** [2026-07-29-typing-bible-reading-design.md](2026-07-29-typing-bible-reading-design.md)에서
통독 기능이 전면광고 노출 빈도를 크게 늘리기로 결정하면서, 그 전에 끝내야
할 선행 과제로 명시된 작업이다. 통독과 무관하게 기존 암송 화면의 전면광고에도
이미 적용되어야 했던 요건이다.

## 결정 사항

1. **`google_mobile_ads: ^5.2.0`이 UMP를 자체 API로 이미 포함한다** — 별도
   SDK 의존성 추가가 필요 없다(`ConsentInformation`, `ConsentForm`).
2. **UMP 먼저, 그 다음 ATT.** Google이 공식으로 권장하는 순서다. EEA/UK
   사용자만 동의폼을 먼저 보고, 그 다음 개인화 광고(IDFA)가 필요한 경우에만
   ATT를 요청한다.
3. **동의를 거부해도(비개인화만 동의) 광고는 계속 노출된다.** UMP SDK가
   동의 상태를 내부에 저장하고 `AdRequest` 생성 시 NPA(비개인화) 플래그를
   자동 반영한다 — `AdService`의 광고 로드 코드는 손대지 않는다.
4. **디버그 빌드에서만 EEA 강제.** `kDebugMode`로 감싸 릴리스 빌드에는
   `DebugGeography` 설정이 절대 들어가지 않게 한다.
5. **설정 화면에 동의 재설정 진입점을 이번에 함께 넣는다.** Google 정책상
   EEA 사용자가 나중에 동의를 바꾸거나 철회할 경로가 있어야 한다.
6. **초기화 실패는 조용히 넘긴다.** 오프라인 등으로 동의 정보 갱신이
   실패하면 이번 세션은 광고 없이 진행하고, 다음 앱 실행 때 다시 시도한다.
   기존 `AdService.init()`의 실패 처리 패턴과 동일하다.

## 1. 초기화 순서 재구성

현재 `AdService.init()`([lib/core/ads/ad_service.dart](../../../verse-flutter/lib/core/ads/ad_service.dart)):

```
ATT 요청 → MobileAds.initialize() → 광고 프리로드
```

바뀌는 순서:

```
1. UMP 동의 정보 갱신 요청 (ConsentInformation.instance.requestConsentInfoUpdate)
2. 동의폼이 필요하면 표시 (ConsentForm.loadAndShowConsentFormIfRequired)
   — EEA/UK/스위스만, SDK가 지역을 자동 판단한다
3. canRequestAds가 true가 될 때까지 대기
4. ATT 요청 (기존 위치 그대로, iOS만)
5. MobileAds.instance.initialize() → 광고 프리로드
```

**핵심 제약:** 3단계 전에는 광고 요청 자체를 하면 안 된다(Google 정책 위반).
`MobileAds.instance.initialize()`를 동의 흐름 완료 전에 호출하면 동의 없이
광고 SDK가 활성화되므로, 이 순서를 강제하는 것이 이 작업의 핵심이다.

호출부인 [lib/app/providers.dart:195](../../../verse-flutter/lib/app/providers.dart:195)의
`unawaited(ref.watch(adServiceProvider).init())`는 그대로 둔다 — 광고
초기화 전체가 스플래시를 막지 않는 기존 원칙을 유지한다.

## 2. 디버그 테스트 지원

```dart
ConsentDebugSettings(
  debugGeography: kDebugMode ? DebugGeography.debugGeographyEea : DebugGeography.debugGeographyDisabled,
)
```

(`DebugGeography`의 EEA 값은 `debugGeographyEea`다 — 대소문자에 주의한다.
`testIdentifiers`는 실기기 테스트가 필요해지면 그때 추가한다.)

`kDebugMode`는 release 빌드에서 자동으로 `false`이므로 릴리스에 EEA 강제
설정이 들어갈 수 없다. 테스트 기기 ID는 실기기 테스트 시 콘솔 로그에 찍히는
값을 코드에 채워 넣는다(플레이스홀더 하나, 실제 값은 구현 시 테스트 기기에서
확인).

한국은 EEA가 아니므로 이 디버그 설정 없이는 국내 실기기에서 동의폼을 볼 수
없다 — 이 설정이 없으면 이번 기능이 로컬에서 전혀 검증되지 않는다.

## 3. 거부 시 동작

**AdService 코드를 바꾸지 않는다.** `google_mobile_ads`의 UMP 통합은 동의
상태를 SDK 내부에 저장하고, `InterstitialAd.load(...)`가 만드는
`AdRequest`에 자동으로 NPA 플래그를 반영한다. 개인화 여부 판단은 SDK
책임이고, 애플리케이션 코드는 몰라도 된다.

## 4. 실패 처리

`requestConsentInfoUpdate`가 실패하면(오프라인 등) 예외를 삼키고 초기화를
계속 진행한다 — 이번 세션은 광고 없이 동작하고, 다음 앱 실행 때 다시
시도한다. 기존 `AdService.init()`이 이미 이런 방식으로 개별 광고 로드
실패를 조용히 넘기므로 일관된 패턴이다.

## 5. 설정 화면 재설정 진입점

[lib/features/settings/settings_screen.dart](../../../verse-flutter/lib/features/settings/settings_screen.dart)의
기존 행 패턴(`_RecallModeRow`와 같은 `ConsumerWidget` + `ListTile`)을 따라
새 행을 하나 추가한다.

탭하면:

1. `ensureConsent()`(§1의 게이트)로 동의 정보를 재확인 — `canRequestAds()`가
   이미 true면 폼을 다시 띄우지 않고 그대로 통과한다. 앱이 오프라인으로
   시작해 시작 시점 갱신이 실패했던 경우에도 여기서 다시 시도된다.
2. `getPrivacyOptionsRequirementStatus()`로 이 지역에서 재설정 진입점이
   필요한지 확인
3. 필요하면 `ConsentForm.showPrivacyOptionsForm()`으로 개인정보 옵션 폼 표시
4. 필요 없는 지역이면 짧은 안내 스낵바 표시 — "이 지역에서는 동의가
   필요하지 않습니다"

**구현 시 정정:** 최초 설계는 `ConsentInformation.instance.reset()` →
`requestConsentInfoUpdate()` 재호출 방식을 가정했으나, 실제로는 Google이
권장하는 `getPrivacyOptionsRequirementStatus()` +
`ConsentForm.showPrivacyOptionsForm()` 조합으로 구현했다. `reset()`은 매번
동의를 처음부터 다시 받게 하므로 "이미 준 동의를 확인·변경"하려는 사용자
의도와 맞지 않고, 위 조합이 재동의 없이 옵션만 다시 보여주는 Google의
공식 패턴이다. 앱 코드에서 `ConsentInformation.reset()`은 호출하지 않는다.

## 6. 엣지 케이스

| 상황 | 처리 |
|---|---|
| 오프라인 상태로 앱 실행 | 동의 정보 갱신 실패 → 광고 없이 진행, 다음 실행 때 재시도 |
| EEA가 아닌 지역(한국 등) | SDK가 자동 판단해 폼을 표시하지 않음 — `canRequestAds`가 즉시 true |
| 이미 유효한 동의가 저장되어 있음 | 폼을 다시 보여주지 않고 바로 다음 단계로 |
| 설정에서 재설정 후 EEA가 아닌 지역 | 폼이 뜨지 않고 안내 스낵바만 표시 |
| ATT를 거부한 iOS 사용자 | 개인화 광고 없이 비개인화 광고로 계속 노출(기존 ATT 처리와 동일 원칙) |

## 범위 제외

- Android/iOS 외 플랫폼 대응
- 동의 상태의 서버 동기화(로컬 SDK 저장소가 단일 진실 소스)
- 동의 UI의 커스텀 디자인(Google 기본 제공 폼 사용)

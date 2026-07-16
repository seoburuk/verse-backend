# 개인정보처리방침 & 광고(AdMob/AdSense) 정리

## 개인정보처리방침
- 위치: `verse-web-next/app/[locale]/privacy/page.tsx` (한/영 통합, `/privacy`, `/en/privacy`)
- 시행일자: 2026-07-16
- 앱(AdMob)·웹(AdSense)을 하나의 정책으로 통합. 광고 식별자(Android 광고 ID/IDFA)와 쿠키를 구분해서 명시.
- 아동: 서비스는 아동 전용이 아니며(성인 대상, 아동도 이용 가능), 만 14세 미만은 법정대리인 동의 하에 이용. AdMob 콘솔에서 "아동 대상" 태깅은 하지 않음 — 개인화 광고 그대로 사용 가능.
- 연락처: dksk1234234@gmail.com

## 앱(Flutter) — AdMob UMP 동의
- `verse-flutter/lib/core/ads/ads_service.dart`의 `AdsService.init()`이 `MobileAds.instance.initialize()` 전에 UMP 동의 절차(`ConsentInformation.requestConsentInfoUpdate` → `ConsentForm.loadAndShowConsentFormIfRequired`)를 먼저 실행.
- EEA/영국 등 동의가 필요한 지역 사용자에게만 Google이 자동으로 동의 폼을 띄움. 그 외 지역은 즉시 통과.
- iOS `Info.plist`에 `NSUserTrackingUsageDescription`, `GADApplicationIdentifier` 이미 설정됨 (`verse-flutter/ios/Runner/Info.plist`).
- `GADApplicationIdentifier` 및 광고 유닛 ID는 현재 Google 테스트 값 — **출시 직전 실제 AdMob 값으로 교체 필요** (코드 내 주석 참고).

## 웹 — AdSense 동의
- 코드 작업 불필요. AdSense 콘솔의 "개인정보 보호 및 메시지(Privacy & messaging)" 설정을 켜면 Google이 CMP 스크립트를 자동 주입.
- `verse-web-next/app/[locale]/layout.tsx`에 `adsbygoogle.js` 로드 이미 되어 있음.

## 남은 작업 (콘솔/설정, 코드 아님)
- AdMob 콘솔: 앱 "아동 대상 아님" 확인
- AdSense 콘솔: 개인정보 보호 및 메시지 → EEA 동의 메시지 활성화
- 출시 전 AdMob 테스트 ID → 실제 ID 교체 (`GADApplicationIdentifier`, `_testRewardedId`, `_testInterstitialId`)

# App Store 심사 반려 대응 — Guideline 4 (권한 문구 언어 불일치)

- Submission ID: `1f3b47cf-e07f-4aa6-8178-520536edca57`
- Review date: 2026-07-24, Device: iPad Air 11-inch (M3), Version reviewed: 1.0 (4)

## 반려 사유

Guideline 4 - Design. 앱을 영어 로컬라이제이션만으로 제출했는데, 권한 요청(permission request)
문구가 영어가 아니어서 사용자 경험이 App Store 기준에 못 미친다는 지적.

## 원인

[verse-flutter/ios/Runner/Info.plist](../verse-flutter/ios/Runner/Info.plist)의 `NSUserTrackingUsageDescription`
(앱 추적 투명성/ATT 권한 설명)이 한국어로 하드코딩되어 있었음:

```
맞춤 광고 제공을 위해 활동 데이터를 사용합니다.
```

- iOS 번들은 영어로만 선언됨(`knownRegions = (en, Base)`).
- 앱 UI는 기기 언어가 한국어가 아니면 영어로 표시됨([lib/app/app.dart](../verse-flutter/lib/app/app.dart) 참조).
- 따라서 영어 iPad에서는 화면은 전부 영어인데 ATT 팝업만 한국어로 떠서 언어 불일치로 반려됨.

## 점검 범위와 결과

네이티브 iOS 계층(Pods/build 제외)에서 사용자에게 보이는 한국어 문자열은 이 ATT 한 줄뿐임을 확인.
Dart 코드 전체를 훑어 추가로 확인한 항목:

| 영역 | 결과 |
|---|---|
| 모든 화면 UI 텍스트 (l10n arb, 223개 키) | ✅ en/ko 완전 일치, 누락 없음 |
| 성경 책이름, 성경 본문(KJV) | ✅ locale 분기 / 원문이 이미 영어 |
| 코스·섹션·메시아 예언표 제목 | ✅ `titleEn`/`topicEn` 필드로 영어 표시 |
| 데일리 학습 리마인더 알림 | ❌→✅ 한국어로 고정돼 있던 것을 발견해 수정 (아래) |
| `course_items.topic_en` DB 완성도(로컬 dev DB) | ✅ 결측 95%처럼 보였지만 전부 `book-*` 코스이고 `topic` 자체가 이미 영어 원문이라 실제 결측 아님 (검증: 결측+한글 `topic` = 0건) |

## 수정 내역

1. **[ios/Runner/Info.plist](../verse-flutter/ios/Runner/Info.plist)** — ATT 권한 문구를
   `Your activity data is used to deliver personalized ads.`로 변경.
2. **[pubspec.yaml](../verse-flutter/pubspec.yaml)** — 빌드 번호 `0.1.0+4` → `0.1.0+5`.
3. **[lib/core/notifications/reminder_service.dart](../verse-flutter/lib/core/notifications/reminder_service.dart)**
   — 데일리 리마인더 알림(제목·본문 8종·Android 채널명)에 `locale` 분기 추가
   (`scheduleDaily`, `_pickBody`). 위험/중단 알림은 이미 분기돼 있었음.
4. 호출부 4곳에 `locale` 인자 전달: [app/providers.dart](../verse-flutter/lib/app/providers.dart),
   [features/memorize/memorize_controller.dart](../verse-flutter/lib/features/memorize/memorize_controller.dart),
   [features/settings/settings_screen.dart](../verse-flutter/lib/features/settings/settings_screen.dart) (2곳).

## 검증

- `flutter analyze` — 클린 (0 issues).
- `plutil -lint Info.plist` — OK.
- iPad 시뮬레이터(en_US)로 `flutter build ipa` 결과물 실행 확인 — 앱 UI 전체가 영어로 렌더링됨
  ("Today", "No plan yet", "Create a plan" 등). 단, 이 세션의 시뮬레이터 터치 주입 문제로
  Settings 화면까지 탭해 들어가 리마인더 알림 실물을 띄워보는 것과 ATT 팝업 트리거는 확인 못함
  (코드는 정적 검증 완료: 로직이 단순 locale 삼항 분기라 실기기 확인 없이도 신뢰도 높음).
- `flutter build ipa --release` 성공 — `build/ios/ipa/PixBible.ipa`, Build Number 5.

## 남은 할 일 (사용자)

1. `PixBible.ipa`를 Transporter 또는 `xcrun altool`로 App Store Connect 업로드.
2. 리뷰 노트에 영어로 남기고 재제출 (문구는 세션 대화 참조).
3. 프로덕션 DB의 `title_en`/`topic_en` 완성도는 로컬 dev DB만 확인했으므로, 배포 전 프로덕션에서도
   한 번 같은 카운트를 확인 권장.

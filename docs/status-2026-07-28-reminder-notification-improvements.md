# 알람(리마인더) 문구 확장 + 마일스톤/복귀 알림 구현 기록 (2026-07-28)

`verse-flutter` 리마인더 알림(`lib/core/notifications/reminder_service.dart`) 문구 다양화와,
스트릭이 끊긴 뒤 침묵 구간을 메우는 복귀 유도 알림 신설. 브레인스토밍 → 스펙 → 플랜 →
inline 실행(executing-plans) 순서로 진행.

- 스펙: [`docs/superpowers/specs/2026-07-28-reminder-notification-improvements-design.md`](superpowers/specs/2026-07-28-reminder-notification-improvements-design.md)
- 플랜: [`docs/superpowers/plans/2026-07-28-reminder-notification-improvements.md`](superpowers/plans/2026-07-28-reminder-notification-improvements.md)
- 커밋: `eef519f`(문구 확장) → `2528340`(마일스톤) → `34dc4c7`(복귀 판정 함수) →
  `b5d4535`(복귀 예약/취소) → `90b40ed`/`9f135e1`(호출부 배선) → `bd49998`(끄기/라우팅),
  `feature/reminder-notifications` → `main` fast-forward merge.

## 배경

기존 알림 세 종류(데일리 1001 / 스트릭 위험 1002 / 자동 중단 안내 1003) 중, 스트릭이 끊긴 뒤
2~6일 구간은 알림이 완전히 침묵했고, 문구 풀도 짧아 반복 체감이 빨랐다.

## 구현 내역

| 항목 | 내용 | 파일 |
|---|---|---|
| 데일리 문구 확장 | 스트릭 없음 5→8종, 진행 중 3→6종 | `reminder_service.dart` `_pickBody` |
| 위험 알림 문구 확장 | 3→5종 | `reminder_service.dart` `dangerBody` |
| 마일스톤 전야 문구 | `currentStreak+1 ∈ {7,30,100}`이면 전용 고정 문구로 순환 풀 대체 | `reminder_service.dart` `milestoneBody` |
| 복귀 유도 알림(신규, ID 1004) | 스트릭 끊긴 뒤 gap 1~2일 구간에 lastDay+2일 시각으로 1회 예약, gap≥3이면 취소 | `reminder_service.dart` `shouldScheduleComeback`, `refreshComeback`, `cancelComeback` |
| 호출부 배선 | 앱 시작·암송 완료 시 `refreshComeback` 호출, 리마인더 끄면 취소 | `app/providers.dart`, `features/memorize/memorize_controller.dart`, `features/settings/settings_screen.dart` |
| 알림 탭 라우팅 | `notificationPayloadComeback` → `/today` | `core/notifications/notification_router.dart` |

## 테스트

`test/streak_danger_test.dart`에 순수 함수 단위 테스트 추가 — 문구 풀 확장 검증,
`milestoneBody`(마일스톤 경계값 6/29/99, 비마일스톤 5/10), `shouldScheduleComeback`
(gap 0/1/2/3/7, lastDay null). 전체 스위트 173/173 통과.

`flutter_local_notifications`는 OS 스케줄러 의존이라 단위 테스트 불가 — iOS 시뮬레이터로
빌드·설치·권한 요청→허용→리마인더 토글 on 플로우까지 수동 확인(예외/크래시 없음). 실제
알림 발화 시점 확인은 시뮬레이터가 호스트 Mac 시스템 시계를 그대로 쓰고 자체 날짜 변경
UI가 없어 보류 — Mac 전체 시스템 시간을 바꾸는 건 부수 영향이 커서 하지 않았다.

## 부수 작업 — App Store 릴리즈 빌드

같은 세션에서 iOS release IPA 빌드 요청이 있어 진행:
- `flutter build ipa --release` 1차 빌드(0.1.0+5) 후, 빌드 번호가 이미 커밋되어 있던 값이라
  App Store Connect 중복 가능성 확인 차 **0.1.0+6으로 상향**(커밋 `b6419a4`) 후 재빌드.
- 결과물: `verse-flutter/build/ios/ipa/PixBible.ipa` (32.7MB). 서명은 로컬 Distribution
  인증서 + "PixBible AppStore" 프로파일로 정상 처리됨. 업로드(Transporter/altool)는
  계정 자격증명이 필요해 사용자가 직접 진행.

## 남은 일

- 알림 실제 발화(문구 로테이션, 마일스톤, 복귀 알림) 실기기/장시간 대기 검증 — 미완료.
- 런치 이미지가 기본 placeholder(기존 이슈, 이번 작업과 무관) — 별도 처리 필요.

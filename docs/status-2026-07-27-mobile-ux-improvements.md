# 모바일 UX 개선 16종 구현 기록 (2026-07-27)

`verse-flutter` 사용자 여정(설치 → 첫 성공 → 매일 복귀 → 신뢰) 단계별 마찰 제거 작업.
별도 브레인스토밍 없이 코드 전수 탐색 결과를 바로 계획(plan mode)으로 승인받아 구현했다.
커밋: `c5e2bce`.

작업 전 코드 탐색에서 웹-모바일 기능 격차 문서(`web-mobile-feature-gap-2026-07-14.md`)가
가리키던 항목 중 **엔터 제출·암송 중 하트 배지·틀림 시 전 모드 시각효과 3개는 이미
그 사이 커밋들로 구현이 끝나 있었다** — 실제 구현 전 항상 현재 코드를 직접 확인할 것.

## 구현 내역

### Phase 1 — 첫 5분 경험
| 항목 | 파일 |
|---|---|
| 스플래시 로테이션 팁 문구(진행률 대신) | `lib/app/app.dart` `_SplashScreen` |
| Today 빈 상태 "바로 한 절 외워보기"(요 3:16 직행) | `lib/features/today/today_screen.dart`, `lib/core/courses/course_repository.dart` `findByReference()` |
| 첫 암송 진입 1회 코치마크(모드/채점색/하트) | `lib/features/memorize/memorize_screen.dart` `_CoachOverlay` |

### Phase 2 — 암송 루프
| 항목 | 상태 | 파일 |
|---|---|---|
| 노랑 결과도 다음 절 진행 허용(빨강만 재도전 강제) | 신규 | `memorize_screen.dart` `_ResultView.canAdvance` |
| type/dictation 틀림 시각효과 | **기존 구현 확인** | `_FxBox`가 이미 3모드 공용 |
| 엔터로 제출 | **기존 구현 확인** | `TextField.onSubmitted` |
| 암송 중 상단 하트 배지 | **기존 구현 확인** | AppBar actions의 `LivesBadge()` |
| "다시하기" 즉시 재시작(study 생략) | 신규 | `memorize_controller.dart` `retry()` |

### Phase 3 — 데일리 루프 연결
| 항목 | 파일 |
|---|---|
| Today "이어서 외우기" 절 체이닝(navArgs 전달) | `today_screen.dart`, `providers.dart` `planNextNavArgsProvider` |
| 알림 탭 딥링크 `/courses` → `/today` | `lib/core/notifications/notification_router.dart` |
| 스트릭/하트 영역 탭 → 대시보드 | `today_screen.dart` |
| 대시보드에 마일스톤 달성 목록 상설 표시 | `lib/features/progress/dashboard_screen.dart` `_MilestonesRow` |

### Phase 4 — 신뢰·폴리시
| 항목 | 파일 |
|---|---|
| 설정에 사운드/햅틱 토글(기존 `Sfx` 필드 연결) | `settings_screen.dart`, `providers.dart` `soundOnProvider`/`hapticsOnProvider` |
| 동기화 오프라인/인증만료 배너(Today) | `today_screen.dart` `_SyncBanner`, `providers.dart` `lastSyncOutcomeProvider` |
| 랭킹 401을 "오프라인"이 아니라 "로그인 필요"로 분기 | `lib/features/rankings/rankings_screen.dart` |
| 전 화면 원시 에러(`Text('$e')`) → 재시도 버튼 있는 공용 위젯 | `lib/shared/widgets/error_view.dart`(신규) + 8개 화면 |
| 로그인/회원가입 성공 후 일괄 `/courses` 대신 원위치 복귀 | `lib/features/auth/login_screen.dart`, `signup_screen.dart` |

## 범위 제외 (별도 계획 필요)

- 비밀번호 찾기/이메일 인증 — `docs/superpowers/plans/2026-07-18-mobile-email-auth-parity.md` 참고
- 광고 빈도 제어·UMP 동의폼 — `docs/admob-monetization-status-2026-07-17.md` 참고
- 하트 경제 재설계(보상광고 풀충전 문제), 스트릭 프리즈, 서버 푸시 알림

## 부수적으로 고친 사전 존재 버그

`test/app_shell_nav_test.dart`의 "하단 바 5개 탭" 테스트가 실패 상태였다. 원인은
`AppShell`의 넓은 화면 분기(`maxWidth >= 600`, iPad `NavigationRail` 도입 커밋
`89d2a8a`에서 생김)가 flutter_test 기본 뷰포트(800×600)와 겹쳐 폰 레이아웃이
아예 렌더링되지 않은 것 — 앱 코드는 정상이고 테스트가 뷰포트를 명시하지 않은 게
문제였다. `_usePhoneViewport()` 헬퍼로 고치고, 반대로 넓은 화면에서 레일이 뜨는지
검증하는 테스트를 하나 추가했다(그 전엔 아무 테스트도 레일 모드를 확인하지 않았다).

## 검증

- `flutter analyze`: 에러 0, 사전 존재 info 3건 + 무해한 warning 1건(`_ReminderRow.isLast` 미사용)
- `flutter test`: 140/140 통과(신규 레일 테스트 1개 포함)
- 실기기/시뮬레이터 라이브 확인은 수행하지 않음 — 다음 세션에서 필요

### 참고 문서
- `docs/web-mobile-feature-gap-2026-07-14.md` — 이번 작업의 출발점이 된 격차 대조표(일부 항목은 이후 커밋으로 이미 해소됨, 위 참고)
- `docs/status-2026-07-18.md` — 직전 전체 현황

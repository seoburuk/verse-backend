# 모바일 하단 내비게이션 바 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 흩어진 AppBar 이동 아이콘을 없애고, 5탭(오늘·코스·랭킹·카드·설정) 지속 하단 바를 `StatefulShellRoute.indexedStack`로 도입해 탭별 내비 스택이 보존되게 한다.

**Architecture:** `lib/app/router.dart`를 `StatefulShellRoute.indexedStack` 5브랜치로 재구성한다. 셸을 감싸는 `AppShell` 위젯이 Material `NavigationBar`를 그린다. 암송·플랜생성·로그인/회원가입·섹션완료는 루트 Navigator(`parentNavigatorKey`)에 올려 바를 숨긴다. 카드 탭은 "준비 중" 플레이스홀더 화면으로 둔다(실제 컬렉션은 별개 스펙).

**Tech Stack:** Flutter, go_router(StatefulShellRoute), Riverpod, flutter gen-l10n, flutter_test.

## Global Constraints

- 작업 디렉토리: `verse-flutter/`. 모든 경로는 이 기준.
- 모바일(Flutter) 전용. 웹 `verse-web-next`는 대상 아님.
- 탭 아이콘은 **Material 아이콘**을 쓴다. 기존 `courses_list_screen`이 이미 nav에 Material 아이콘(`Icons.bookmark_border` 등)을 쓰고 있고, `PixelIconName`에는 책/트로피/카드/기어 글리프가 없다. (스펙 §8의 "PixelIcon 사용" 문구는 이 제약에 맞춰 Material 아이콘으로 대체 — 바 색은 `pixel_theme`가 자동 적용.)
- 새 문자열은 `lib/l10n/app_ko.arb`(템플릿) + `lib/l10n/app_en.arb`에 추가하고 `flutter gen-l10n`으로 재생성. 하드코딩 금지.
- `initialLocation`은 `/today` 유지.
- 카드 컬렉션 화면 자체는 이 계획 범위 밖 — `/cards`는 플레이스홀더만.

## File Structure

- Create: `lib/features/cards/card_collection_screen.dart` — 카드 탭 플레이스홀더.
- Create: `lib/app/app_shell.dart` — 하단 바를 그리는 셸 위젯.
- Modify: `lib/app/router.dart` — StatefulShellRoute 재편.
- Modify: `lib/features/courses/courses_list_screen.dart` — AppBar nav 아이콘 4개 제거.
- Modify: `lib/features/today/today_screen.dart` — AppBar "코스 둘러보기" 액션 제거.
- Modify: `lib/features/settings/settings_screen.dart` — 통계·북마크 진입 행 추가.
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`.

---

### Task 1: 카드 탭 플레이스홀더 화면 + l10n 키

**Files:**
- Create: `lib/features/cards/card_collection_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Generated: `lib/l10n/app_localizations*.dart`
- Test: `test/card_collection_screen_test.dart`

**Interfaces:**
- Produces: `class CardCollectionScreen extends StatelessWidget`, l10n getters `navToday`, `navCourses`, `navRankings`, `navCards`, `navSettings`, `cardsComingSoon`, `settingsStats`, `settingsBookmarks`.

- [ ] **Step 1: arb 키 추가**

`lib/l10n/app_ko.arb`에 추가(마지막 키 뒤, 콤마 유효성 주의):

```json
  "navToday": "오늘",
  "navCourses": "코스",
  "navRankings": "랭킹",
  "navCards": "카드",
  "navSettings": "설정",
  "cardsComingSoon": "카드 컬렉션 준비 중",
  "settingsStats": "통계",
  "settingsBookmarks": "북마크"
```

`lib/l10n/app_en.arb`에 동일 키:

```json
  "navToday": "Today",
  "navCourses": "Courses",
  "navRankings": "Rankings",
  "navCards": "Cards",
  "navSettings": "Settings",
  "cardsComingSoon": "Card collection coming soon",
  "settingsStats": "Stats",
  "settingsBookmarks": "Bookmarks"
```

- [ ] **Step 2: l10n 재생성**

Run: `flutter gen-l10n`
Expected: 에러 없음, 위 getter 생성.

- [ ] **Step 3: 실패하는 위젯 테스트 작성**

`test/card_collection_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/features/cards/card_collection_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

void main() {
  testWidgets('카드 탭은 준비 중 문구를 보여준다', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: Locale('ko'),
      home: CardCollectionScreen(),
    ));
    await tester.pumpAndSettle();
    expect(find.text('카드 컬렉션 준비 중'), findsOneWidget);
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_collection_screen_test.dart`
Expected: FAIL — `CardCollectionScreen` 미정의.

- [ ] **Step 5: `CardCollectionScreen` 구현**

`lib/features/cards/card_collection_screen.dart`:

```dart
import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../shared/widgets/mascot_sprite.dart';

/// 카드 컬렉션 탭 플레이스홀더. 실제 수집 데이터 모델·갤러리는 별개 스펙에서 구현한다.
class CardCollectionScreen extends StatelessWidget {
  const CardCollectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l.navCards)),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const MascotSprite(mood: MascotMood.idle, size: 96),
            const SizedBox(height: 16),
            Text(l.cardsComingSoon, style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/card_collection_screen_test.dart`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/l10n/ lib/features/cards/card_collection_screen.dart test/card_collection_screen_test.dart
git commit -m "feat(nav): 카드 탭 플레이스홀더 + nav l10n 키"
```

---

### Task 2: `AppShell` + `StatefulShellRoute` 라우터 재편

**Files:**
- Create: `lib/app/app_shell.dart`
- Modify: `lib/app/router.dart` (전체 재구성)
- Test: `test/app_shell_nav_test.dart`

**Interfaces:**
- Consumes: `CardCollectionScreen`(Task 1), 기존 화면들, l10n `nav*`(Task 1).
- Produces: `class AppShell extends StatelessWidget`(필드 `StatefulNavigationShell navigationShell`), 재구성된 `appRouter`. 라우트 `/cards` 신설. `/today` `/courses`(+하위) `/rankings` `/cards` `/settings`(+`/dashboard` `/bookmarks`)는 셸 브랜치(바 표시). `/login` `/signup` `/memorize/:itemId` `/plan/new` `/courses/:c/sections/:s/complete`는 루트 Navigator(바 숨김).

- [ ] **Step 1: `AppShell` 위젯 작성**

`lib/app/app_shell.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../l10n/app_localizations.dart';

/// 하단 5탭 바를 그리는 셸. StatefulShellRoute.indexedStack의 각 브랜치가
/// 자기 Navigator 스택을 유지하므로 탭을 오가도 스크롤·드릴다운이 보존된다.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  void _onTap(int index) {
    // 이미 선택된 탭을 다시 누르면 그 탭의 첫 화면으로 돌아간다.
    navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: _onTap,
        destinations: [
          NavigationDestination(icon: const Icon(Icons.today), label: l.navToday),
          NavigationDestination(icon: const Icon(Icons.menu_book), label: l.navCourses),
          NavigationDestination(icon: const Icon(Icons.emoji_events), label: l.navRankings),
          NavigationDestination(icon: const Icon(Icons.style), label: l.navCards),
          NavigationDestination(icon: const Icon(Icons.settings), label: l.navSettings),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: 라우터를 StatefulShellRoute로 재구성**

`lib/app/router.dart` 전체를 아래로 교체:

```dart
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/login_screen.dart';
import '../features/auth/signup_screen.dart';
import '../features/bookmarks/bookmarks_screen.dart';
import '../features/cards/card_collection_screen.dart';
import '../features/courses/course_category_screen.dart';
import '../features/courses/course_detail_screen.dart';
import '../features/courses/courses_list_screen.dart';
import '../features/courses/section_complete_screen.dart';
import '../features/courses/section_screen.dart';
import '../features/memorize/memorize_nav_args.dart';
import '../features/memorize/memorize_screen.dart';
import '../features/progress/dashboard_screen.dart';
import '../features/rankings/rankings_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/today/create_plan_screen.dart';
import '../features/today/today_screen.dart';
import 'app_shell.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

/// 하단 5탭 셸 + 몰입 화면(바 숨김)은 루트 Navigator에 올린다.
final appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/today',
  routes: [
    // 셸 밖(바 없음) 몰입 화면
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(path: '/signup', builder: (context, state) => const SignupScreen()),
    GoRoute(
      path: '/memorize/:itemId',
      builder: (context, state) => MemorizeScreen(
        courseItemId: int.parse(state.pathParameters['itemId']!),
        navArgs: state.extra as MemorizeNavArgs?,
      ),
    ),
    GoRoute(path: '/plan/new', builder: (context, state) => const CreatePlanScreen()),

    // 하단 바 셸
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
      branches: [
        // 1) 오늘
        StatefulShellBranch(routes: [
          GoRoute(path: '/today', builder: (context, state) => const TodayScreen()),
        ]),
        // 2) 코스 (+ 하위 드릴다운은 바 유지)
        StatefulShellBranch(routes: [
          GoRoute(
            path: '/courses',
            builder: (context, state) => const CoursesListScreen(),
            routes: [
              GoRoute(
                path: 'category/:category',
                builder: (context, state) => CourseCategoryScreen(category: state.pathParameters['category']!),
              ),
              GoRoute(
                path: ':courseId',
                builder: (context, state) => CourseDetailScreen(courseId: int.parse(state.pathParameters['courseId']!)),
                routes: [
                  GoRoute(
                    path: 'sections/:sectionId',
                    builder: (context, state) => SectionScreen(
                      courseId: int.parse(state.pathParameters['courseId']!),
                      sectionId: int.parse(state.pathParameters['sectionId']!),
                    ),
                    routes: [
                      // 섹션 완료 축하 = 몰입 화면(바 숨김) → 루트 Navigator로 탈출.
                      GoRoute(
                        path: 'complete',
                        parentNavigatorKey: _rootNavigatorKey,
                        builder: (context, state) => SectionCompleteScreen(
                          courseId: int.parse(state.pathParameters['courseId']!),
                          sectionId: int.parse(state.pathParameters['sectionId']!),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ]),
        // 3) 랭킹
        StatefulShellBranch(routes: [
          GoRoute(path: '/rankings', builder: (context, state) => const RankingsScreen()),
        ]),
        // 4) 카드 (플레이스홀더)
        StatefulShellBranch(routes: [
          GoRoute(path: '/cards', builder: (context, state) => const CardCollectionScreen()),
        ]),
        // 5) 설정 (+ 통계·북마크는 설정 브랜치 하위로 편입, 바 유지)
        StatefulShellBranch(routes: [
          GoRoute(path: '/settings', builder: (context, state) => const SettingsScreen()),
          GoRoute(path: '/dashboard', builder: (context, state) => const DashboardScreen()),
          GoRoute(path: '/bookmarks', builder: (context, state) => const BookmarksScreen()),
        ]),
      ],
    ),
  ],
);
```

- [ ] **Step 3: 실패하는 위젯 테스트 작성**

`test/app_shell_nav_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/app/router.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

Widget _app(AppDatabase db) => ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: MaterialApp.router(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('ko'),
        routerConfig: appRouter,
      ),
    );

void main() {
  testWidgets('시작 시 하단 바에 5개 탭이 뜬다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationDestination), findsNWidgets(5));
    expect(find.text('오늘'), findsWidgets);
    expect(find.text('카드'), findsWidgets);
  });

  testWidgets('카드 탭을 누르면 준비 중 화면으로 전환된다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    await tester.tap(find.text('카드'));
    await tester.pumpAndSettle();

    expect(find.text('카드 컬렉션 준비 중'), findsOneWidget);
  });

  testWidgets('플랜 생성(몰입) 화면에는 하단 바가 없다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    appRouter.go('/plan/new');
    await tester.pumpAndSettle();

    expect(find.byType(NavigationBar), findsNothing);
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/app_shell_nav_test.dart`
Expected: FAIL — `AppShell` 미정의 또는 라우터 미재편.

(주의: Step 1·2를 먼저 반영해야 컴파일된다. TDD 순서상 테스트를 먼저 작성했으나, 이 태스크는 위젯+라우터가 한 단위이므로 Step 1·2 구현 → Step 3 테스트 → Step 4 실행이 정상 흐름이다. 이미 Step 1·2를 했다면 Step 4는 PASS로 넘어간다.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `flutter test test/app_shell_nav_test.dart`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/app/app_shell.dart lib/app/router.dart test/app_shell_nav_test.dart
git commit -m "feat(nav): StatefulShellRoute 하단 5탭 바 도입"
```

---

### Task 3: 기존 흩어진 내비 정리 + 설정에 통계·북마크 진입

**Files:**
- Modify: `lib/features/courses/courses_list_screen.dart` (AppBar nav 아이콘 제거)
- Modify: `lib/features/today/today_screen.dart` (AppBar 액션 제거)
- Modify: `lib/features/settings/settings_screen.dart` (통계·북마크 행 추가)
- Test: `test/settings_nav_rows_test.dart`

**Interfaces:**
- Consumes: l10n `settingsStats`, `settingsBookmarks`(Task 1), 기존 `_SettingsRow`.

- [ ] **Step 1: 코스 화면 AppBar nav 아이콘 제거**

`lib/features/courses/courses_list_screen.dart`의 AppBar `actions`에서 북마크·통계·랭킹·설정 IconButton 4개를 제거하고 `LivesBadge`만 남긴다:

```dart
      appBar: AppBar(
        title: const Text('PIXBIBLE', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.2)),
        actions: const [
          LivesBadge(),
        ],
      ),
```

(제거로 `context`/`p`가 미사용이 되지 않는지 확인 — `p`는 아래 body에서 계속 쓰이므로 유지.)

- [ ] **Step 2: 오늘 화면 AppBar "코스 둘러보기" 액션 제거**

`lib/features/today/today_screen.dart`의 AppBar를 액션 없이 바꾼다:

```dart
      appBar: AppBar(title: Text(l.todayTitle)),
```

(하단 바의 코스 탭이 대체하므로 `commonExploreCourses` 액션 삭제. `context.go('/courses')` import가 이 파일에서 더는 안 쓰이면 그대로 두어도 무방 — go_router import는 다른 곳(CTA)에서 계속 사용.)

- [ ] **Step 3: 실패하는 위젯 테스트 작성**

`test/settings_nav_rows_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/features/settings/settings_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

void main() {
  testWidgets('설정 화면에 통계·북마크 진입 행이 있다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: Locale('ko'),
        home: SettingsScreen(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('통계'), findsOneWidget);
    expect(find.text('북마크'), findsOneWidget);
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/settings_nav_rows_test.dart`
Expected: FAIL — '통계'/'북마크' 행 없음.

- [ ] **Step 5: 설정 화면에 통계·북마크 행 추가**

`lib/features/settings/settings_screen.dart`의 `build` ListView `children`에서 `_GroupLabel(l.settingsDisplay)` 그룹 위(맨 앞)에 새 그룹을 추가한다. import에 go_router가 이미 있으니(파일 상단 `context.push('/login')` 사용) 그대로 쓴다.

`ListView(... children:` 의 첫 항목으로 삽입:

```dart
          _GroupLabel(l.settingsStats, color: p.muted),
          _SettingsRow(
            title: l.settingsStats,
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => context.push('/dashboard'),
          ),
          _SettingsRow(
            title: l.settingsBookmarks,
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => context.push('/bookmarks'),
            isLast: true,
          ),
```

(`context`는 `build(BuildContext context, WidgetRef ref)`에서 사용 가능. `_GroupLabel`·`_SettingsRow`는 동일 파일 내 정의 재사용.)

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/settings_nav_rows_test.dart`
Expected: PASS

- [ ] **Step 7: 전체 테스트 + 분석**

Run: `flutter test`
Expected: 전체 PASS.

Run: `flutter analyze`
Expected: 신규 코드 무경고.

- [ ] **Step 8: 수동 검증**

Run: `flutter run`
확인:
1. 앱 시작 → 하단에 **5탭 바**(오늘·코스·랭킹·카드·설정), 오늘 탭 선택 상태.
2. 코스 탭 → 코스 목록. 코스→섹션 파고든 뒤 랭킹 탭 갔다 코스 탭 복귀 → **스택 유지**(파고든 위치 그대로).
3. 카드 탭 → "카드 컬렉션 준비 중" + 마스코트.
4. 설정 탭 → 통계/북마크 행 → 진입 시 **바 유지**(설정 탭 강조).
5. 오늘 탭 "이어서 외우기" → 암송 화면엔 **바 없음**. 뒤로 → 오늘 탭 복귀.

- [ ] **Step 9: 커밋**

```bash
git add lib/features/courses/courses_list_screen.dart lib/features/today/today_screen.dart lib/features/settings/settings_screen.dart test/settings_nav_rows_test.dart
git commit -m "refactor(nav): 흩어진 AppBar 내비 제거 + 설정에 통계·북마크 편입"
```

---

## 완료 기준

- [ ] 5탭 하단 바가 모든 브랜치에서 지속되고, 탭별 내비 스택이 보존된다.
- [ ] 암송·플랜생성·로그인/회원가입·섹션완료 화면엔 바가 없다.
- [ ] 코스 화면 AppBar의 nav 아이콘 4개가 제거됐다.
- [ ] 카드 탭이 "준비 중" 플레이스홀더를 보여준다.
- [ ] 통계·북마크가 설정에서 진입되고 진입 시 바가 유지된다.
- [ ] `flutter test` 전체 통과, `flutter analyze` 무경고(신규 코드).

## 이 계획에 포함되지 않은 것

- 실제 카드 컬렉션(수집 데이터 모델·갤러리·획득 연출) → 별개 스펙.
- 데일리루프 P2(마스코트 상태 구동) → 별개 계획.
- 알림 탭 목적지를 `/today`로 바꾸는 것(현재 `/courses`로 유지) → 범위 밖.

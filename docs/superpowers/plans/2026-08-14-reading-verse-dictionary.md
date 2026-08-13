# 통독 절 완료 사전 (Reading Verse Dictionary) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통독에서 절을 하나 다 치면 밑줄 카드(고어 사전)를 보여주고 "넘어가기"를 눌러야 다음 절로 가게 한다. 설정 토글(기본 켜짐)로 이 정지를 끌 수 있다.

**Architecture:** `ReadingController`(StateNotifier)에 `verseDone` 플래그와 `next()` 메서드를 추가한다. 토글이 켜져 있으면 절 완료 시 자동 전진 대신 `verseDone: true`로 멈추고, `_ReadingBodyState.build`가 타이핑 UI(RichText+투명 TextField) 대신 기존 `VerseWordsCard`(현재 `memorize_screen.dart`에 있음, `lib/shared/widgets/`로 이동)를 그린다. "넘어가기" 버튼이 `next()`를 부르면 광고 판정 후 실제로 전진한다. 토글은 `soundOnProvider`/`hapticsOnProvider`와 동일한 `Notifier<bool>` + `AppSettingsRepository` 패턴.

**Tech Stack:** Flutter, Riverpod(`StateNotifierProvider.family`, `NotifierProvider`), drift(로컬 DB), flutter_test.

**Spec:** `docs/superpowers/specs/2026-08-14-reading-verse-dictionary-design.md`

**작업 디렉터리:** `verse-flutter/.claude/worktrees/archaic-dictionary` (브랜치 `feature/archaic-dictionary`, main 병합 완료 커밋 `45f221c`). 이 계획의 모든 경로는 이 디렉터리 기준이다.

## Global Constraints

- 토글 기본값은 켜짐(`'1'`) — 기본이 꺼짐이면 사전을 발견하는 사용자가 설정에 들어가 본 사람뿐이라는 게 확정된 이유
- 토글이 꺼져 있으면 통독 동작이 기존과 완전히 동일해야 한다 — `verseDone` 상태에 아예 들어가지 않는다
- 광고는 절 경계에서만 뜬다는 기존 불변식을 유지한다 — 타이핑 도중엔 절대 안 뜬다. 토글 켜짐일 땐 `next()`(넘어가는 순간)에서, 꺼짐일 땐 기존대로 `_completeVerse`에서 판정한다
- `VerseWordsCard` 위젯 자체(생성자 시그니처·내부 로직)는 변경하지 않는다 — 파일 위치만 옮긴다
- 사전 데이터(`assets/dictionary/archaic_kjv.json`)와 선별 로직은 손대지 않는다 — 등재된 단어는 전부 밑줄
- 콤보 UI는 이 코드베이스에 없다(정정: 최초 설계 초안의 오류) — 신경 쓸 필요 없음
- 새 사용자 노출 문자열은 `lib/l10n/app_en.arb` + `app_ko.arb` 양쪽에 추가
- 커밋 메시지는 한국어 + conventional prefix

## File Structure

- Move: `VerseWordsCard` 클래스를 `lib/features/memorize/memorize_screen.dart` → `lib/shared/widgets/verse_words_card.dart`
- Modify: `lib/features/memorize/memorize_screen.dart` — import만 교체, `_VerseWordsCardHost` 등 나머지는 그대로
- Modify: `lib/features/reading/reading_controller.dart` — `verseDone`, `next()`, 광고 판정 위치
- Modify: `lib/features/reading/reading_screen.dart` — 절 완료 시 카드 분기
- Modify: `lib/core/settings/app_settings_repository.dart` — `readingDictionaryOnKey` 추가
- Modify: `lib/app/providers.dart` — `ReadingDictionaryOnNotifier`/`readingDictionaryOnProvider`, `readingControllerProvider`에 주입, 부팅 로드
- Modify: `lib/features/settings/settings_screen.dart` — `_ReadingDictionaryRow` 추가
- Modify: `lib/l10n/app_en.arb`, `lib/l10n/app_ko.arb`
- Test: `test/reading_controller_test.dart`(확장), `test/reading_verse_dictionary_screen_test.dart`(신설), `test/memorize_result_dictionary_test.dart`(import만 갱신, 무회귀 확인)

---

### Task 1: VerseWordsCard를 shared/widgets로 이동

**Files:**
- Create: `lib/shared/widgets/verse_words_card.dart`
- Modify: `lib/features/memorize/memorize_screen.dart`
- Test: `test/memorize_result_dictionary_test.dart` (수정 없이 통과 확인)

**Interfaces:**
- Produces: `lib/shared/widgets/verse_words_card.dart`가 export하는
  `class VerseWordsCard extends ConsumerWidget { const VerseWordsCard({super.key, required List<String> words, required List<bool> matchMask, required bool showMistakes}); }`
  — Task 4(통독 화면)가 이걸 그대로 가져다 쓴다.

- [ ] **Step 1: 새 파일 생성 — VerseWordsCard 클래스 전체를 옮긴다**

`lib/features/memorize/memorize_screen.dart`에서 `class VerseWordsCard extends ConsumerWidget` 전체(`_wordSpan`, `_showEntrySheet`, `_sheetRow` 메서드 포함, 클래스 닫는 `}`까지)를 잘라내 아래 내용으로 `lib/shared/widgets/verse_words_card.dart`를 만든다:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/dictionary/archaic_dictionary.dart';
import '../../l10n/app_localizations.dart';
import '../theme/pixel_theme.dart';

/// 절 원문을 단어 단위로 보여주는 카드. 놓친 단어는 빨강+실선 밑줄
/// ([showMistakes]일 때), 고어 사전에 등재된 단어는 점선 밑줄 어포던스 +
/// 탭 시 뜻 바텀시트. 오답이면서 등재된 단어는 오답 표시(빨강 실선)가
/// 우선이고 탭만 살아 있다.
///
/// state 전체가 아니라 [words]/[matchMask]만 받는다 — 이 카드는 결과 화면
/// 밖에서도(위젯 테스트 등) 독립적으로 마운트할 수 있어야 한다. 암송 결과
/// 화면과 통독 절 완료 화면 공용이라 shared에 둔다.
class VerseWordsCard extends ConsumerWidget {
  const VerseWordsCard(
      {super.key,
      required this.words,
      required this.matchMask,
      required this.showMistakes});

  final List<String> words;
  final List<bool> matchMask;
  final bool showMistakes;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final p = context.pixel;
    final dict = ref.watch(archaicDictionaryProvider).value;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: p.surface, border: Border.all(color: p.border, width: 2)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
              showMistakes ? l.memorizeMissedWordsTitle : l.memorizeVerseWordsTitle,
              style: TextStyle(
                  color: p.muted, fontWeight: FontWeight.bold, fontSize: 13)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (var i = 0; i < words.length; i++)
                _wordSpan(context, l, p, i, dict),
            ],
          ),
        ],
      ),
    );
  }

  Widget _wordSpan(BuildContext context, AppLocalizations l, PixelPalette p,
      int i, ArchaicDictionary? dict) {
    final word = words[i];
    final missed = showMistakes && !(i < matchMask.length && matchMask[i]);
    final entry = dict?.lookup(word);
    final text = Text(
      word,
      style: TextStyle(
        fontSize: 16,
        height: 1.6,
        color: missed ? p.red : p.text,
        decoration: missed || entry != null ? TextDecoration.underline : null,
        decorationStyle:
            missed ? TextDecorationStyle.solid : TextDecorationStyle.dotted,
        decorationColor: missed ? p.red : p.muted,
        fontWeight: missed ? FontWeight.bold : null,
      ),
    );
    if (entry == null) return text;
    return GestureDetector(
      onTap: () => _showEntrySheet(context, l, p, entry),
      child: text,
    );
  }

  void _showEntrySheet(
      BuildContext context, AppLocalizations l, PixelPalette p, ArchaicEntry entry) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => SafeArea(
        child: Container(
          margin: const EdgeInsets.fromLTRB(2, 0, 0, 2),
          decoration: BoxDecoration(
            color: p.surface,
            border: Border.all(color: p.border, width: 2),
            boxShadow: [BoxShadow(color: p.shadow, offset: const Offset(2, 2))],
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(entry.word,
                    style: TextStyle(
                        color: p.text, fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                _sheetRow(p, l.dictModernLabel, entry.modern),
                const SizedBox(height: 8),
                Text(entry.en,
                    style: TextStyle(color: p.muted, fontSize: 14, height: 1.5)),
                const SizedBox(height: 8),
                _sheetRow(p, l.dictKoLabel, entry.ko),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _sheetRow(PixelPalette p, String label, String value) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label  ',
              style: TextStyle(
                  color: p.muted, fontSize: 13, fontWeight: FontWeight.bold)),
          Expanded(
            child: Text(value,
                style: TextStyle(color: p.text, fontSize: 16, height: 1.4)),
          ),
        ],
      );
}
```

- [ ] **Step 2: memorize_screen.dart에서 옮긴 클래스 삭제 + import 추가**

`lib/features/memorize/memorize_screen.dart`에서 방금 옮긴 `class VerseWordsCard extends ConsumerWidget { ... }` 전체를 삭제한다(파일 마지막 부분, `_VerseWordsCardHost` 바로 아래에 있던 것).

파일 상단 import 목록에 추가:

```dart
import '../../shared/widgets/verse_words_card.dart';
```

`core/dictionary/archaic_dictionary.dart` import는 `memorize_screen.dart`의 다른 곳에서 안 쓰면 제거, 쓰면 유지한다 — 아래 명령으로 확인:

```bash
grep -n "ArchaicEntry\|ArchaicDictionary\|archaicDictionaryProvider" lib/features/memorize/memorize_screen.dart
```

VerseWordsCard 삭제 후에도 이 grep에 결과가 남아 있으면(예: 다른 곳에서 타입을 참조) import를 유지한다. 결과가 없으면 `import '../../core/dictionary/archaic_dictionary.dart';` 줄을 삭제한다.

- [ ] **Step 3: analyze로 미사용 import·컴파일 에러 확인**

```bash
flutter analyze --no-fatal-infos lib/features/memorize/memorize_screen.dart lib/shared/widgets/verse_words_card.dart
```

Expected: 에러 0. `unused_import` 경고가 뜨면 Step 2의 grep을 다시 돌려 판단대로 처리한다.

- [ ] **Step 4: 기존 테스트로 무회귀 확인**

```bash
flutter test test/memorize_result_dictionary_test.dart
```

Expected: `PASS (4 tests)` — 이 테스트는 `verse_flutter/features/memorize/memorize_screen.dart`에서 `VerseWordsCard`를 import하는데, `export`를 별도로 안 했어도 Dart는 이동된 클래스를 못 찾으므로 이 시점엔 **FAIL**할 수 있다. FAIL이면 `memorize_screen.dart`에 아래 export를 추가한다:

```dart
export '../../shared/widgets/verse_words_card.dart' show VerseWordsCard;
```

추가 후 다시 실행해 PASS를 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add lib/shared/widgets/verse_words_card.dart lib/features/memorize/memorize_screen.dart
git commit -m "refactor: VerseWordsCard를 shared/widgets로 이동 (통독 재사용 준비)"
```

---

### Task 2: 설정 저장소 + 토글 provider

**Files:**
- Modify: `lib/core/settings/app_settings_repository.dart`
- Modify: `lib/app/providers.dart`
- Test: `test/reading_dictionary_toggle_test.dart` (신설)

**Interfaces:**
- Produces: `AppSettingsRepository.readingDictionaryOnKey` (문자열 상수)
- Produces: `readingDictionaryOnProvider` — `NotifierProvider<ReadingDictionaryOnNotifier, bool>`.
  `ref.watch(readingDictionaryOnProvider)` → `bool`(기본 `true`).
  `ref.read(readingDictionaryOnProvider.notifier).set(bool)`, `.load()`.
  Task 3(컨트롤러)과 Task 5(설정 화면)가 이 provider를 쓴다.

- [ ] **Step 1: 저장소 키 추가**

`lib/core/settings/app_settings_repository.dart`의 `hapticsOnKey` 선언 바로 아래에 추가:

```dart
  static const readingDictionaryOnKey = 'reading_dictionary_on'; // '1'(기본) | '0'
```

- [ ] **Step 2: 실패하는 provider 테스트 작성**

`test/reading_dictionary_toggle_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/settings/app_settings_repository.dart';

void main() {
  late AppDatabase db;
  late ProviderContainer container;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    container = ProviderContainer(overrides: [databaseProvider.overrideWithValue(db)]);
  });
  tearDown(() {
    container.dispose();
    db.close();
  });

  test('기본값은 켜짐이다', () {
    expect(container.read(readingDictionaryOnProvider), isTrue);
  });

  test('set(false) 후 load()하면 꺼짐 상태를 읽어온다', () async {
    await container.read(readingDictionaryOnProvider.notifier).set(false);
    expect(container.read(readingDictionaryOnProvider), isFalse);

    final saved = await container
        .read(appSettingsRepositoryProvider)
        .read(AppSettingsRepository.readingDictionaryOnKey);
    expect(saved, '0');

    // 새 컨테이너(=앱 재시작 시뮬레이션)에서 load()가 저장된 값을 복원한다.
    final fresh = ProviderContainer(overrides: [databaseProvider.overrideWithValue(db)]);
    await fresh.read(readingDictionaryOnProvider.notifier).load();
    expect(fresh.read(readingDictionaryOnProvider), isFalse);
    fresh.dispose();
  });
}
```

- [ ] **Step 3: 실행 → 실패 확인**

```bash
flutter test test/reading_dictionary_toggle_test.dart
```

Expected: FAIL — `readingDictionaryOnProvider` 없음 (컴파일 에러).

- [ ] **Step 4: notifier + provider 구현**

`lib/app/providers.dart`에서 `hapticsOnProvider` 선언(`final hapticsOnProvider = NotifierProvider<HapticsOnNotifier, bool>(HapticsOnNotifier.new);`) 바로 아래에 추가:

```dart
/// 통독에서 절을 다 치면 멈추고 사전 카드를 보여줄지 — sound/haptics
/// 토글과 동일한 형태로 영속화한다. 기본 켜짐(사전을 발견하려면 설정에
/// 들어가야 하는 상황을 피하려고).
class ReadingDictionaryOnNotifier extends Notifier<bool> {
  @override
  bool build() => true;

  Future<void> load() async {
    final v = await ref
        .read(appSettingsRepositoryProvider)
        .read(AppSettingsRepository.readingDictionaryOnKey);
    state = v != '0';
  }

  Future<void> set(bool value) async {
    state = value;
    await ref
        .read(appSettingsRepositoryProvider)
        .write(AppSettingsRepository.readingDictionaryOnKey, value ? '1' : '0');
  }
}

final readingDictionaryOnProvider =
    NotifierProvider<ReadingDictionaryOnNotifier, bool>(
        ReadingDictionaryOnNotifier.new);
```

부팅 시 로드 지점(`await ref.read(hapticsOnProvider.notifier).load();` 바로 아래, 대략 195번째 줄)에 추가:

```dart
  await ref.read(readingDictionaryOnProvider.notifier).load();
```

- [ ] **Step 5: 실행 → 통과 확인**

```bash
flutter test test/reading_dictionary_toggle_test.dart
```

Expected: `PASS (2 tests)`

- [ ] **Step 6: analyze + 커밋**

```bash
flutter analyze --no-fatal-infos lib/core/settings/app_settings_repository.dart lib/app/providers.dart
git add lib/core/settings/app_settings_repository.dart lib/app/providers.dart test/reading_dictionary_toggle_test.dart
git commit -m "feat: 통독 사전 토글(readingDictionaryOnProvider) 추가 - 기본 켜짐"
```

---

### Task 3: ReadingController — verseDone + next()

**Files:**
- Modify: `lib/features/reading/reading_controller.dart`
- Modify: `lib/app/providers.dart` (readingControllerProvider에 토글 주입)
- Test: `test/reading_controller_test.dart` (확장)

**Interfaces:**
- Consumes: Task 2의 `readingDictionaryOnProvider`
- Produces:
  - `ReadingState.verseDone: bool` (기본 false)
  - `ReadingController` 생성자에 `bool dictionaryOn = false` named 파라미터 추가(기본값 false로 둬야
    Task 1에서 본 기존 테스트 `ReadingController(repo, verses, 0)` 호출이 인자 없이도 무회귀로 통과한다)
  - `void next()` — Task 4(화면)의 "넘어가기" 버튼이 호출

- [ ] **Step 1: 실패하는 컨트롤러 테스트 작성**

`test/reading_controller_test.dart` 맨 아래(`test('백스페이스는 커서를 되돌린다', ...)` 다음)에 추가:

```dart
  test('dictionaryOn:true — 절을 다 치면 verseDone이 되고 전진하지 않는다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0,
        dictionaryOn: true);

    c.input('G');
    c.input('o');
    await Future<void>.delayed(Duration.zero);

    expect(c.state.verseDone, isTrue);
    expect(c.state.verseIndex, 0); // 아직 안 넘어감
    expect(await ReadingProgressRepository(db).isTyped(100), isTrue); // 기록은 됨
  });

  test('dictionaryOn:true — next()를 부르면 다음 절로 넘어가고 verseDone이 풀린다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0,
        dictionaryOn: true);

    c.input('G');
    c.input('o');
    await Future<void>.delayed(Duration.zero);
    c.next();

    expect(c.state.verseDone, isFalse);
    expect(c.state.verseIndex, 1);
    expect(c.state.cursor.confirmed, '');
  });

  test('dictionaryOn:true — 마지막 절에서 next()를 부르면 장 완료가 된다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 1,
        dictionaryOn: true);

    c.input('U');
    c.input('p');
    await Future<void>.delayed(Duration.zero);
    expect(c.state.chapterDone, isFalse); // dictionaryOn이면 next() 전엔 아직

    c.next();
    expect(c.state.chapterDone, isTrue);
  });

  test('dictionaryOn:false(기본) — 절을 다 치면 즉시 다음 절로 전진한다(무회귀)', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0);

    c.input('G');
    c.input('o');
    await Future<void>.delayed(Duration.zero);

    expect(c.state.verseDone, isFalse);
    expect(c.state.verseIndex, 1);
  });
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
flutter test test/reading_controller_test.dart
```

Expected: FAIL — `verseDone` getter 없음, `dictionaryOn` named 파라미터 없음, `next()` 메서드 없음 (컴파일 에러).

- [ ] **Step 3: ReadingState에 verseDone 추가**

`lib/features/reading/reading_controller.dart`의 `ReadingState` 클래스를 아래로 교체:

```dart
class ReadingState {
  const ReadingState({
    required this.verses,
    required this.verseIndex,
    required this.cursor,
    this.chapterDone = false,
    this.missTick = 0,
    this.verseDone = false,
  });

  final List<CourseItem> verses;
  final int verseIndex;
  final TypingCursor cursor;

  /// 장의 마지막 절까지 마쳤다. 축하 화면으로 전환하는 신호.
  final bool chapterDone;

  /// 오타가 날 때마다 1씩 오른다. 화면이 이 값의 변화만 보고 흔들림 연출을
  /// 한 번 재생한다 — 같은 자리에서 연속으로 틀려도 매번 반응한다.
  final int missTick;

  /// dictionaryOn일 때만 쓰인다. 절을 다 쳤지만 아직 다음 절로 넘어가지
  /// 않은 상태 — 화면이 타이핑 UI 대신 사전 카드를 보여준다.
  final bool verseDone;

  CourseItem get verse => verses[verseIndex];

  ReadingState copyWith({
    int? verseIndex,
    TypingCursor? cursor,
    bool? chapterDone,
    int? missTick,
    bool? verseDone,
  }) =>
      ReadingState(
        verses: verses,
        verseIndex: verseIndex ?? this.verseIndex,
        cursor: cursor ?? this.cursor,
        chapterDone: chapterDone ?? this.chapterDone,
        missTick: missTick ?? this.missTick,
        verseDone: verseDone ?? this.verseDone,
      );
}
```

- [ ] **Step 4: 실행 → 여전히 실패(다음 단계 대상) 확인**

```bash
flutter test test/reading_controller_test.dart
```

Expected: 여전히 FAIL — 이번엔 `dictionaryOn`/`next()` 관련 에러만 남아야 한다.

- [ ] **Step 5: ReadingController에 dictionaryOn + next() 구현**

같은 파일에서 생성자와 `_completeVerse`, 그리고 새 `next()`를 아래로 교체:

```dart
class ReadingController extends StateNotifier<ReadingState> {
  ReadingController(
    this._reading,
    List<CourseItem> verses,
    int startIndex, {
    this.isFirstChapter = false,
    this.dictionaryOn = false,
    DateTime? lastAdAt,
    Sfx? sfx,
  })  : _sfx = sfx,
        _lastAdAt = lastAdAt ?? DateTime.now().toUtc(),
        super(ReadingState(
          verses: verses,
          verseIndex: startIndex,
          cursor: initialCursor(verses[startIndex].verseText),
        ));

  final ReadingProgressRepository _reading;

  /// 타격감(소리·진동). 테스트에서는 주지 않는다.
  final Sfx? _sfx;

  /// 연속 정타 수 — 소리 pitch만 올린다. 통독에는 콤보 UI도 실패도 없다.
  int _streak = 0;

  /// 사용자의 첫 통독 장이면 광고를 면제한다(스펙 §6).
  final bool isFirstChapter;

  /// 절을 다 치면 멈추고 사전 카드를 보여줄지 — readingDictionaryOnProvider를
  /// 그대로 받는다(꺼짐이 기본이 아니라 provider 기본이 켜짐이므로 실질
  /// 기본은 켜짐. 이 파라미터 자체의 기본값 false는 컨트롤러를 직접
  /// 생성하는 기존 테스트의 무회귀만을 위한 것).
  final bool dictionaryOn;

  DateTime _lastAdAt;
  bool _adPending = false;
  static const _uuid = Uuid();

  /// 한 글자 입력. 틀린 글자는 [advanceCursor]가 무시하므로 커서가 정지한다.
  void input(String ch) {
    if (state.chapterDone || state.verseDone) return;
    final next = advanceCursor(state.cursor, ch);
    if (next.index == state.cursor.index) {
      // 오타 — 커서는 그대로지만 왜 안 나가는지는 알려준다. 통독에는 실패가
      // 없으므로 소리는 내지 않고 진동과 화면 흔들림만 준다.
      _streak = 0;
      _sfx?.missHaptic();
      state = state.copyWith(missTick: state.missTick + 1);
      return;
    }
    _streak++;
    _sfx?.hit(_streak);

    if (next.isComplete) {
      unawaited(_completeVerse());
      return;
    }
    state = state.copyWith(cursor: next);
  }

  void backspace() {
    if (state.chapterDone || state.verseDone) return;
    state = state.copyWith(cursor: backspaceCursor(state.cursor));
  }

  /// 절 완료 — 진행 기록 + 시도 적재. dictionaryOn이면 여기서 멈추고
  /// [next]가 호출될 때까지 다음 절로 넘어가지 않는다.
  Future<void> _completeVerse() async {
    final item = state.verse;
    await _reading.markTyped(item.id);
    await _enqueueAttempt(item);

    if (dictionaryOn) {
      state = state.copyWith(verseDone: true);
      return;
    }
    _advance();
  }

  /// 다음 절로 실제 전진. dictionaryOn이 아니면 [_completeVerse]가 바로
  /// 부르고, dictionaryOn이면 화면의 "넘어가기" 버튼이 이걸 부른다.
  void next() {
    if (!state.verseDone) return;
    _advance();
  }

  void _advance() {
    final item = state.verse;
    final nextIndex = state.verseIndex + 1;
    final isChapterBoundary = nextIndex >= state.verses.length;

    _evaluateAd(isChapterBoundary: isChapterBoundary);

    if (isChapterBoundary) {
      state = state.copyWith(
        cursor: TypingCursor(text: item.verseText, index: item.verseText.length),
        chapterDone: true,
        verseDone: false,
      );
      return;
    }
    state = state.copyWith(
      verseIndex: nextIndex,
      cursor: initialCursor(state.verses[nextIndex].verseText),
      verseDone: false,
    );
  }

  /// 절 경계에서만 호출된다 — 타이핑 도중에는 절대 광고를 띄우지 않는다.
  void _evaluateAd({required bool isChapterBoundary}) {
    final due = shouldShowInterstitial(
      isChapterBoundary: isChapterBoundary,
      isFirstChapter: isFirstChapter,
      sinceLastAd: DateTime.now().toUtc().difference(_lastAdAt),
    );
    if (due) _adPending = true;
  }

  /// 화면이 호출한다 — 대기 중인 광고 요청을 한 번만 넘겨주고 타이머를 리셋한다.
  /// 컨트롤러는 광고 SDK를 모른다(그래야 위젯 없이 테스트된다).
  bool consumeAdRequest() {
    if (!_adPending) return false;
    _adPending = false;
    _lastAdAt = DateTime.now().toUtc();
    return true;
  }

  /// 암송과 동일한 형태로 attempt_queue에 쌓는다 — 기존 배치 동기화가 그대로
  /// 서버로 보낸다. 글자 단위 차단 덕분에 입력은 원문과 정규화 기준으로 항상
  /// 같으므로 clientGrade는 언제나 green이다(스펙 §4.3).
  Future<void> _enqueueAttempt(CourseItem item) async {
    final tokens = grading.normalize(item.verseText);
    await _reading.db.into(_reading.db.attemptQueue).insert(AttemptQueueCompanion.insert(
          clientSeq: _uuid.v4(),
          courseItemId: item.id,
          mode: 'reading',
          clientGrade: grading.Grade.green.wire,
          tokensJson: jsonEncode(tokens),
          createdAt: DateTime.now().toUtc(),
        ));
  }
}
```

주의: `_advance` 안의 `item`은 전진하기 **전**의(즉 방금 완료한) 절이어야 장 경계 케이스에서 커서를 그 절 텍스트로 채울 수 있다 — `state.verse`는 `_advance` 호출 시점엔 아직 안 바뀐 상태이므로 위 코드 그대로 맞다.

- [ ] **Step 6: 실행 → 통과 확인**

```bash
flutter test test/reading_controller_test.dart
```

Expected: `PASS (10 tests)`

- [ ] **Step 7: readingControllerProvider에 토글 주입**

`lib/app/providers.dart`의 `readingControllerProvider` 정의를 아래로 교체:

```dart
final readingControllerProvider = StateNotifierProvider.family<
    ReadingController, ReadingState, ReadingSession>(
  (ref, session) => ReadingController(
    ref.watch(readingProgressRepositoryProvider),
    session.verses,
    session.startIndex,
    isFirstChapter: session.isFirstChapter,
    dictionaryOn: ref.watch(readingDictionaryOnProvider),
    sfx: ref.watch(sfxProvider),
  ),
);
```

- [ ] **Step 8: analyze + 전체 통독 관련 테스트 재확인**

```bash
flutter analyze --no-fatal-infos lib/features/reading/reading_controller.dart lib/app/providers.dart
flutter test test/reading_controller_test.dart
```

Expected: analyze 에러 0, 테스트 `PASS (10 tests)`

- [ ] **Step 9: 커밋**

```bash
git add lib/features/reading/reading_controller.dart lib/app/providers.dart test/reading_controller_test.dart
git commit -m "feat: ReadingController에 verseDone/next() 추가 - 사전 토글 켜짐 시 절 완료마다 정지"
```

---

### Task 4: 통독 화면 — 절 완료 카드 분기

**Files:**
- Modify: `lib/features/reading/reading_screen.dart`
- Test: `test/reading_verse_dictionary_screen_test.dart` (신설)

**Interfaces:**
- Consumes: Task 1의 `VerseWordsCard`(from `lib/shared/widgets/verse_words_card.dart`), Task 3의
  `ReadingState.verseDone`, `ReadingController.next()`, Task 2의 `readingDictionaryOnProvider`
- Produces: 없음(리프 화면)

- [ ] **Step 1: 실패하는 위젯 테스트 작성**

`test/reading_verse_dictionary_screen_test.dart` — 기존 위젯 테스트가 없으니 부트스트랩 패턴은
`test/memorize_result_dictionary_test.dart`를 참고해 직접 구성한다. 통독은 DB가 필요하므로
`reading_controller_test.dart`의 `_seededDb` 패턴과 결합한다:

```dart
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/dictionary/archaic_dictionary.dart';
import 'package:verse_flutter/features/reading/reading_controller.dart';
import 'package:verse_flutter/features/reading/reading_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

const _sampleDict = '''
{
  "go": {"modern": "go", "en": "move from one place to another", "ko": "가다"}
}
''';

Future<AppDatabase> _seededDb() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'genesis', title: '창세기', ord: 1, category: 'ot'));
  await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: const Value(100), courseId: 1, sectionId: const Value(10), ord: 0,
        book: 1, chapter: 1, verse: 1, verseText: 'Go.'));
  await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: const Value(101), courseId: 1, sectionId: const Value(10), ord: 1,
        book: 1, chapter: 1, verse: 2, verseText: 'Up.'));
  return db;
}

void main() {
  testWidgets('사전 켜짐 — 절을 다 치면 카드가 뜨고 넘어가기로 다음 절로 간다',
      (tester) async {
    final db = await _seededDb();
    final verses =
        await (db.select(db.courseItems)..orderBy([(t) => OrderingTerm.asc(t.ord)])).get();
    final session =
        ReadingSession(verses: verses, startIndex: 0, sectionId: 10, isFirstChapter: false);

    final container = ProviderContainer(overrides: [
      databaseProvider.overrideWithValue(db),
      readingDictionaryOnProvider.overrideWith((ref) {
        final n = ReadingDictionaryOnNotifier();
        return n;
      }),
      archaicDictionaryProvider
          .overrideWith((ref) async => ArchaicDictionary.fromJsonString(_sampleDict)),
    ]);
    addTearDown(container.dispose);
    addTearDown(db.close);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('ko'),
        home: const Scaffold(body: ReadingScreen()),
      ),
    ));
    await tester.pump();
    await tester.pump();

    // "G", "o" 입력 — 통독 화면은 숨겨진 TextField를 통해 onChanged로 받는다.
    await tester.enterText(find.byType(TextField), 'Go');
    await tester.pump();
    await tester.pump();

    expect(find.text('넘어가기'), findsOneWidget);
    expect(find.text('go'), findsOneWidget); // VerseWordsCard 안의 단어

    await tester.tap(find.text('넘어가기'));
    await tester.pump();

    expect(find.text('1:2'), findsOneWidget); // 다음 절(2절)로 넘어감 — book:chapter:verse 라벨
  });
}
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
flutter test test/reading_verse_dictionary_screen_test.dart
```

Expected: FAIL — "넘어가기" 텍스트/버튼이 없어서 `findsOneWidget`이 실패하거나, `readingDictionaryOnProvider` 기본 켜짐인데 정지 UI 자체가 없어 카드가 안 뜬다.

- [ ] **Step 3: reading_screen.dart에 절 완료 분기 추가**

`lib/features/reading/reading_screen.dart`의 import에 추가:

```dart
import '../../shared/widgets/verse_words_card.dart';
```

`_ReadingBodyState.build`에서 `if (state.chapterDone) { return _chapterDone(context, l); }` 바로
아래에 절 완료 분기를 추가한다:

```dart
    if (state.chapterDone) {
      return _chapterDone(context, l);
    }

    if (state.verseDone) {
      return _verseDone(context, ref, l, state);
    }
```

(`build` 시그니처가 `Widget build(BuildContext context)`이고 `ref`는 `ConsumerState`의 필드로
바로 쓸 수 있다 — `_chapterDone`처럼 `ref` 매개변수를 따로 받지 않아도 된다. 아래 `_verseDone`은
`next()`를 부르려 `ref`가 필요하므로 매개변수로 명시해 받는다.)

`_stopHere`/`_chapterDone` 메서드들 사이에 새 메서드를 추가한다:

```dart
  /// 절을 다 쳤고 dictionaryOn이라 멈춘 상태. 방금 친 절을 사전 카드로
  /// 보여주고, "넘어가기"를 눌러야 다음 절로 간다. 진행바·"여기까지"는
  /// 타이핑 중과 동일하게 유지한다 — 별도 화면이 아니라 통독 중의 한 상태다.
  Widget _verseDone(
      BuildContext context, WidgetRef ref, AppLocalizations l, ReadingState state) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${state.verse.book}:${state.verse.chapter}:${state.verse.verse}',
              style: theme.textTheme.labelLarge,
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: (state.verseIndex + 1) / state.verses.length,
                minHeight: 8,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              l.readingChapterProgress(state.verseIndex + 1, state.verses.length),
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 24),
            Expanded(
              child: SingleChildScrollView(
                child: VerseWordsCard(
                  words: state.verse.verseText.split(RegExp(r'\s+')),
                  matchMask: List<bool>.filled(
                      state.verse.verseText.split(RegExp(r'\s+')).length, true),
                  showMistakes: false,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => _stopHere(context, l),
                style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
                child: Text(l.readingStopHere),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () =>
                  ref.read(readingControllerProvider(widget.session).notifier).next(),
              child: Text(l.readingNextVerse),
            ),
            Align(
              alignment: Alignment.center,
              child: TextButton(
                onPressed: () async {
                  await ref.read(readingDictionaryOnProvider.notifier).set(false);
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text(l.readingDictionaryOffHint)));
                  ref.read(readingControllerProvider(widget.session).notifier).next();
                },
                child: Text(l.readingDictionaryStopShowing),
              ),
            ),
          ],
        ),
      ),
    );
  }
```

- [ ] **Step 4: l10n 문자열 추가**

`lib/l10n/app_ko.arb`의 `readingStopHere` 줄 바로 아래에 추가:

```json
  "readingNextVerse": "넘어가기",
  "readingDictionaryStopShowing": "그만 보기",
  "readingDictionaryOffHint": "설정에서 다시 켤 수 있어요",
```

`lib/l10n/app_en.arb`의 같은 위치에:

```json
  "readingNextVerse": "Next verse",
  "readingDictionaryStopShowing": "Stop showing this",
  "readingDictionaryOffHint": "You can turn it back on in Settings",
```

```bash
flutter gen-l10n
```

- [ ] **Step 5: 실행 → 통과 확인**

```bash
flutter test test/reading_verse_dictionary_screen_test.dart
```

Expected: `PASS (1 test)`. FAIL이면 진단 순서:
1. "넘어가기 텍스트 없음" → Step 3의 `_verseDone` 분기가 실제로 타는지, `readingDictionaryOnProvider` 기본값이 오버라이드에서 진짜 켜짐인지 확인
2. "'go' 텍스트 없음" → `archaicDictionaryProvider` 오버라이드가 `FutureProvider`라 `pump()` 한 번으로는 안 풀릴 수 있음 — `await tester.pump();`를 하나 더 추가
3. "1:2 라벨 없음" → `next()` 호출 후 `state.verseIndex`가 실제로 1로 올랐는지, book/chapter/verse 텍스트 포맷이 `'${book}:${chapter}:${verse}'`와 일치하는지 확인(테스트 데이터의 book=1, chapter=1, verse=2 → `"1:1:2"`가 맞다 — 위 테스트의 `'1:2'` 기대값은 `find.textContaining`으로 바꿔야 정확하다. 이 경우 `expect(find.textContaining('1:2'), findsOneWidget);`으로 수정)

- [ ] **Step 6: 전체 통독/암송 테스트로 무회귀 확인**

```bash
flutter test test/reading_controller_test.dart test/reading_verse_dictionary_screen_test.dart test/memorize_result_dictionary_test.dart test/memorize_controller_test.dart
```

Expected: 전체 PASS

- [ ] **Step 7: analyze + 커밋**

```bash
flutter analyze --no-fatal-infos
git add lib/features/reading/reading_screen.dart lib/l10n/ test/reading_verse_dictionary_screen_test.dart
git commit -m "feat: 통독 절 완료 시 사전 카드 표시 + 넘어가기/그만 보기"
```

---

### Task 5: 설정 화면 토글 행

**Files:**
- Modify: `lib/features/settings/settings_screen.dart`
- Modify: `lib/l10n/app_en.arb`, `lib/l10n/app_ko.arb`

**Interfaces:**
- Consumes: Task 2의 `readingDictionaryOnProvider`

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`의 `settingsHaptics` 줄 바로 아래에 추가:

```json
  "settingsReadingDictionary": "절마다 사전 보기",
  "settingsReadingDictionarySubtitle": "통독에서 절을 다 치면 멈추고 단어 뜻을 봐요",
```

`lib/l10n/app_en.arb`의 같은 위치에:

```json
  "settingsReadingDictionary": "Dictionary after each verse",
  "settingsReadingDictionarySubtitle": "Pause after each verse in reading to look up words",
```

```bash
flutter gen-l10n
```

- [ ] **Step 2: 토글 행 위젯 추가**

`lib/features/settings/settings_screen.dart`에서 `class _HapticsRow extends ConsumerWidget { ... }`
클래스 바로 아래에 추가:

```dart
class _ReadingDictionaryRow extends ConsumerWidget {
  const _ReadingDictionaryRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final on = ref.watch(readingDictionaryOnProvider);
    return _SettingsRow(
      title: l.settingsReadingDictionary,
      subtitle: l.settingsReadingDictionarySubtitle,
      trailing: Switch(
          value: on, onChanged: (v) => ref.read(readingDictionaryOnProvider.notifier).set(v)),
      onTap: () => ref.read(readingDictionaryOnProvider.notifier).set(!on),
    );
  }
}
```

`build` 메서드의 위젯 목록에서 `const _HapticsRow(),` 바로 아래에 추가:

```dart
          const _ReadingDictionaryRow(),
```

- [ ] **Step 3: analyze**

```bash
flutter analyze --no-fatal-infos lib/features/settings/settings_screen.dart
```

Expected: 에러 0

- [ ] **Step 4: 기존 설정 화면 테스트가 있으면 실행(없으면 스킵)**

```bash
find test -iname "*settings*"
```

파일이 있으면 그 파일들을 실행해 무회귀 확인:

```bash
flutter test <찾은 파일 경로>
```

Expected: PASS. (파일이 없으면 이 스텝은 건너뛴다 — 새 테스트를 요구하지 않는다, 이 행은
기존 `_SoundRow`/`_HapticsRow`와 동일한 패턴을 그대로 복붙한 것이라 회귀 위험이 낮다.)

- [ ] **Step 5: 커밋**

```bash
git add lib/features/settings/settings_screen.dart lib/l10n/
git commit -m "feat: 설정에 '절마다 사전 보기' 토글 행 추가"
```

---

### Task 6: 전체 회귀 확인 + 시뮬레이터 검증

**Files:** 없음(검증만)

- [ ] **Step 1: 전체 테스트 스위트**

```bash
flutter analyze --no-fatal-infos
flutter test
```

Expected: analyze 에러 0(기존 info/warning 17개는 이 작업과 무관하니 그대로 둔다), 테스트 전체 PASS

- [ ] **Step 2: 시뮬레이터에서 통독 1회 진행**

앱을 시뮬레이터에서 실행해 확인:
1. 설정 화면에서 "절마다 사전 보기"가 기본 켜짐인지 확인
2. 통독 진입 → 첫 절 다 치기 → 화면이 멈추고 방금 친 절이 밑줄 카드로 뜨는지 확인
3. 등재 단어(예: `thou`, `hath` 같은 계층 A, 또는 흔한 내용어) 탭 → 바텀시트에 뜻이 뜨는지 확인
4. "넘어가기" → 다음 절로 진행 확인, 키보드가 다시 잡히는지(포커스 복귀) 확인
5. "그만 보기" → 스낵바 뜨고 이후 절부터는 멈추지 않고 논스톱으로 진행되는지 확인
6. 설정에서 토글을 다시 켜고 통독 재진입 → 다시 멈추는지 확인
7. 장 마지막 절에서 "넘어가기" → 기존 장 완료 화면(마스코트)으로 정상 전환되는지 확인
8. "여기까지" 버튼이 절 완료 상태에서도 눌리고 정상 저장되는지 확인

- [ ] **Step 3: 스크린샷 확보 후 완료 보고**

---

## Self-Review 메모

- **스펙 커버리지:** 배경/목표(Task 3,4) · VerseWordsCard 이동(Task 1) · 설정 토글 A안(Task 2,5) ·
  카드 내 "그만 보기" B안(Task 4) · 광고 타이밍(Task 3의 `_evaluateAd` 위치) · 기본값 켜짐(Task 2)
  — 스펙의 모든 섹션에 대응하는 태스크가 있다. C안(자동 전진)은 스펙에서 명시적으로 비목표로
  뺀 대안이라 태스크 없음(의도됨).
- **타입 일관성:** `ReadingController(repo, verses, startIndex, {dictionaryOn, isFirstChapter, ...})`,
  `ReadingState.verseDone`, `next()` — Task 3에서 정의한 시그니처를 Task 4가 그대로 쓴다.
  `VerseWordsCard({words, matchMask, showMistakes})` — Task 1 정의를 Task 4가 그대로 쓴다.
- **알려진 리스크:** Task 4 Step 5는 위젯 테스트 검증을 실제로 해본 게 아니라 예상 실패 지점과
  진단 순서를 미리 적어둔 것이다 — `find.byType(TextField)`가 통독 화면에 있는 높이-1짜리
  투명 TextField 하나뿐인지, `enterText`가 sentinel 문자 처리와 충돌하지 않는지는 구현자가
  Step 2(실패 확인)에서 실제 에러 메시지를 보고 조정해야 한다.

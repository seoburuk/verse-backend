# 카드 카탈로그 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드 도감에 23장을 추가하고, 관련 절 매핑을 손이 아니라 스크립트로 생성하는 파이프라인을 세운다.

**Architecture:** `tool/cards/sources.json`에 카드별 검색 정규식을 적으면 생성기가 `assets/courses/courses.json`(31,102절, 본문 포함)을 훑어 `assets/cards/cards.json`의 `verses`를 채운다. 관련 절이 수백 개가 되어도 데이터를 자르지 않고, 등급 판정의 분모만 `min(n, 100)`으로 눌러 레전드를 도달 가능하게 만든다. 앱 런타임 변경은 등급 분모 클램프 한 줄과 `kind` 색 맵 하나뿐이다.

**Tech Stack:** Dart / Flutter (`verse-flutter` 패키지), 순수 Dart 생성기(`dart run`), `flutter test`.

## Global Constraints

- **작업 저장소는 `verse-flutter/`다.** 부모 저장소(`kjvapp`)와 별개의 git 저장소이므로 커밋은 `verse-flutter` 안에서 한다. 모든 경로는 `verse-flutter/` 기준이다.
- **KJV 원문 출처는 `assets/courses/courses.json`이다.** 부모 저장소의 `files/data/kjv/`를 쓰지 않는다. courses.json은 31,102절 전체를 담고 각 항목에 `text`가 있으며, 통합 테스트가 대조하는 집합과 같은 출처라 생성된 ref가 구조적으로 유효하다.
- **`books` 필드는 책 이름이 아니라 책 번호를 쓴다.** 설계 문서 §2는 `"Revelation"` 같은 이름을 적었지만, courses.json에는 책 이름이 없고 번호(1~66)만 있다. 이름 대신 번호를 쓰고 `"NT"`(40~66)·`"OT"`(1~39) 축약을 지원한다. `cards.json`의 ref가 이미 번호 형식(`"66:13:1"`)이라 표기가 일관된다.
- **등급 분모 상한은 100이다.** 상수명 `kCardTierMaxTotal`, 위치 `lib/core/cards/card_tier.dart`.
- **관련 절은 카드당 4개 이상이어야 한다.** 기존 `test/cards_catalog_integrity_test.dart`가 이미 강제한다. 4개 미만인 카드는 `sources.json`에서 뺀다.
- **`tiers.json`의 `0.34`/`0.67`은 건드리지 않는다.**
- **기존 카드 6장(`dove` `ark` `staff` `sling` `lion` `great-fish`)의 `verses`는 어떤 경우에도 바뀌면 안 된다.** 이미 쓰고 있는 사용자의 등급이 내려간다.
- 주석·커밋 메시지·카드 문구는 한국어로 쓴다. 기존 코드의 서술체(`~한다`)를 따른다.

---

### Task 1: 등급 판정 분모를 100으로 클램프

**Files:**
- Modify: `lib/core/cards/card_tier.dart:30-42`
- Test: `test/card_tier_test.dart`

**Interfaces:**
- Consumes: 없음(첫 태스크)
- Produces: `const int kCardTierMaxTotal = 100;` — Task 3의 생성기가 상한을 넘는 카드를 만들어도 되는 근거이고, Task 5의 문서 문구가 참조한다. `tierOf({required int memorized, required int total, required List<TierThreshold> thresholds}) → CardTier?` 시그니처는 **바뀌지 않는다**(호출부 `card_repository.dart:_tierFor`를 손대지 않기 위함).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/card_tier_test.dart` 파일 끝, 마지막 `});` 앞에 아래 테스트들을 추가한다.

```dart
  test('관련 절이 100개를 넘으면 분모를 100으로 누른다', () {
    // 지구 카드(906절)에서 100절을 외우면 레전드다.
    expect(tier(100, 906), CardTier.legend);
    // 99절이면 아직 골드다(0.99 >= 0.67).
    expect(tier(99, 906), CardTier.gold);
  });

  test('눌린 분모를 넘겨 외워도 레전드에 머문다', () {
    expect(tier(150, 906), CardTier.legend);
    expect(tier(906, 906), CardTier.legend);
  });

  test('눌린 분모 100 위에서 실버·골드 경계가 잡힌다', () {
    expect(tier(33, 906), CardTier.bronze); // 0.33
    expect(tier(34, 906), CardTier.silver); // 0.34
    expect(tier(66, 906), CardTier.silver); // 0.66
    expect(tier(67, 906), CardTier.gold); // 0.67
  });

  test('정확히 100절짜리 카드는 클램프 전후가 같다', () {
    expect(tier(100, 100), CardTier.legend);
    expect(tier(99, 100), CardTier.gold);
  });

  test('100 미만인 카드는 기존 판정 그대로다', () {
    expect(tier(55, 55), CardTier.legend);
    expect(tier(54, 55), CardTier.gold);
    expect(tier(19, 55), CardTier.silver); // 0.345
    expect(tier(18, 55), CardTier.bronze); // 0.327
  });

  test('상한 상수는 100이다', () {
    expect(kCardTierMaxTotal, 100);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `flutter test test/card_tier_test.dart`
Expected: FAIL. `kCardTierMaxTotal` 미정의로 컴파일 에러가 나고, 클램프 테스트들이 실패한다.

- [ ] **Step 3: 최소 구현을 넣는다**

`lib/core/cards/card_tier.dart`에서 `kDefaultTierThresholds` 선언 바로 아래에 상수를 추가한다.

```dart
/// 등급 판정에 쓰는 분모의 상한. 관련 절이 906개인 카드에서 "전부 외워야 레전드"를
/// 그대로 적용하면 레전드가 도달 불가능해진다. 데이터를 자르는 대신 분모만 누른다 —
/// 그래야 906절 중 어느 100절을 외워도 레전드가 된다.
const int kCardTierMaxTotal = 100;
```

이어서 `tierOf`의 본문 첫 줄을 고친다. 시그니처는 그대로 두고 내부에서만 누른다.

```dart
CardTier? tierOf({
  required int memorized,
  required int total,
  required List<TierThreshold> thresholds,
}) {
  if (total <= 0 || memorized <= 0) return null;

  // 분모만 누른다. memorized가 이 값을 넘을 수 있으므로(906절 중 150절) >= 비교가 필요하다.
  final capped = total > kCardTierMaxTotal ? kCardTierMaxTotal : total;
  if (memorized >= capped) return CardTier.legend;

  final ratio = memorized / capped;
  var result = CardTier.bronze;
  for (final t in thresholds) {
    if (ratio >= t.minRatio && t.tier.index > result.index) result = t.tier;
  }
  return result;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `flutter test test/card_tier_test.dart`
Expected: PASS. 기존 8개 + 신규 6개, 모두 14개가 통과한다.

- [ ] **Step 5: 리포지토리 레벨에서도 클램프가 통하는지 확인한다**

`tierOf` 단위 테스트만으로는 `CardRepository`가 실제로 클램프된 분모로 등급을 매기는지 안 드러난다. `test/card_repository_test.dart` 파일의 마지막 `test(...)` 블록 뒤, 마지막 `});`(main 함수를 닫는 줄) 앞에 추가한다.

```dart
  test('관련 절이 100개를 넘는 카드도 100개를 외우면 레전드로 반환된다', () async {
    // 106개짜리 큰 카드 — 지구·예루살렘 같은 카드의 축소판이다.
    final bigVerses = [for (var v = 1; v <= 106; v++) VerseRef(1, 8, v)];
    for (var i = 0; i < 100; i++) {
      await seedVerse(bigVerses[i], cleared: true);
    }
    for (var i = 100; i < 106; i++) {
      await seedVerse(bigVerses[i]); // 안 외움
    }

    final result = await repo.unlockedCards([_card('big', bigVerses)]);
    expect(result.single.tier, CardTier.legend);
  });

  test('큰 카드에서 100번째 절을 외운 순간 등급 상승이 뜬다', () async {
    final bigVerses = [for (var v = 1; v <= 106; v++) VerseRef(1, 8, v)];
    for (var i = 0; i < 99; i++) {
      await seedVerse(bigVerses[i], cleared: true);
    }
    for (var i = 99; i < 106; i++) {
      await seedVerse(bigVerses[i]);
    }
    // 아직 99개 — 골드(0.99 >= 0.67이지만 100 미만이므로 legend 아님).
    final before = await repo.unlockedCards([_card('big', bigVerses)]);
    expect(before.single.tier, CardTier.gold);

    // 100번째 절을 외운다.
    await seedVerse(bigVerses[99], cleared: true);
    final upgrades =
        await repo.pendingUpgradesForVerse([_card('big', bigVerses)], bigVerses[99]);
    expect(upgrades.single.tier, CardTier.legend);
  });

  test('클램프된 카드에서 101번째 절을 외워도 이미 레전드라 등급 변화가 없다', () async {
    final bigVerses = [for (var v = 1; v <= 106; v++) VerseRef(1, 8, v)];
    for (var i = 0; i < 100; i++) {
      await seedVerse(bigVerses[i], cleared: true);
    }
    for (var i = 100; i < 106; i++) {
      await seedVerse(bigVerses[i]);
    }
    // 이미 레전드인 상태에서 101번째 절을 마저 외운다.
    await seedVerse(bigVerses[100], cleared: true);
    final upgrades =
        await repo.pendingUpgradesForVerse([_card('big', bigVerses)], bigVerses[100]);
    expect(upgrades, isEmpty, reason: '이미 레전드이므로 더 오를 등급이 없다');
  });
```

Run: `flutter test test/card_repository_test.dart`
Expected: PASS. 세 테스트 모두 통과해야 클램프가 `CardRepository` 경로에서도 실제로 동작한다는 뜻이다.

- [ ] **Step 6: 도감 화면 회귀를 확인한다**

Run: `flutter test test/card_collection_screen_test.dart`
Expected: PASS. 호출부를 안 건드렸으므로 그대로 통과해야 한다.

- [ ] **Step 7: 커밋한다**

```bash
git add lib/core/cards/card_tier.dart test/card_tier_test.dart
git commit -m "feat: 등급 판정 분모를 100으로 클램프

관련 절이 수백 개인 카드에서 레전드가 도달 불가능해지는 것을 막는다.
데이터를 자르지 않고 분모만 눌러서, 906절 중 어느 100절을 외워도
레전드가 되게 한다."
```

---

### Task 2: `kind` 6갈래 색 맵

**Files:**
- Modify: `lib/features/cards/card_tile.dart:34`
- Test: `test/card_kind_color_test.dart` (신규)

**Interfaces:**
- Consumes: 없음(Task 1과 독립)
- Produces: `Color cardKindColor(String kind)` — `card_tile.dart`의 최상위 함수. 기존 `cardTierColor`/`cardTierLabel`과 같은 자리에 둔다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/card_kind_color_test.dart`를 새로 만든다.

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/features/cards/card_tile.dart';

void main() {
  test('6갈래가 각자 다른 색을 갖는다', () {
    const kinds = ['animal', 'figure', 'plant', 'creature', 'place', 'object'];
    final colors = kinds.map(cardKindColor).toSet();
    expect(colors.length, 6, reason: '갈래마다 색이 달라야 타일로 구분된다');
  });

  test('기존 두 갈래의 색은 바뀌지 않는다', () {
    expect(cardKindColor('animal'), const Color(0xFF4F8A5B));
    expect(cardKindColor('figure'), const Color(0xFF7C6BAF));
  });

  test('새 갈래의 색이 정해져 있다', () {
    expect(cardKindColor('plant'), const Color(0xFF6B8E3D));
    expect(cardKindColor('creature'), const Color(0xFFA03E4A));
    expect(cardKindColor('place'), const Color(0xFF3E7C93));
    expect(cardKindColor('object'), const Color(0xFFA8763E));
  });

  test('모르는 갈래는 animal 색으로 떨어진다', () {
    expect(cardKindColor('mineral'), cardKindColor('animal'));
    expect(cardKindColor(''), cardKindColor('animal'));
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `flutter test test/card_kind_color_test.dart`
Expected: FAIL. `cardKindColor` 미정의로 컴파일 에러.

- [ ] **Step 3: 최소 구현을 넣는다**

`lib/features/cards/card_tile.dart`에서 `cardTierLabel` 선언 바로 아래에 함수를 추가한다.

```dart
/// 갈래별 타일 색. 아트가 없을 때 카드끼리 구분되는 유일한 단서다.
/// 모르는 값은 animal로 떨어뜨린다 — 카탈로그가 계속 늘어나므로 새 갈래가 와도 앱이 깨지면 안 된다.
Color cardKindColor(String kind) => switch (kind) {
      'figure' => const Color(0xFF7C6BAF),
      'plant' => const Color(0xFF6B8E3D),
      'creature' => const Color(0xFFA03E4A),
      'place' => const Color(0xFF3E7C93),
      'object' => const Color(0xFFA8763E),
      _ => const Color(0xFF4F8A5B),
    };
```

같은 파일의 `_tint` 게터를 이 함수로 바꾼다.

```dart
  Color get _tint => cardKindColor(_card.kind);
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `flutter test test/card_kind_color_test.dart`
Expected: PASS (4개 통과).

- [ ] **Step 5: 도감 화면 회귀를 확인한다**

Run: `flutter test test/card_collection_screen_test.dart`
Expected: PASS.

- [ ] **Step 6: `card_def.dart`의 주석을 갱신한다**

`lib/core/cards/card_def.dart`의 `kind` 필드 주석이 두 갈래만 적고 있어 사실과 어긋난다. 바꾼다.

```dart
  /// 'animal' | 'plant' | 'creature' | 'place' | 'object'
  /// | 'figure'(사람 대신 장비·상징물로 표현되는 인물)
  final String kind;
```

- [ ] **Step 7: 커밋한다**

```bash
git add lib/features/cards/card_tile.dart lib/core/cards/card_def.dart test/card_kind_color_test.dart
git commit -m "feat: 카드 갈래를 6개로 늘리고 색 맵을 분리

동물·상징물 두 갈래로는 식물·괴물·장소·사물을 담을 수 없다.
삼항 연산자를 cardKindColor로 빼내 테스트 가능하게 만들었다."
```

---

### Task 3: 생성기 순수 로직

**Files:**
- Create: `tool/cards/card_generator.dart`
- Test: `test/card_generator_test.dart` (신규)

**Interfaces:**
- Consumes: Task 1의 `kCardTierMaxTotal`은 **쓰지 않는다**(생성기는 절을 자르지 않는다).
- Produces:
  - `class BibleVerse { final int book, chapter, verse; final String text; String get ref; }`
  - `class CardSource { final String id, name, nameEn, kind, description, descriptionEn, include, exclude; final List<dynamic> books; factory CardSource.fromJson(Map<String, dynamic>); }`
  - `List<BibleVerse> collectVerses(List<dynamic> courses)` — 정경 순서 정렬, ref 중복 제거
  - `Set<int> resolveBooks(List<dynamic> books)` — 빈 목록이면 빈 Set(= 제한 없음)
  - `List<String> matchRefs(List<BibleVerse> bible, CardSource src)`
  - `Map<String, dynamic> buildCard(CardSource src, List<String> refs)`
  - `List<Map<String, dynamic>> mergeCatalog(List<Map<String, dynamic>> existing, List<Map<String, dynamic>> generated)`

  Task 4의 CLI가 이 전부를 호출한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/card_generator_test.dart`를 새로 만든다. 생성기는 `lib/` 밖에 있으므로 상대 경로로 import한다.

```dart
import 'package:flutter_test/flutter_test.dart';

import '../tool/cards/card_generator.dart';

/// courses.json의 최소 형태. 68개 코스는 sections를 갖고 2개는 items를 직접 갖는다.
List<dynamic> fakeCourses() => [
      {
        'slug': 'with-sections',
        'sections': [
          {
            'items': [
              {'book': 1, 'chapter': 8, 'verse': 8, 'text': 'He sent forth a dove.'},
              {'book': 1, 'chapter': 8, 'verse': 9, 'text': 'But the dove found no rest.'},
            ]
          }
        ]
      },
      {
        'slug': 'with-items',
        'items': [
          {'book': 66, 'chapter': 13, 'verse': 1, 'text': 'And I saw a beast rise up.'},
          // 위 코스와 중복되는 절 — ref로 한 번만 남아야 한다.
          {'book': 1, 'chapter': 8, 'verse': 8, 'text': 'He sent forth a dove.'},
        ]
      },
    ];

CardSource src({
  String id = 'x',
  String include = '.',
  String exclude = '',
  List<dynamic> books = const [],
}) =>
    CardSource.fromJson({
      'id': id,
      'name': '이름',
      'name_en': 'Name',
      'kind': 'animal',
      'description': '설명.',
      'description_en': 'Desc.',
      'include': include,
      'exclude': exclude,
      'books': books,
    });

void main() {
  group('collectVerses', () {
    test('sections 경로와 items 경로를 모두 모은다', () {
      final v = collectVerses(fakeCourses());
      expect(v.map((e) => e.ref), containsAll(['1:8:8', '1:8:9', '66:13:1']));
    });

    test('중복 절은 한 번만 남는다', () {
      final v = collectVerses(fakeCourses());
      expect(v.where((e) => e.ref == '1:8:8').length, 1);
    });

    test('정경 순서로 정렬된다', () {
      final v = collectVerses(fakeCourses());
      expect(v.map((e) => e.ref).toList(), ['1:8:8', '1:8:9', '66:13:1']);
    });
  });

  group('resolveBooks', () {
    test('빈 목록은 제한 없음이다', () {
      expect(resolveBooks(const []), isEmpty);
    });

    test('숫자를 그대로 받는다', () {
      expect(resolveBooks(const [66]), {66});
    });

    test('NT는 40~66으로 풀린다', () {
      final nt = resolveBooks(const ['NT']);
      expect(nt.length, 27);
      expect(nt.contains(40), isTrue);
      expect(nt.contains(66), isTrue);
      expect(nt.contains(39), isFalse);
    });

    test('OT는 1~39로 풀린다', () {
      final ot = resolveBooks(const ['OT']);
      expect(ot.length, 39);
      expect(ot.contains(1), isTrue);
      expect(ot.contains(40), isFalse);
    });
  });

  group('matchRefs', () {
    test('include에 걸리는 절을 대소문자 무시하고 찾는다', () {
      final refs = matchRefs(collectVerses(fakeCourses()), src(include: r'\bDOVE\b'));
      expect(refs, ['1:8:8', '1:8:9']);
    });

    test('exclude에 걸리는 절은 버린다', () {
      final refs = matchRefs(
        collectVerses(fakeCourses()),
        src(include: r'\bdove\b', exclude: r'no rest'),
      );
      expect(refs, ['1:8:8']);
    });

    test('빈 exclude는 아무것도 버리지 않는다', () {
      final refs = matchRefs(collectVerses(fakeCourses()), src(include: r'\bdove\b'));
      expect(refs.length, 2);
    });

    test('books로 범위를 좁힌다', () {
      final refs = matchRefs(
        collectVerses(fakeCourses()),
        src(include: r'\b\w+\b', books: const [66]),
      );
      expect(refs, ['66:13:1']);
    });

    test('절 수에 상한을 두지 않는다', () {
      // 모든 절에 걸리는 패턴 — 3절 전부가 나와야 한다(잘리지 않는다).
      final refs = matchRefs(collectVerses(fakeCourses()), src(include: r'\.'));
      expect(refs.length, 3);
    });

    test('결과는 정경 순서를 유지한다', () {
      final refs = matchRefs(collectVerses(fakeCourses()), src(include: r'\.'));
      expect(refs, ['1:8:8', '1:8:9', '66:13:1']);
    });
  });

  group('buildCard', () {
    test('cards.json 스키마대로 만든다', () {
      final card = buildCard(src(id: 'dove'), const ['1:8:8']);
      expect(card['id'], 'dove');
      expect(card['name'], '이름');
      expect(card['name_en'], 'Name');
      expect(card['kind'], 'animal');
      expect(card['description'], '설명.');
      expect(card['description_en'], 'Desc.');
      expect(card['verses'], const ['1:8:8']);
    });

    test('image는 빈 문자열로 둔다 — 아트는 나중에 끼운다', () {
      expect(buildCard(src(), const ['1:8:8'])['image'], '');
    });

    test('include·exclude·books는 산출물에 새어 나가지 않는다', () {
      final card = buildCard(src(), const ['1:8:8']);
      expect(card.containsKey('include'), isFalse);
      expect(card.containsKey('exclude'), isFalse);
      expect(card.containsKey('books'), isFalse);
    });
  });

  group('mergeCatalog', () {
    List<Map<String, dynamic>> existing() => [
          {'id': 'dove', 'name': '비둘기', 'verses': const ['1:8:8']},
          {'id': 'ark', 'name': '방주', 'verses': const ['1:6:14']},
        ];

    test('sources에 없는 기존 카드의 verses는 그대로 남는다', () {
      final out = mergeCatalog(existing(), [
        {'id': 'fig', 'name': '무화과', 'verses': const ['40:21:19']},
      ]);
      final dove = out.firstWhere((c) => c['id'] == 'dove');
      expect(dove['verses'], const ['1:8:8']);
    });

    test('기존 카드가 먼저, 생성된 카드가 뒤에 온다', () {
      final out = mergeCatalog(existing(), [
        {'id': 'fig', 'name': '무화과', 'verses': const ['40:21:19']},
      ]);
      expect(out.map((c) => c['id']).toList(), ['dove', 'ark', 'fig']);
    });

    test('같은 id가 있으면 생성된 것으로 갈아끼우고 자리는 지킨다', () {
      final out = mergeCatalog(existing(), [
        {'id': 'ark', 'name': '방주', 'verses': const ['1:6:14', '1:6:15']},
      ]);
      expect(out.map((c) => c['id']).toList(), ['dove', 'ark']);
      expect(out[1]['verses'], const ['1:6:14', '1:6:15']);
    });

    test('생성 목록이 비면 기존 카탈로그가 그대로다', () {
      expect(mergeCatalog(existing(), const []), existing());
    });
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `flutter test test/card_generator_test.dart`
Expected: FAIL. `tool/cards/card_generator.dart`가 없어 import 해결에 실패한다.

- [ ] **Step 3: 최소 구현을 넣는다**

`tool/cards/card_generator.dart`를 새로 만든다. Flutter에 의존하지 않는 순수 Dart다.

```dart
/// 카드 카탈로그 생성기의 순수 로직. 파일 입출력은 generate.dart가 맡는다.
///
/// 설계: docs/superpowers/specs/2026-07-30-card-catalog-expansion-design.md
/// 관련 절은 자르지 않는다 — 등급이 도달 불가능해지는 문제는 앱의 판정 분모에서 푼다.

/// 성경 한 절. courses.json에서 뽑아낸다.
class BibleVerse {
  const BibleVerse(this.book, this.chapter, this.verse, this.text);

  final int book;
  final int chapter;
  final int verse;
  final String text;

  String get ref => '$book:$chapter:$verse';
}

/// sources.json 한 항목. 사람이 손으로 고치는 입력이다.
class CardSource {
  const CardSource({
    required this.id,
    required this.name,
    required this.nameEn,
    required this.kind,
    required this.description,
    required this.descriptionEn,
    required this.include,
    required this.exclude,
    required this.books,
  });

  final String id;
  final String name;
  final String nameEn;
  final String kind;
  final String description;
  final String descriptionEn;

  /// 절 본문에서 찾을 정규식. 대소문자는 무시한다.
  final String include;

  /// 걸리면 버릴 정규식. 비어 있으면 아무것도 버리지 않는다.
  final String exclude;

  /// 책 번호(1~66) 또는 'NT'·'OT' 축약. 비어 있으면 전 범위다.
  final List<dynamic> books;

  factory CardSource.fromJson(Map<String, dynamic> json) => CardSource(
        id: json['id'] as String,
        name: json['name'] as String,
        nameEn: json['name_en'] as String? ?? '',
        kind: json['kind'] as String? ?? 'animal',
        description: json['description'] as String? ?? '',
        descriptionEn: json['description_en'] as String? ?? '',
        include: json['include'] as String,
        exclude: json['exclude'] as String? ?? '',
        books: json['books'] as List<dynamic>? ?? const [],
      );
}

/// courses.json에서 절을 모은다. 68개 코스는 sections 아래에, 2개는 items에 직접 담겨 있다.
/// 같은 절이 여러 코스에 중복 존재하므로 ref로 중복을 제거하고 정경 순서로 정렬한다.
List<BibleVerse> collectVerses(List<dynamic> courses) {
  final byRef = <String, BibleVerse>{};

  void take(dynamic rawItem) {
    final item = rawItem as Map<String, dynamic>;
    final v = BibleVerse(
      item['book'] as int,
      item['chapter'] as int,
      item['verse'] as int,
      item['text'] as String? ?? '',
    );
    byRef.putIfAbsent(v.ref, () => v);
  }

  for (final rawCourse in courses) {
    final course = rawCourse as Map<String, dynamic>;
    for (final rawSection in course['sections'] as List<dynamic>? ?? const []) {
      final section = rawSection as Map<String, dynamic>;
      for (final item in section['items'] as List<dynamic>? ?? const []) {
        take(item);
      }
    }
    for (final item in course['items'] as List<dynamic>? ?? const []) {
      take(item);
    }
  }

  final out = byRef.values.toList()
    ..sort((a, b) {
      if (a.book != b.book) return a.book.compareTo(b.book);
      if (a.chapter != b.chapter) return a.chapter.compareTo(b.chapter);
      return a.verse.compareTo(b.verse);
    });
  return out;
}

/// 책 번호 집합. 빈 Set은 "제한 없음"을 뜻한다.
/// 이름 대신 번호를 쓰는 이유는 courses.json에 책 이름이 없기 때문이다.
Set<int> resolveBooks(List<dynamic> books) {
  final out = <int>{};
  for (final b in books) {
    if (b is int) {
      out.add(b);
    } else if (b == 'NT') {
      for (var i = 40; i <= 66; i++) {
        out.add(i);
      }
    } else if (b == 'OT') {
      for (var i = 1; i <= 39; i++) {
        out.add(i);
      }
    } else {
      throw ArgumentError('books 항목은 책 번호(1~66) 또는 NT·OT여야 한다: $b');
    }
  }
  return out;
}

/// 카드 하나의 관련 절 ref 목록. 정경 순서를 유지하고 개수를 자르지 않는다.
List<String> matchRefs(List<BibleVerse> bible, CardSource src) {
  final include = RegExp(src.include, caseSensitive: false);
  final exclude =
      src.exclude.isEmpty ? null : RegExp(src.exclude, caseSensitive: false);
  final books = resolveBooks(src.books);

  final out = <String>[];
  for (final v in bible) {
    if (books.isNotEmpty && !books.contains(v.book)) continue;
    if (!include.hasMatch(v.text)) continue;
    if (exclude != null && exclude.hasMatch(v.text)) continue;
    out.add(v.ref);
  }
  return out;
}

/// cards.json에 들어갈 항목. 검색 규칙(include·exclude·books)은 산출물에 남기지 않는다.
Map<String, dynamic> buildCard(CardSource src, List<String> refs) => {
      'id': src.id,
      'name': src.name,
      'name_en': src.nameEn,
      'kind': src.kind,
      'description': src.description,
      'description_en': src.descriptionEn,
      'image': '',
      'verses': refs,
    };

/// 생성 결과를 기존 카탈로그에 병합한다.
/// sources.json에 없는 카드(기존 6장)는 손대지 않는다 — 절 목록이 바뀌면 사용자 등급이 내려간다.
List<Map<String, dynamic>> mergeCatalog(
  List<Map<String, dynamic>> existing,
  List<Map<String, dynamic>> generated,
) {
  final byId = {for (final c in generated) c['id'] as String: c};
  final out = <Map<String, dynamic>>[];
  final used = <String>{};

  for (final c in existing) {
    final id = c['id'] as String;
    final replacement = byId[id];
    if (replacement != null) {
      out.add(replacement);
      used.add(id);
    } else {
      out.add(c);
    }
  }
  for (final c in generated) {
    if (!used.contains(c['id'] as String)) out.add(c);
  }
  return out;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `flutter test test/card_generator_test.dart`
Expected: PASS (20개 통과).

- [ ] **Step 5: 커밋한다**

```bash
git add tool/cards/card_generator.dart test/card_generator_test.dart
git commit -m "feat: 카드 카탈로그 생성기의 순수 로직

courses.json 본문을 정규식으로 훑어 관련 절 ref를 뽑는다.
절 수는 자르지 않고, sources.json에 없는 기존 카드는 병합에서 보존한다."
```

---

### Task 4: 생성기 CLI와 카드 23장 생성

**Files:**
- Create: `tool/cards/generate.dart`
- Create: `tool/cards/sources.json`
- Modify: `assets/cards/cards.json` (생성 산출물)
- Test: `test/cards_catalog_integrity_test.dart` (검증 보강)

**Interfaces:**
- Consumes: Task 3의 `collectVerses`, `CardSource.fromJson`, `matchRefs`, `buildCard`, `mergeCatalog`
- Produces: `assets/cards/cards.json`에 카드 29장(기존 6 + 신규 23). Task 5가 이 파일의 기존 6장 설명을 채운다.

- [ ] **Step 1: `sources.json`을 쓴다**

`tool/cards/sources.json`을 새로 만든다. 설명 문구는 Task 5에서 채우므로 여기서는 빈 문자열로 둔다.

**`beast`와 `dragon`의 관련 절은 일부 겹친다.** 요한계시록에는 "the dragon gave him his power... and the beast"처럼 용과 짐승이 같은 절에 함께 등장하는 곳이 있다. 이건 버그가 아니라 의도한 동작이다 — 한 절이 여러 카드의 등급을 동시에 올릴 수 있다는 등급 스펙 §5 그대로다. `exclude`로 이 겹침을 없애려 하지 않는다.

```json
[
  { "id": "shepherd", "name": "목자", "name_en": "The Shepherd", "kind": "figure",
    "description": "", "description_en": "",
    "include": "\\bshepherds?\\b", "exclude": "", "books": [] },

  { "id": "net", "name": "그물", "name_en": "The Net", "kind": "figure",
    "description": "", "description_en": "",
    "include": "\\bnets?\\b", "exclude": "", "books": [] },

  { "id": "chain", "name": "사슬", "name_en": "The Chain", "kind": "figure",
    "description": "", "description_en": "",
    "include": "\\bchains?\\b", "exclude": "", "books": [] },

  { "id": "ointment", "name": "향유", "name_en": "The Ointment", "kind": "figure",
    "description": "", "description_en": "",
    "include": "\\bointment\\b|spikenard", "exclude": "", "books": [] },

  { "id": "cross", "name": "십자가", "name_en": "The Cross", "kind": "figure",
    "description": "", "description_en": "",
    "include": "\\bcross\\b", "exclude": "", "books": [] },

  { "id": "thirty-silver", "name": "은 삼십", "name_en": "Thirty Pieces", "kind": "figure",
    "description": "", "description_en": "",
    "include": "pieces of silver", "exclude": "", "books": [] },

  { "id": "keys", "name": "열쇠", "name_en": "The Keys", "kind": "figure",
    "description": "", "description_en": "",
    "include": "\\bkeys?\\b", "exclude": "", "books": [] },

  { "id": "lamb", "name": "어린양", "name_en": "The Lamb", "kind": "animal",
    "description": "", "description_en": "",
    "include": "\\blambs?\\b", "exclude": "", "books": [] },

  { "id": "donkey", "name": "나귀", "name_en": "The Donkey", "kind": "animal",
    "description": "", "description_en": "",
    "include": "\\bass\\b|\\basses\\b|\\bcolts?\\b", "exclude": "", "books": [] },

  { "id": "camel", "name": "낙타", "name_en": "The Camel", "kind": "animal",
    "description": "", "description_en": "",
    "include": "\\bcamels?\\b", "exclude": "", "books": [] },

  { "id": "serpent", "name": "뱀", "name_en": "The Serpent", "kind": "animal",
    "description": "", "description_en": "",
    "include": "\\bserpents?\\b", "exclude": "", "books": [] },

  { "id": "vine", "name": "포도나무", "name_en": "The Vine", "kind": "plant",
    "description": "", "description_en": "",
    "include": "\\bvines?\\b", "exclude": "", "books": [] },

  { "id": "fig", "name": "무화과", "name_en": "The Fig", "kind": "plant",
    "description": "", "description_en": "",
    "include": "\\bfigs?\\b", "exclude": "", "books": [] },

  { "id": "thorn", "name": "가시", "name_en": "Thorns", "kind": "plant",
    "description": "", "description_en": "",
    "include": "\\bthorns?\\b", "exclude": "", "books": [] },

  { "id": "mustard", "name": "겨자씨", "name_en": "The Mustard Seed", "kind": "plant",
    "description": "", "description_en": "",
    "include": "mustard", "exclude": "", "books": [] },

  { "id": "dragon", "name": "용", "name_en": "The Dragon", "kind": "creature",
    "description": "", "description_en": "",
    "include": "\\bdragons?\\b", "exclude": "", "books": [] },

  { "id": "beast", "name": "짐승", "name_en": "The Beast", "kind": "creature",
    "description": "", "description_en": "",
    "include": "\\bbeast\\b", "exclude": "", "books": [66] },

  { "id": "earth", "name": "지구", "name_en": "The Earth", "kind": "place",
    "description": "", "description_en": "",
    "include": "\\bearth\\b", "exclude": "", "books": [] },

  { "id": "jerusalem", "name": "예루살렘", "name_en": "Jerusalem", "kind": "place",
    "description": "", "description_en": "",
    "include": "jerusalem", "exclude": "", "books": [] },

  { "id": "galilee", "name": "갈릴리", "name_en": "Galilee", "kind": "place",
    "description": "", "description_en": "",
    "include": "galilee", "exclude": "", "books": [] },

  { "id": "bread", "name": "떡", "name_en": "The Bread", "kind": "object",
    "description": "", "description_en": "",
    "include": "\\bbread\\b", "exclude": "", "books": [] },

  { "id": "cup", "name": "잔", "name_en": "The Cup", "kind": "object",
    "description": "", "description_en": "",
    "include": "\\bcups?\\b", "exclude": "", "books": [] },

  { "id": "ivory", "name": "상아", "name_en": "Ivory", "kind": "object",
    "description": "", "description_en": "",
    "include": "\\bivory\\b", "exclude": "", "books": [] }
]
```

- [ ] **Step 2: CLI를 쓴다**

`tool/cards/generate.dart`를 새로 만든다.

```dart
import 'dart:convert';
import 'dart:io';

import 'card_generator.dart';

/// sources.json의 검색 규칙으로 cards.json의 verses를 채운다.
///
///   dart run tool/cards/generate.dart
///
/// cards.json은 산출물이다 — 손으로 고치지 말고 이 스크립트를 다시 돌린다.
/// 다만 sources.json에 없는 카드(기존 6장)는 손으로 적힌 그대로 보존된다.
void main() {
  const sourcesPath = 'tool/cards/sources.json';
  const coursesPath = 'assets/courses/courses.json';
  const cardsPath = 'assets/cards/cards.json';

  final courses = jsonDecode(File(coursesPath).readAsStringSync()) as List<dynamic>;
  final bible = collectVerses(courses);
  stdout.writeln('성경 절 ${bible.length}개를 읽었다.');

  final rawSources = jsonDecode(File(sourcesPath).readAsStringSync()) as List<dynamic>;
  final sources = [
    for (final s in rawSources) CardSource.fromJson(s as Map<String, dynamic>)
  ];

  final generated = <Map<String, dynamic>>[];
  final tooFew = <String>[];
  for (final src in sources) {
    final refs = matchRefs(bible, src);
    // 관련 절이 4개 미만이면 중간 등급이 건너뛰어진다(설계 §5).
    if (refs.length < 4) {
      tooFew.add('${src.id}(${refs.length}절)');
      continue;
    }
    generated.add(buildCard(src, refs));
    stdout.writeln('  ${src.id.padRight(16)} ${refs.length}절');
  }

  if (tooFew.isNotEmpty) {
    stderr.writeln('관련 절이 4개 미만이라 건너뛴 카드: ${tooFew.join(', ')}');
    exitCode = 1;
    return;
  }

  final existing =
      (jsonDecode(File(cardsPath).readAsStringSync()) as List<dynamic>)
          .cast<Map<String, dynamic>>();
  final merged = mergeCatalog(existing, generated);

  File(cardsPath)
      .writeAsStringSync('${const JsonEncoder.withIndent('  ').convert(merged)}\n');
  stdout.writeln('카드 ${merged.length}장을 $cardsPath에 썼다.');
}
```

- [ ] **Step 3: 생성기를 돌린다**

Run: `dart run tool/cards/generate.dart`
Expected: 다음과 같은 출력. 절 수는 정규식에 따라 몇 개 차이 날 수 있다.

```
성경 절 31102개를 읽었다.
  shepherd         74절
  net              50절
  ...
  ivory            13절
카드 29장을 assets/cards/cards.json에 썼다.
```

**확인할 것:** 카드가 **29장**이어야 한다(기존 6 + 신규 23). 어느 카드도 4절 미만으로 걸러지지 않아야 한다. 걸러진 카드가 있으면 그 카드의 `include`를 넓히거나 `sources.json`에서 뺀다.

**절 수는 브레인스토밍 때 KJV 원문 기준으로 어림잡은 값이고, 실제 절 수는 `courses.json` 기준이다.** 둘 다 같은 KJV 본문이라 대체로 일치해야 하지만 정확히 맞아떨어질 필요는 없다 — 표에 적힌 숫자(74, 50, 13...)는 목표치가 아니라 "이 정도 규모여야 한다"는 감이다. 실제로 크게 벗어나면(예: 예상의 절반 이하이거나 두 배 이상) 다음을 의심한다.

- **`donkey`(나귀)가 특히 갈릴 만하다.** `\bass\b|\basses\b|\bcolts?\b` 패턴이 KJV 표기 변형(`asses'`, `ass's`처럼 소유격이 붙은 형태)을 놓칠 수 있다. 실제 절 수가 100 밑으로 크게 떨어지면 이 패턴부터 넓혀본다.
- 그 외 카드가 예상과 크게 다르면, 패턴이 잘못됐다고 단정하기 전에 먼저 `matchRefs`가 뽑은 절 본문을 몇 개 눈으로 읽어 오탐·누락 여부를 확인한다(§5의 곰·우물·방주 사례처럼).

- [ ] **Step 4: 기존 6장이 안 바뀌었는지 확인한다**

Run: `git diff --stat assets/cards/cards.json`
그다음 아래로 기존 6장의 절 목록이 그대로인지 본다.

```bash
git show HEAD:assets/cards/cards.json | python3 -c "
import json,sys
old={c['id']:c['verses'] for c in json.load(sys.stdin)}
new={c['id']:c['verses'] for c in json.load(open('assets/cards/cards.json'))}
for cid in ['dove','ark','staff','sling','lion','great-fish']:
    same = old[cid]==new[cid]
    print(('OK  ' if same else 'BAD ')+cid, len(new[cid]),'절')
"
```
Expected: 여섯 줄 모두 `OK`. 하나라도 `BAD`면 `mergeCatalog`가 잘못됐거나 그 id가 `sources.json`에 들어갔다는 뜻이다.

- [ ] **Step 5: 두 번 돌려도 같은 결과인지 확인한다**

생성기가 결정적이어야 한다(설계 §8). 산출물이 커밋되는 파일이므로, 돌릴 때마다 diff가 흔들리면 리뷰가 불가능해진다.

```bash
md5 -q assets/cards/cards.json > /tmp/cards-run1.md5
dart run tool/cards/generate.dart > /dev/null
md5 -q assets/cards/cards.json > /tmp/cards-run2.md5
diff /tmp/cards-run1.md5 /tmp/cards-run2.md5 && echo "결정적이다"
```
Expected: `결정적이다`. 차이가 나면 `collectVerses`의 정렬이나 `matchRefs`의 순회 순서가 불안정하다는 뜻이다.

- [ ] **Step 6: 동결 보장 테스트를 추가한다**

`test/cards_catalog_integrity_test.dart` 파일 끝, 마지막 `}` 앞에 테스트를 추가한다.

```dart
  test('기존 6장은 sources.json에 없어서 생성기가 덮어쓰지 않는다', () {
    final sources =
        jsonDecode(File('tool/cards/sources.json').readAsStringSync()) as List<dynamic>;
    final sourceIds = {
      for (final s in sources) (s as Map<String, dynamic>)['id'] as String
    };

    // 이 여섯 장의 절 목록이 늘어나면 이미 레전드인 사용자가 브론즈로 떨어진다.
    const frozen = ['dove', 'ark', 'staff', 'sling', 'lion', 'great-fish'];
    for (final id in frozen) {
      expect(sourceIds.contains(id), isFalse,
          reason: '$id을(를) sources.json에 넣으면 기존 사용자의 등급이 내려간다');
    }
  });

  test('카탈로그에 카드 29장이 있고 id가 겹치지 않는다', () {
    final cards =
        jsonDecode(File('assets/cards/cards.json').readAsStringSync()) as List<dynamic>;
    final ids = [
      for (final c in cards) (c as Map<String, dynamic>)['id'] as String
    ];
    expect(ids.length, 29);
    expect(ids.toSet().length, 29, reason: 'id가 중복되면 등급 기록이 섞인다');
  });

  test('모든 카드의 kind가 아는 여섯 갈래 안에 있다', () {
    const known = {'animal', 'figure', 'plant', 'creature', 'place', 'object'};
    final cards =
        jsonDecode(File('assets/cards/cards.json').readAsStringSync()) as List<dynamic>;
    for (final raw in cards) {
      final c = raw as Map<String, dynamic>;
      expect(known.contains(c['kind']), isTrue, reason: '${c['id']}: ${c['kind']}');
    }
  });
```

- [ ] **Step 7: 전체 테스트를 돌린다**

Run: `flutter test`
Expected: PASS. 특히 `cards_catalog_integrity_test.dart`가 통과해야 한다 — 생성된 ref가 전부 courses.json의 절로 해석되고, 카드마다 절이 4개 이상이라는 뜻이다.

- [ ] **Step 8: 커밋한다**

```bash
git add tool/cards/generate.dart tool/cards/sources.json assets/cards/cards.json test/cards_catalog_integrity_test.dart
git commit -m "feat: 카드 23장 추가 — 생성기로 관련 절 매핑

sources.json의 정규식으로 courses.json 본문을 훑어 cards.json을 만든다.
기존 6장은 sources.json에 넣지 않아 절 목록이 보존된다."
```

---

### Task 5: 카드 설명 문구

**Files:**
- Modify: `tool/cards/sources.json` (신규 23장의 `description`·`description_en`)
- Modify: `assets/cards/cards.json` (재생성 + 기존 6장 설명 직접 입력)
- Test: `test/cards_catalog_integrity_test.dart` (설명 존재 검증)

**Interfaces:**
- Consumes: Task 4의 `tool/cards/generate.dart`, `tool/cards/sources.json`
- Produces: 없음(마지막 태스크)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/cards_catalog_integrity_test.dart` 파일 끝, 마지막 `}` 앞에 추가한다.

```dart
  test('모든 카드에 한국어·영어 설명이 있다', () {
    final cards =
        jsonDecode(File('assets/cards/cards.json').readAsStringSync()) as List<dynamic>;
    final missing = <String>[];
    for (final raw in cards) {
      final c = raw as Map<String, dynamic>;
      final ko = c['description'] as String? ?? '';
      final en = c['description_en'] as String? ?? '';
      if (ko.isEmpty || en.isEmpty) missing.add(c['id'] as String);
    }
    expect(missing, isEmpty, reason: '설명이 비면 상세 화면에 이름과 등급만 남는다');
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `flutter test test/cards_catalog_integrity_test.dart`
Expected: FAIL. 29장 전부 설명이 비어 있어 `missing`에 29개 id가 담긴다.

- [ ] **Step 3: `sources.json`의 설명을 채운다**

`tool/cards/sources.json`에서 각 항목의 `description`·`description_en`을 아래 값으로 바꾼다. 한 카드당 한 문장이고, 기존 카탈로그의 톤("홍수가 끝났음을 알린 새.")을 따른다.

| id | `description` | `description_en` |
|---|---|---|
| shepherd | 양 떼를 지키러 온 이의 자리. | The place of the one who came to guard the flock. |
| net | 부르심 앞에 버려두고 떠난 것. | What they left behind when they were called. |
| chain | 묶여서도 전한 이의 표. | The mark of one who preached in bonds. |
| ointment | 아끼지 않고 부어진 것. | Poured out without holding back. |
| cross | 지고 따르라 하신 것. | What he told them to take up and follow. |
| thirty-silver | 값으로 매겨진 배신. | The price that was put on betrayal. |
| keys | 열고 닫으라 맡겨진 것. | Entrusted to open and to shut. |
| lamb | 대신 죽으러 끌려간 것. | Led away to die in another's place. |
| donkey | 왕이 낮게 올라탄 짐승. | The beast a king rode in lowly. |
| camel | 바늘귀를 지나야 했던 짐승. | The beast that had to pass a needle's eye. |
| serpent | 동산에서부터 있던 것. | There since the garden. |
| vine | 가지가 붙어 있어야 사는 나무. | The tree whose branches must abide. |
| fig | 열매가 없어 저주받은 나무. | The tree cursed for bearing nothing. |
| thorn | 말씀을 덮어 숨 막히게 하는 것. | What springs up and chokes the word. |
| mustard | 가장 작으나 가장 크게 자라는 것. | The least seed that grows the greatest. |
| dragon | 옛 뱀이라 불린 것. | Called that old serpent. |
| beast | 마지막 때에 올라온 것. | What rose up at the end of days. |
| earth | 처음에 지어진 것. | Made in the beginning. |
| jerusalem | 오르내림이 그치지 않던 성. | The city they never stopped going up to. |
| galilee | 부르심이 시작된 물가. | The shore where the calling began. |
| bread | 떼어 나누어도 남던 것. | Broken, shared, and still left over. |
| cup | 지나가기를 구하신 것. | What he asked might pass. |
| ivory | 왕의 집을 꾸미던 사치. | The luxury that adorned kings' houses. |

- [ ] **Step 4: 생성기를 다시 돌린다**

Run: `dart run tool/cards/generate.dart`
Expected: 카드 29장을 다시 쓴다. 절 수는 Task 4와 같아야 한다 — 설명만 바꿨으므로 `verses`가 달라지면 뭔가 잘못된 것이다.

- [ ] **Step 5: 기존 6장의 설명을 직접 채운다**

기존 6장은 `sources.json`에 없으므로 생성기가 손대지 않는다. `assets/cards/cards.json`에서 해당 항목의 `description`·`description_en`을 직접 고친다. **`verses`는 건드리지 않는다.**

| id | `description` | `description_en` |
|---|---|---|
| dove | 홍수가 끝났음을 알린 새. | The bird that announced the flood had ended. |
| ark | 물 위에 떠서 살아남은 집. | The house that floated and survived. |
| staff | 바다를 가른 막대기. | The rod that split the sea. |
| sling | 거인을 쓰러뜨린 작은 것. | The small thing that felled a giant. |
| lion | 굴 속에서 입이 막힌 짐승. | The beast whose mouth was shut in the den. |
| great-fish | 사흘을 품었다 뱉어낸 것. | It held him three days, then gave him up. |

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `flutter test test/cards_catalog_integrity_test.dart`
Expected: PASS.

- [ ] **Step 7: 기존 6장의 절이 여전히 그대로인지 확인한다**

```bash
git show HEAD:assets/cards/cards.json | python3 -c "
import json,sys
old={c['id']:c['verses'] for c in json.load(sys.stdin)}
new={c['id']:c['verses'] for c in json.load(open('assets/cards/cards.json'))}
for cid in ['dove','ark','staff','sling','lion','great-fish']:
    print(('OK  ' if old[cid]==new[cid] else 'BAD ')+cid)
"
```
Expected: 여섯 줄 모두 `OK`.

- [ ] **Step 8: 전체 테스트를 돌린다**

Run: `flutter test`
Expected: PASS.

- [ ] **Step 9: 앱에서 도감을 눈으로 확인한다**

Run: `flutter run`
확인할 것: 카드 탭에서 등급이 붙은 카드들이 갈래별 색으로 구분되어 보이고, 카드를 눌렀을 때 상세에 설명이 뜬다. 관련 절 목록이나 진행 숫자는 **보이지 않아야 한다**(등급 스펙 §6).

- [ ] **Step 10: 커밋한다**

```bash
git add tool/cards/sources.json assets/cards/cards.json test/cards_catalog_integrity_test.dart
git commit -m "feat: 카드 29장의 설명 문구를 채운다

신규 23장은 sources.json에, 동결된 기존 6장은 cards.json에 직접 적었다."
```

---

## 남겨두는 것

설계 문서 §9(2차 범위)의 항목들은 이 계획에 없다. 카드 주제 추가, 기존 6장 이관과 그때 생기는 등급 하락 처리, 도감 화면의 갈래별 그룹핑, 카드 아트가 여기 해당한다.

`image`는 29장 모두 빈 문자열로 남는다. 타일은 이름 첫 글자와 갈래 색으로 렌더된다.

## 서브에이전트 실행 시 유의사항

**Task 5 Step 9(`flutter run`으로 도감을 눈으로 확인)는 자동화할 수 없다.** 서브에이전트가 시뮬레이터·에뮬레이터에 접근하지 못하면 이 스텝은 건너뛰고, 사람이 최종 확인하는 것으로 남긴다. 나머지 스텝(테스트 실행, 파일 생성, 커밋)은 서브에이전트가 그대로 수행할 수 있다.

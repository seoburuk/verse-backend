# 카드 등급(브론즈~레전드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드 해금을 "섹션 완주"에서 "주제 관련 절을 얼마나 외웠는가"로 바꾸고, 브론즈·실버·골드·레전드 4등급을 붙여 등급이 오를 때마다 암송 결과 화면에서 뒤집어 공개한다.

**Architecture:** 카탈로그의 `unlock: {courseSlug, sectionOrd}`을 `verses: ["책:장:절", ...]`로 교체한다. 등급은 `외운 관련 절 수 ÷ 관련 절 수`를 순수 함수로 판정하고(임계값은 `assets/cards/tiers.json`), 판정 데이터는 기존 `CourseItems ⋈ Progress` 파생 그대로다. 축하 중복 방지 기록을 "카드 id"에서 "카드 id + 등급"으로 올려, 등급이 오를 때마다 다시 뒤집을 수 있게 한다.

**Tech Stack:** Flutter, Riverpod, drift(기존 테이블 재사용), rootBundle JSON, flutter gen-l10n, flutter_test.

## Global Constraints

- 작업 디렉토리: `verse-flutter/`. 모든 경로는 이 기준.
- **새 drift 테이블을 만들지 않는다.** 등급은 `CourseItems`+`Progress` 파생, 공개 기록은 `SyncMeta`(via `AppSettingsRepository`) 재사용.
- **카드 목록·설명·관련 절을 Dart 코드에 하드코딩하지 않는다.** 전부 `assets/cards/cards.json`.
- **등급 임계값도 코드에 하드코딩하지 않는다.** `assets/cards/tiers.json`에 둔다. 단 브론즈("1개 이상")와 레전드("전부")는 비율이 아니라 규칙이므로 코드에 남는다.
- **카드 설명 문구를 새로 쓰지 않는다.** `description` / `description_en`은 빈 문자열로 두고 사용자가 나중에 채운다.
- **상세 화면에 관련 절 목록·외운 표시·진행 숫자("3/5")를 두지 않는다.** 상세는 그림·이름·설명·등급 넷뿐이다.
- **전체 수집 카운터("23/40")·잠긴 카드 표시를 만들지 않는다.** 기존 도감 원칙 유지.
- **가챠·재화·중복 교환을 만들지 않는다.**
- 새 문자열은 `lib/l10n/app_ko.arb`(템플릿) + `lib/l10n/app_en.arb`에 추가하고 `flutter gen-l10n` 재생성. 하드코딩 금지.
- 카드 아트는 이 계획에서 만들지 않는다. `image`가 비면 기존 플레이스홀더 타일 렌더 그대로.

## File Structure

- Create: `lib/core/cards/verse_ref.dart` — `"책:장:절"` 파싱 + 값 객체.
- Create: `lib/core/cards/card_tier.dart` — 등급 enum, 임계값 모델·로더, 등급 판정 순수 함수.
- Create: `lib/core/cards/card_status.dart` — 카드 + 현재 등급 묶음(리포지토리 출력 타입).
- Create: `assets/cards/tiers.json` — 중간 등급 임계값.
- Modify: `assets/cards/cards.json` — `unlock` → `verses`, 설명 비우기.
- Modify: `lib/core/cards/card_def.dart` — `unlock*` 필드 제거, `verses` 추가.
- Modify: `lib/core/cards/card_repository.dart` — 섹션 판정 제거, 교집합 등급 판정 + 등급별 공개 기록.
- Modify: `lib/core/settings/app_settings_repository.dart` — 등급 포함 공개 기록 키.
- Modify: `lib/app/providers.dart` — 임계값 프로바이더, `unlockedCardsProvider` 타입 변경, `sectionCardProvider` 제거.
- Modify: `lib/features/cards/card_tile.dart` — 등급 테두리 + 등급 이름.
- Modify: `lib/features/cards/card_detail_sheet.dart` — 등급 표시.
- Modify: `lib/features/cards/card_flip.dart` — `CardStatus`를 받도록.
- Modify: `lib/features/cards/card_collection_screen.dart` — `CardStatus` 목록 사용.
- Modify: `lib/features/memorize/memorize_screen.dart` — 등급 상승 감지 + 결과 화면 뒤집기.
- Modify: `lib/features/courses/section_complete_screen.dart` — 기존 뒤집기 블록 제거.
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`.

---

### Task 1: 절 참조 + 카탈로그 스키마 교체

**Files:**
- Create: `lib/core/cards/verse_ref.dart`
- Modify: `lib/core/cards/card_def.dart`
- Modify: `assets/cards/cards.json`
- Test: `test/card_catalog_test.dart` (기존 파일 교체)
- Test: `test/cards_catalog_integrity_test.dart`

**Interfaces:**
- Produces:
  - `class VerseRef` — 필드 `int book, chapter, verse`. `const VerseRef(this.book, this.chapter, this.verse)`. `static VerseRef? parse(String raw)` — `"1:8:8"` 형태만 받고 그 외에는 `null`. `operator ==` / `hashCode` 구현(Set 키로 쓴다).
  - `CardDef` — `unlockCourseSlug` / `unlockSectionOrd` 제거, `final List<VerseRef> verses` 추가. `CardDef.fromJson`은 `verses` 배열에서 파싱 실패한 항목을 건너뛴다.
  - 기존 `cardNameFor` / `cardDescriptionFor`는 그대로 둔다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/card_catalog_test.dart` 전체를 아래로 교체한다:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/core/cards/verse_ref.dart';

void main() {
  group('VerseRef', () {
    test('"책:장:절" 문자열을 파싱한다', () {
      final r = VerseRef.parse('1:8:8')!;
      expect(r.book, 1);
      expect(r.chapter, 8);
      expect(r.verse, 8);
    });

    test('같은 값이면 같은 것으로 취급한다(Set 키로 쓴다)', () {
      expect(const VerseRef(1, 8, 8), const VerseRef(1, 8, 8));
      expect({const VerseRef(1, 8, 8), const VerseRef(1, 8, 8)}.length, 1);
    });

    test('형식이 틀리면 null이다', () {
      expect(VerseRef.parse('1:8'), isNull);
      expect(VerseRef.parse('창세기:8:8'), isNull);
      expect(VerseRef.parse(''), isNull);
      expect(VerseRef.parse('1:8:8:8'), isNull);
    });
  });

  group('CardDef', () {
    test('verses 배열을 파싱한다', () {
      final c = CardDef.fromJson({
        'id': 'dove',
        'name': '비둘기',
        'name_en': 'Dove',
        'kind': 'animal',
        'description': '',
        'description_en': '',
        'image': '',
        'verses': ['1:8:8', '1:8:9'],
      });

      expect(c.id, 'dove');
      expect(c.kind, 'animal');
      expect(c.verses, [const VerseRef(1, 8, 8), const VerseRef(1, 8, 9)]);
    });

    test('깨진 ref는 그 항목만 건너뛴다', () {
      final c = CardDef.fromJson({
        'id': 'x',
        'name': '이름',
        'verses': ['1:8:8', '엉망', '2:4:2'],
      });

      expect(c.verses, [const VerseRef(1, 8, 8), const VerseRef(2, 4, 2)]);
    });

    test('locale에 따라 이름·설명을 고른다', () {
      final c = CardDef.fromJson({
        'id': 'lion',
        'name': '사자',
        'name_en': 'Lion',
        'description': '굴의 맹수.',
        'description_en': 'Beast of the den.',
        'verses': <String>[],
      });

      expect(cardNameFor(c, 'ko'), '사자');
      expect(cardNameFor(c, 'en'), 'Lion');
      expect(cardDescriptionFor(c, 'ko'), '굴의 맹수.');
      expect(cardDescriptionFor(c, 'en'), 'Beast of the den.');
    });

    test('영문이 비어 있으면 한글로 폴백한다', () {
      final c = CardDef.fromJson({
        'id': 'x',
        'name': '이름',
        'name_en': '',
        'description': '설명',
        'verses': <String>[],
      });

      expect(cardNameFor(c, 'en'), '이름');
      expect(cardDescriptionFor(c, 'en'), '설명');
    });
  });
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_catalog_test.dart`
Expected: FAIL — `verse_ref.dart` 없음(compile error).

- [ ] **Step 3: VerseRef 구현**

`lib/core/cards/verse_ref.dart`:

```dart
/// 절 하나를 가리키는 값 객체. 카탈로그에는 "책번호:장:절" 문자열로 적는다
/// (손으로 고치고 diff로 읽기 쉬운 형태).
class VerseRef {
  const VerseRef(this.book, this.chapter, this.verse);

  final int book;
  final int chapter;
  final int verse;

  /// 형식이 어긋나면 null. 카탈로그는 사람이 손으로 고치는 파일이라
  /// 오타 하나로 앱이 죽지 않게 호출부에서 건너뛴다.
  static VerseRef? parse(String raw) {
    final parts = raw.split(':');
    if (parts.length != 3) return null;
    final book = int.tryParse(parts[0]);
    final chapter = int.tryParse(parts[1]);
    final verse = int.tryParse(parts[2]);
    if (book == null || chapter == null || verse == null) return null;
    return VerseRef(book, chapter, verse);
  }

  @override
  bool operator ==(Object other) =>
      other is VerseRef &&
      other.book == book &&
      other.chapter == chapter &&
      other.verse == verse;

  @override
  int get hashCode => Object.hash(book, chapter, verse);

  @override
  String toString() => '$book:$chapter:$verse';
}
```

- [ ] **Step 4: CardDef 교체**

`lib/core/cards/card_def.dart` 전체를 아래로 교체한다:

```dart
import 'verse_ref.dart';

/// 카드 1장의 정의. 실제 목록은 assets/cards/cards.json에 있고
/// 이 클래스는 그 한 항목을 담는다(카드는 계속 추가되므로 코드에 목록을 두지 않는다).
class CardDef {
  const CardDef({
    required this.id,
    required this.name,
    required this.nameEn,
    required this.kind,
    required this.description,
    required this.descriptionEn,
    required this.image,
    required this.verses,
  });

  final String id;
  final String name;
  final String nameEn;

  /// 'animal' | 'figure'(사람 대신 장비·상징물로 표현되는 인물)
  final String kind;
  final String description;
  final String descriptionEn;

  /// assets/cards/art/ 아래 파일명. 비어 있으면 플레이스홀더로 렌더한다.
  final String image;

  /// 이 카드의 주제와 관련된 절들. 몇 개를 외웠는지가 곧 등급이다.
  final List<VerseRef> verses;

  factory CardDef.fromJson(Map<String, dynamic> json) {
    final raw = (json['verses'] as List<dynamic>? ?? const []);
    final verses = <VerseRef>[];
    for (final item in raw) {
      final ref = VerseRef.parse('$item');
      // 오타 난 ref 하나로 레전드가 영영 막히면 안 되므로 그 항목만 건너뛴다.
      if (ref != null) verses.add(ref);
    }
    return CardDef(
      id: json['id'] as String,
      name: json['name'] as String,
      nameEn: json['name_en'] as String? ?? '',
      kind: json['kind'] as String? ?? 'animal',
      description: json['description'] as String? ?? '',
      descriptionEn: json['description_en'] as String? ?? '',
      image: json['image'] as String? ?? '',
      verses: verses,
    );
  }
}

String cardNameFor(CardDef c, String locale) =>
    locale == 'en' && c.nameEn.isNotEmpty ? c.nameEn : c.name;

String cardDescriptionFor(CardDef c, String locale) =>
    locale == 'en' && c.descriptionEn.isNotEmpty ? c.descriptionEn : c.description;
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `flutter test test/card_catalog_test.dart`
Expected: PASS

- [ ] **Step 6: 카탈로그 데이터 교체**

`assets/cards/cards.json` 전체를 아래로 교체한다. 설명은 **의도적으로 비워 둔다** — 사용자가 나중에 채운다. 관련 절은 로직 확인용 시작 세트이고 계속 수정될 데이터다.

```json
[
  {
    "id": "dove",
    "name": "비둘기",
    "name_en": "Dove",
    "kind": "animal",
    "description": "",
    "description_en": "",
    "image": "",
    "verses": ["1:8:8", "1:8:9", "1:8:10", "1:8:11", "1:8:12"]
  },
  {
    "id": "ark",
    "name": "방주",
    "name_en": "The Ark",
    "kind": "figure",
    "description": "",
    "description_en": "",
    "image": "",
    "verses": ["1:6:14", "1:6:15", "1:6:16", "1:7:1", "1:8:4"]
  },
  {
    "id": "staff",
    "name": "지팡이",
    "name_en": "The Staff",
    "kind": "figure",
    "description": "",
    "description_en": "",
    "image": "",
    "verses": ["2:4:2", "2:4:17", "2:7:10", "2:7:12", "2:7:20"]
  },
  {
    "id": "sling",
    "name": "물맷돌",
    "name_en": "The Sling",
    "kind": "figure",
    "description": "",
    "description_en": "",
    "image": "",
    "verses": ["9:17:40", "9:17:45", "9:17:49", "9:17:50"]
  },
  {
    "id": "lion",
    "name": "사자",
    "name_en": "Lion",
    "kind": "animal",
    "description": "",
    "description_en": "",
    "image": "",
    "verses": ["27:6:7", "27:6:16", "27:6:22", "27:6:24", "27:6:27"]
  },
  {
    "id": "great-fish",
    "name": "큰 물고기",
    "name_en": "Great Fish",
    "kind": "animal",
    "description": "",
    "description_en": "",
    "image": "",
    "verses": ["32:1:17", "32:2:1", "32:2:2", "32:2:10"]
  }
]
```

- [ ] **Step 7: 카탈로그 무결성 테스트 작성**

카탈로그의 ref는 코드가 조용히 건너뛰므로, 오타는 **테스트가 잡아야 한다.**
`rootBundle`을 쓰지 않고 파일을 직접 읽어 `courses.json`과 대조한다(테스트는 패키지 루트에서 돈다).

`test/cards_catalog_integrity_test.dart`:

```dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/verse_ref.dart';

void main() {
  test('cards.json의 모든 관련 절이 실제 코스 절로 해석된다', () {
    final known = <VerseRef>{};
    final courses =
        jsonDecode(File('assets/courses/courses.json').readAsStringSync()) as List<dynamic>;
    for (final c in courses) {
      for (final s in (c as Map<String, dynamic>)['sections'] as List<dynamic>? ?? const []) {
        for (final i in (s as Map<String, dynamic>)['items'] as List<dynamic>? ?? const []) {
          final item = i as Map<String, dynamic>;
          known.add(VerseRef(
              item['book'] as int, item['chapter'] as int, item['verse'] as int));
        }
      }
    }

    final cards =
        jsonDecode(File('assets/cards/cards.json').readAsStringSync()) as List<dynamic>;
    final problems = <String>[];
    for (final raw in cards) {
      final card = raw as Map<String, dynamic>;
      final verses = card['verses'] as List<dynamic>? ?? const [];
      // 등급 사다리가 뭉개지지 않으려면 관련 절이 4개 이상이어야 한다(설계 §2).
      expect(verses.length, greaterThanOrEqualTo(4),
          reason: '${card['id']}: 관련 절이 4개 미만이면 중간 등급이 건너뛰어진다');
      for (final v in verses) {
        final ref = VerseRef.parse('$v');
        if (ref == null || !known.contains(ref)) {
          problems.add('${card['id']}: $v');
        }
      }
    }

    expect(problems, isEmpty, reason: '해석되지 않는 절 참조');
  });
}
```

- [ ] **Step 8: 무결성 테스트 통과 확인**

Run: `flutter test test/cards_catalog_integrity_test.dart`
Expected: PASS

이 시점에 `card_repository.dart`는 아직 옛 필드를 참조해 **컴파일이 깨져 있다.** Task 3에서 고친다.
지금은 위 두 테스트 파일만 돌린다.

- [ ] **Step 9: 커밋**

```bash
git add lib/core/cards/verse_ref.dart lib/core/cards/card_def.dart assets/cards/cards.json test/card_catalog_test.dart test/cards_catalog_integrity_test.dart
git commit -m "feat(cards): 카드 해금 단위를 섹션에서 관련 절 목록으로 교체"
```

---

### Task 2: 등급 판정

**Files:**
- Create: `lib/core/cards/card_tier.dart`
- Create: `assets/cards/tiers.json`
- Test: `test/card_tier_test.dart`

**Interfaces:**
- Produces:
  - `enum CardTier { bronze, silver, gold, legend }` — 선언 순서가 곧 높낮이다. `a.index > b.index`로 비교한다.
  - `class TierThreshold { const TierThreshold(this.tier, this.minRatio); final CardTier tier; final double minRatio; }`
  - `const kDefaultTierThresholds` — `[TierThreshold(CardTier.silver, 0.34), TierThreshold(CardTier.gold, 0.67)]`. `tiers.json` 로드 실패 시 폴백.
  - `CardTier? tierOf({required int memorized, required int total, required List<TierThreshold> thresholds})` — 등급 없음이면 `null`.
  - `Future<List<TierThreshold>> loadTierThresholds()` — `assets/cards/tiers.json`을 읽는다. 실패하면 `kDefaultTierThresholds`.
  - `CardTier? cardTierFromId(String id)` — `'bronze'|'silver'|'gold'|'legend'` → enum, 그 외 `null`.

- [ ] **Step 1: 임계값 데이터 작성**

`assets/cards/tiers.json`:

```json
[
  { "id": "silver", "minRatio": 0.34 },
  { "id": "gold", "minRatio": 0.67 }
]
```

브론즈("1개 이상")와 레전드("전부")는 비율이 아니라 규칙이므로 이 파일에 없다.

`assets/cards/`는 이미 `pubspec.yaml`의 `assets:`에 등록돼 있으므로 **pubspec은 손대지 않는다.**

- [ ] **Step 2: 실패하는 테스트 작성**

`test/card_tier_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_tier.dart';

CardTier? tier(int memorized, int total) => tierOf(
      memorized: memorized,
      total: total,
      thresholds: kDefaultTierThresholds,
    );

void main() {
  test('0개면 등급이 없다', () {
    expect(tier(0, 5), isNull);
  });

  test('1개만 외워도 브론즈다', () {
    expect(tier(1, 5), CardTier.bronze);
  });

  test('34%/67% 경계에서 실버·골드로 오른다', () {
    expect(tier(1, 5), CardTier.bronze); // 0.20
    expect(tier(2, 5), CardTier.silver); // 0.40
    expect(tier(3, 5), CardTier.silver); // 0.60
    expect(tier(4, 5), CardTier.gold); // 0.80
  });

  test('전부 외우면 레전드다', () {
    expect(tier(5, 5), CardTier.legend);
  });

  test('관련 절이 적으면 중간 등급이 건너뛰어진다(알려진 절충)', () {
    expect(tier(1, 2), CardTier.silver); // 0.50 → 브론즈를 건너뛰고 바로 실버
    expect(tier(2, 2), CardTier.legend);
  });

  test('관련 절이 하나도 없으면 등급이 없다', () {
    expect(tier(0, 0), isNull);
  });

  test('등급은 선언 순서대로 높아진다', () {
    expect(CardTier.bronze.index < CardTier.silver.index, isTrue);
    expect(CardTier.silver.index < CardTier.gold.index, isTrue);
    expect(CardTier.gold.index < CardTier.legend.index, isTrue);
  });

  test('id 문자열을 등급으로 바꾼다', () {
    expect(cardTierFromId('gold'), CardTier.gold);
    expect(cardTierFromId('platinum'), isNull);
  });
}
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_tier_test.dart`
Expected: FAIL — `card_tier.dart` 없음(compile error).

- [ ] **Step 4: 구현**

`lib/core/cards/card_tier.dart`:

```dart
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

/// 카드 등급. 선언 순서가 곧 높낮이다(index로 비교한다).
enum CardTier { bronze, silver, gold, legend }

CardTier? cardTierFromId(String id) => switch (id) {
      'bronze' => CardTier.bronze,
      'silver' => CardTier.silver,
      'gold' => CardTier.gold,
      'legend' => CardTier.legend,
      _ => null,
    };

class TierThreshold {
  const TierThreshold(this.tier, this.minRatio);
  final CardTier tier;
  final double minRatio;
}

/// tiers.json을 못 읽었을 때의 폴백. 값은 assets/cards/tiers.json과 같아야 한다.
const kDefaultTierThresholds = <TierThreshold>[
  TierThreshold(CardTier.silver, 0.34),
  TierThreshold(CardTier.gold, 0.67),
];

/// 등급 판정. 브론즈("1개 이상")와 레전드("전부")는 비율이 아니라 규칙이라
/// 임계값 데이터가 아닌 여기에 있다 — 반올림으로 한 절 남기고 레전드가 되면 안 된다.
CardTier? tierOf({
  required int memorized,
  required int total,
  required List<TierThreshold> thresholds,
}) {
  if (total <= 0 || memorized <= 0) return null;
  if (memorized >= total) return CardTier.legend;

  final ratio = memorized / total;
  var result = CardTier.bronze;
  for (final t in thresholds) {
    if (ratio >= t.minRatio && t.tier.index > result.index) result = t.tier;
  }
  return result;
}

/// 임계값은 코드가 아니라 데이터다 — 나중에 JSON만 고쳐 조정한다.
Future<List<TierThreshold>> loadTierThresholds() async {
  try {
    final raw = await rootBundle.loadString('assets/cards/tiers.json');
    final list = jsonDecode(raw) as List<dynamic>;
    final out = <TierThreshold>[];
    for (final item in list) {
      final map = item as Map<String, dynamic>;
      final tier = cardTierFromId(map['id'] as String? ?? '');
      final ratio = (map['minRatio'] as num?)?.toDouble();
      if (tier != null && ratio != null) out.add(TierThreshold(tier, ratio));
    }
    return out.isEmpty ? kDefaultTierThresholds : out;
  } catch (_) {
    // 파일이 깨졌다고 도감이 통째로 막히면 안 된다.
    return kDefaultTierThresholds;
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `flutter test test/card_tier_test.dart`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/core/cards/card_tier.dart assets/cards/tiers.json test/card_tier_test.dart
git commit -m "feat(cards): 4등급 판정 순수 함수 + 임계값 데이터"
```

---

### Task 3: 리포지토리 — 교집합 등급 판정 + 등급별 공개 기록

**Files:**
- Create: `lib/core/cards/card_status.dart`
- Modify: `lib/core/cards/card_repository.dart` (전체 교체)
- Modify: `lib/core/settings/app_settings_repository.dart`
- Test: `test/card_repository_test.dart` (기존 파일 교체)

**Interfaces:**
- Consumes: `CardDef`/`VerseRef`(Task 1), `CardTier`/`TierThreshold`/`tierOf`(Task 2), `AppDatabase`, `AppSettingsRepository`.
- Produces:
  - `class CardStatus { const CardStatus(this.card, this.tier); final CardDef card; final CardTier tier; }`
  - `AppSettingsRepository.revealedCardTiersKey` = `'revealed_card_tiers'`
  - `class CardRepository { CardRepository(AppDatabase db, AppSettingsRepository settings, {List<TierThreshold> thresholds = kDefaultTierThresholds}); }`
  - `Future<Set<VerseRef>> memorizedVerses()`
  - `Future<List<CardStatus>> unlockedCards(List<CardDef> catalog)` — 등급이 있는 카드만, 카탈로그 순서 유지.
  - `Future<List<CardStatus>> pendingUpgradesForVerse(List<CardDef> catalog, VerseRef ref)` — 그 절을 포함하고, 현재 등급이 마지막으로 축하한 등급보다 높은 카드들.
  - `Future<CardTier?> revealedTier(String cardId)` / `Future<void> markRevealedTier(String cardId, CardTier tier)`
- 제거: `completedSectionIds()`, `cardForSection()`, `isRevealed()`, `markRevealed()`.

- [ ] **Step 1: 공개 기록 키 추가**

`lib/core/settings/app_settings_repository.dart`의 `revealedCardsKey` 줄을 아래로 교체한다:

```dart
  // 등급마다 한 번씩만 축하한다. 'dove:silver,ark:bronze' 형태.
  // 옛 키 'revealed_cards'(id만)는 의미가 달라져 버리고 읽지 않는다.
  static const revealedCardTiersKey = 'revealed_card_tiers';
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/card_repository_test.dart` 전체를 아래로 교체한다:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/core/cards/card_repository.dart';
import 'package:verse_flutter/core/cards/card_tier.dart';
import 'package:verse_flutter/core/cards/verse_ref.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/settings/app_settings_repository.dart';

CardDef _card(String id, List<VerseRef> verses) => CardDef(
      id: id,
      name: id,
      nameEn: id,
      kind: 'animal',
      description: '',
      descriptionEn: '',
      image: '',
      verses: verses,
    );

void main() {
  late AppDatabase db;
  late CardRepository repo;
  var nextItemId = 1;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = CardRepository(db, AppSettingsRepository(db));
    nextItemId = 1;
  });
  tearDown(() => db.close());

  /// 절 하나를 코스 아이템으로 심고, cleared면 진도까지 넣는다.
  /// 같은 절을 여러 번 부르면 여러 코스에 중복 존재하는 상황이 된다.
  Future<int> seedVerse(VerseRef r, {bool cleared = false}) async {
    final id = nextItemId++;
    await db.into(db.courseItems).insertOnConflictUpdate(CourseItemsCompanion.insert(
        id: Value(id),
        courseId: 1,
        ord: id,
        book: r.book,
        chapter: r.chapter,
        verse: r.verse,
        verseText: 'v$id'));
    if (cleared) {
      await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
          courseItemId: Value(id),
          grade: 'green',
          cleared: const Value(true),
          updatedAt: DateTime.now()));
    }
    return id;
  }

  const a = VerseRef(1, 8, 8);
  const b = VerseRef(1, 8, 9);
  const c = VerseRef(1, 8, 10);
  const d = VerseRef(1, 8, 11);

  test('외운 절만 집합에 담긴다', () async {
    await seedVerse(a, cleared: true);
    await seedVerse(b);

    expect(await repo.memorizedVerses(), {a});
  });

  test('같은 절이 여러 코스에 있어도 하나만 cleared면 외운 것이다', () async {
    await seedVerse(a); // 주제 코스 쪽 — 안 외움
    await seedVerse(a, cleared: true); // 책 코스 쪽 — 외움

    expect(await repo.memorizedVerses(), {a});
  });

  test('등급이 있는 카드만 반환하고 카탈로그 순서를 유지한다', () async {
    await seedVerse(a, cleared: true);
    await seedVerse(b);
    await seedVerse(c);
    await seedVerse(d);

    final catalog = [
      _card('dove', [a, b, c, d]), // 1/4 → 브론즈
      _card('ark', [b, c, d]), // 0개 → 등급 없음
    ];
    final unlocked = await repo.unlockedCards(catalog);

    expect(unlocked.map((s) => s.card.id), ['dove']);
    expect(unlocked.single.tier, CardTier.bronze);
  });

  test('절을 더 외우면 등급이 오른다', () async {
    await seedVerse(a, cleared: true);
    await seedVerse(b, cleared: true);
    await seedVerse(c, cleared: true);
    await seedVerse(d, cleared: true);

    final catalog = [_card('dove', [a, b, c, d])];
    expect((await repo.unlockedCards(catalog)).single.tier, CardTier.legend);
  });

  test('공개 기록은 등급까지 남는다', () async {
    expect(await repo.revealedTier('dove'), isNull);

    await repo.markRevealedTier('dove', CardTier.bronze);
    expect(await repo.revealedTier('dove'), CardTier.bronze);
    expect(await repo.revealedTier('ark'), isNull);

    await repo.markRevealedTier('dove', CardTier.silver);
    expect(await repo.revealedTier('dove'), CardTier.silver);
  });

  test('등급이 오른 카드만 뒤집을 거리로 내놓는다', () async {
    await seedVerse(a, cleared: true);
    await seedVerse(b);
    await seedVerse(c);
    await seedVerse(d);
    final catalog = [_card('dove', [a, b, c, d])];

    // 처음엔 브론즈가 뒤집을 거리다.
    var pending = await repo.pendingUpgradesForVerse(catalog, a);
    expect(pending.single.tier, CardTier.bronze);

    // 축하한 뒤에는 같은 등급으로 다시 뜨지 않는다.
    await repo.markRevealedTier('dove', CardTier.bronze);
    expect(await repo.pendingUpgradesForVerse(catalog, a), isEmpty);

    // 한 절 더 외워 등급이 오르면 다시 뜬다.
    await seedVerse(b, cleared: true);
    pending = await repo.pendingUpgradesForVerse(catalog, b);
    expect(pending.single.tier, CardTier.silver);
  });

  test('그 절과 무관한 카드는 뒤집을 거리에 없다', () async {
    await seedVerse(a, cleared: true);
    final catalog = [_card('dove', [a, b, c, d]), _card('ark', [b, c, d])];

    final pending = await repo.pendingUpgradesForVerse(catalog, a);
    expect(pending.map((s) => s.card.id), ['dove']);
  });
}
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_repository_test.dart`
Expected: FAIL — `CardStatus`/`memorizedVerses` 미정의(compile error).

- [ ] **Step 4: CardStatus 구현**

`lib/core/cards/card_status.dart`:

```dart
import 'card_def.dart';
import 'card_tier.dart';

/// 카드 + 지금 등급. 등급이 없는 카드는 CardStatus로 만들지 않는다
/// (화면에 나오지 않으므로 "등급 없음" 상태를 들고 다닐 이유가 없다).
class CardStatus {
  const CardStatus(this.card, this.tier);

  final CardDef card;
  final CardTier tier;
}
```

- [ ] **Step 5: 리포지토리 교체**

`lib/core/cards/card_repository.dart` 전체를 아래로 교체한다:

```dart
import 'package:drift/drift.dart';

import '../db/app_database.dart';
import '../settings/app_settings_repository.dart';
import 'card_def.dart';
import 'card_status.dart';
import 'card_tier.dart';
import 'verse_ref.dart';

/// 카드 등급 판정. 새 테이블 없이 기존 진도에서 파생한다 —
/// "이 카드의 관련 절 중 몇 개를 외웠는가"가 곧 등급이다.
class CardRepository {
  CardRepository(
    this._db,
    this._settings, {
    List<TierThreshold> thresholds = kDefaultTierThresholds,
  }) : _thresholds = thresholds;

  final AppDatabase _db;
  final AppSettingsRepository _settings;
  final List<TierThreshold> _thresholds;

  /// 외운 절 집합. 같은 절이 여러 코스에 중복 존재해도 하나라도 cleared면 외운 것이다.
  Future<Set<VerseRef>> memorizedVerses() async {
    final rows = await (_db.select(_db.courseItems).join([
      innerJoin(_db.progress, _db.progress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(_db.progress.cleared.equals(true)))
        .get();

    final out = <VerseRef>{};
    for (final r in rows) {
      final i = r.readTable(_db.courseItems);
      out.add(VerseRef(i.book, i.chapter, i.verse));
    }
    return out;
  }

  /// 등급이 있는 카드만 골라 카탈로그 순서대로 반환한다.
  Future<List<CardStatus>> unlockedCards(List<CardDef> catalog) async {
    final done = await memorizedVerses();
    return [
      for (final c in catalog)
        if (_tierFor(c, done) case final t?) CardStatus(c, t),
    ];
  }

  /// 방금 외운 절이 속한 카드들 중, 마지막으로 축하한 등급보다 지금 등급이 높은 것들.
  Future<List<CardStatus>> pendingUpgradesForVerse(
      List<CardDef> catalog, VerseRef ref) async {
    final done = await memorizedVerses();
    final revealed = await _revealedTiers();

    final out = <CardStatus>[];
    for (final c in catalog) {
      if (!c.verses.contains(ref)) continue;
      final tier = _tierFor(c, done);
      if (tier == null) continue;
      final seen = revealed[c.id];
      if (seen != null && seen.index >= tier.index) continue;
      out.add(CardStatus(c, tier));
    }
    return out;
  }

  CardTier? _tierFor(CardDef c, Set<VerseRef> memorized) => tierOf(
        memorized: c.verses.where(memorized.contains).length,
        total: c.verses.length,
        thresholds: _thresholds,
      );

  /// 'dove:silver,ark:bronze' → {dove: silver, ark: bronze}
  Future<Map<String, CardTier>> _revealedTiers() async {
    final raw =
        await _settings.read(AppSettingsRepository.revealedCardTiersKey) ?? '';
    final out = <String, CardTier>{};
    for (final entry in raw.split(',')) {
      final parts = entry.split(':');
      if (parts.length != 2) continue;
      final tier = cardTierFromId(parts[1]);
      if (tier != null) out[parts[0]] = tier;
    }
    return out;
  }

  Future<CardTier?> revealedTier(String cardId) async =>
      (await _revealedTiers())[cardId];

  Future<void> markRevealedTier(String cardId, CardTier tier) async {
    final map = await _revealedTiers();
    map[cardId] = tier;
    await _settings.write(
      AppSettingsRepository.revealedCardTiersKey,
      map.entries.map((e) => '${e.key}:${e.value.name}').join(','),
    );
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/card_repository_test.dart`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/core/cards/card_status.dart lib/core/cards/card_repository.dart lib/core/settings/app_settings_repository.dart test/card_repository_test.dart
git commit -m "feat(cards): 관련 절 교집합으로 등급 판정 + 등급별 공개 기록"
```

---

### Task 4: 도감 UI에 등급 반영

**Files:**
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Generated: `lib/l10n/app_localizations*.dart`
- Modify: `lib/app/providers.dart`
- Modify: `lib/features/cards/card_tile.dart`
- Modify: `lib/features/cards/card_detail_sheet.dart`
- Modify: `lib/features/cards/card_collection_screen.dart`
- Test: `test/card_collection_screen_test.dart` (기존 파일 교체)

**Interfaces:**
- Consumes: `CardStatus`, `CardTier`, `loadTierThresholds`, `CardRepository.unlockedCards`.
- Produces:
  - `final tierThresholdsProvider = FutureProvider<List<TierThreshold>>(...)`
  - `cardRepositoryProvider` — 임계값을 주입받도록 수정.
  - `final unlockedCardsProvider = FutureProvider.autoDispose<List<CardStatus>>(...)`
  - `CardTile` — `card` 대신 `CardStatus status`를 받는다.
  - `void showCardDetail(BuildContext context, CardStatus status, String locale)`
  - `String cardTierLabel(AppLocalizations l, CardTier t)` (in `card_tile.dart`)
  - `Color cardTierColor(CardTier t)` (in `card_tile.dart`)
  - l10n `cardsTierBronze`, `cardsTierSilver`, `cardsTierGold`, `cardsTierLegend`; `cardsEmptyBody` 문구 변경.
- 제거: `sectionCardProvider`.

- [ ] **Step 1: arb 키 추가·수정**

`lib/l10n/app_ko.arb`에서 `cardsEmptyBody` 값을 바꾸고 등급 이름을 추가한다.
파일 끝이 아래 모양이 되게 한다(해금 단위가 섹션이 아니게 됐으므로 문구도 바꾼다):

```json
  "cardsEmptyBody": "구절을 외우면 카드가 모여요",
  "cardsNewCard": "새 카드!",
  "cardsTapToFlip": "탭해서 뒤집기",
  "cardsTierUp": "등급 상승!",
  "cardsTierBronze": "브론즈",
  "cardsTierSilver": "실버",
  "cardsTierGold": "골드",
  "cardsTierLegend": "레전드"
}
```

`lib/l10n/app_en.arb`도 같은 키를 갖게 한다. `cardsEmptyBody`는 파일 끝에 있으므로
그 줄을 아래로 교체한다:

```json
  "cardsEmptyBody": "Memorize verses to collect cards",
  "cardsTierUp": "Tier up!",
  "cardsTierBronze": "Bronze",
  "cardsTierSilver": "Silver",
  "cardsTierGold": "Gold",
  "cardsTierLegend": "Legend"
}
```

(`cardsNewCard`, `cardsTapToFlip`은 `app_en.arb` 293~294줄에 이미 있으므로 다시 넣지 않는다.)

- [ ] **Step 2: l10n 재생성**

Run: `flutter gen-l10n`
Expected: 에러 없음.

- [ ] **Step 3: 실패하는 위젯 테스트 작성**

`test/card_collection_screen_test.dart` 전체를 아래로 교체한다:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/core/cards/verse_ref.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/features/cards/card_collection_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

const _a = VerseRef(1, 8, 8);
const _b = VerseRef(1, 8, 9);
const _c = VerseRef(1, 8, 10);
const _d = VerseRef(1, 8, 11);

CardDef _card(String id, String name, List<VerseRef> verses) => CardDef(
      id: id,
      name: name,
      nameEn: name,
      kind: 'animal',
      description: '설명 $name',
      descriptionEn: 'desc $name',
      image: '',
      verses: verses,
    );

Widget _wrap(AppDatabase db, List<CardDef> catalog) => ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(db),
        cardCatalogProvider.overrideWith((ref) async => catalog),
      ],
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: Locale('ko'),
        home: CardCollectionScreen(),
      ),
    );

var _nextId = 1;

Future<void> _seedVerse(AppDatabase db, VerseRef r, {bool cleared = false}) async {
  final id = _nextId++;
  await db.into(db.courseItems).insertOnConflictUpdate(CourseItemsCompanion.insert(
      id: Value(id),
      courseId: 1,
      ord: id,
      book: r.book,
      chapter: r.chapter,
      verse: r.verse,
      verseText: 'v'));
  if (cleared) {
    await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
        courseItemId: Value(id),
        grade: 'green',
        cleared: const Value(true),
        updatedAt: DateTime.now()));
  }
}

void main() {
  setUp(() => _nextId = 1);

  testWidgets('등급이 있는 카드가 없으면 안내 문구를 보여준다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(_wrap(db, [_card('dove', '비둘기', [_a, _b, _c, _d])]));
    await tester.pumpAndSettle();

    expect(find.text('구절을 외우면 카드가 모여요'), findsOneWidget);
    expect(find.text('비둘기'), findsNothing);
  });

  testWidgets('등급이 있는 카드만 그리드에 뜨고 등급 이름이 보인다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await _seedVerse(db, _a, cleared: true);
    await _seedVerse(db, _b);
    await _seedVerse(db, _c);
    await _seedVerse(db, _d);

    await tester.pumpWidget(_wrap(db, [
      _card('dove', '비둘기', [_a, _b, _c, _d]), // 1/4 → 브론즈
      _card('ark', '방주', [_b, _c, _d]), // 0개 → 등급 없음
    ]));
    await tester.pumpAndSettle();

    expect(find.text('비둘기'), findsOneWidget);
    expect(find.text('브론즈'), findsOneWidget);
    expect(find.text('방주'), findsNothing); // 등급 없는 카드는 화면에 없다
  });

  testWidgets('상세에 설명과 등급이 뜨고, 관련 절·진행 숫자는 없다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await _seedVerse(db, _a, cleared: true);
    await _seedVerse(db, _b);
    await _seedVerse(db, _c);
    await _seedVerse(db, _d);

    await tester.pumpWidget(_wrap(db, [_card('dove', '비둘기', [_a, _b, _c, _d])]));
    await tester.pumpAndSettle();

    await tester.tap(find.text('비둘기'));
    await tester.pumpAndSettle();

    expect(find.text('설명 비둘기'), findsOneWidget);
    expect(find.text('브론즈'), findsWidgets);
    // 남은 절을 알려주지 않는다(설계 §6).
    expect(find.textContaining('1/4'), findsNothing);
    expect(find.textContaining('1:8:'), findsNothing);
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_collection_screen_test.dart`
Expected: FAIL — `CardTile`이 아직 `CardDef`를 받고 `unlockedCardsProvider` 타입이 다르다.

- [ ] **Step 5: 프로바이더 수정**

`lib/app/providers.dart`의 import 블록에 추가한다:

```dart
import '../core/cards/card_status.dart';
import '../core/cards/card_tier.dart';
```

209~229줄(카드 관련 프로바이더 전체)을 아래로 교체한다:

```dart
/// 카드 카탈로그(번들 JSON). 테스트에서 override 하기 쉽도록 프로바이더로 감싼다.
final cardCatalogProvider = FutureProvider<List<CardDef>>((ref) => CardCatalog.load());

/// 등급 임계값도 데이터(assets/cards/tiers.json)에서 읽는다.
final tierThresholdsProvider =
    FutureProvider<List<TierThreshold>>((ref) => loadTierThresholds());

final cardRepositoryProvider = Provider<CardRepository>(
  (ref) => CardRepository(
    ref.watch(databaseProvider),
    ref.watch(appSettingsRepositoryProvider),
    thresholds:
        ref.watch(tierThresholdsProvider).value ?? kDefaultTierThresholds,
  ),
);

/// 도감에 보여줄 카드 = 등급이 붙은 것만(등급 없는 카드는 노출하지 않는다).
final unlockedCardsProvider = FutureProvider.autoDispose<List<CardStatus>>((ref) async {
  final catalog = await ref.watch(cardCatalogProvider.future);
  return ref.watch(cardRepositoryProvider).unlockedCards(catalog);
});
```

`sectionCardProvider`는 **삭제한다**(해금 단위가 섹션이 아니게 됐다).

- [ ] **Step 6: 카드 타일 수정**

`lib/features/cards/card_tile.dart` 전체를 아래로 교체한다:

```dart
import 'package:flutter/material.dart';

import '../../core/cards/card_def.dart';
import '../../core/cards/card_status.dart';
import '../../core/cards/card_tier.dart';
import '../../l10n/app_localizations.dart';

Color cardTierColor(CardTier t) => switch (t) {
      CardTier.bronze => const Color(0xFF9C6B3F),
      CardTier.silver => const Color(0xFFA8AEB8),
      CardTier.gold => const Color(0xFFD9A31E),
      CardTier.legend => const Color(0xFF8E5BD0),
    };

String cardTierLabel(AppLocalizations l, CardTier t) => switch (t) {
      CardTier.bronze => l.cardsTierBronze,
      CardTier.silver => l.cardsTierSilver,
      CardTier.gold => l.cardsTierGold,
      CardTier.legend => l.cardsTierLegend,
    };

/// 도감 그리드의 카드 한 칸. 아트가 아직 없으면(image가 비었으면)
/// 이름 첫 글자 + 종류별 색 타일로 대체 렌더한다 — 아트가 생기면 파일만 넣으면 된다.
/// 등급은 테두리 색과 이름으로만 보여준다. 남은 절이 몇 개인지는 알려주지 않는다.
class CardTile extends StatelessWidget {
  const CardTile({super.key, required this.status, required this.locale, this.onTap});

  final CardStatus status;
  final String locale;
  final VoidCallback? onTap;

  CardDef get _card => status.card;

  Color get _tint => _card.kind == 'figure' ? const Color(0xFF7C6BAF) : const Color(0xFF4F8A5B);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final name = cardNameFor(_card, locale);
    final tierColor = cardTierColor(status.tier);
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(
                color: _tint,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: tierColor, width: 3),
              ),
              alignment: Alignment.center,
              child: _card.image.isEmpty
                  ? Text(
                      // characters 패키지 import를 피하려고 substring을 쓴다(한글 1글자는 BMP라 안전).
                      name.isEmpty ? '?' : name.substring(0, 1),
                      style: const TextStyle(fontSize: 32, color: Colors.white, fontWeight: FontWeight.bold),
                    )
                  : Image.asset('assets/cards/art/${_card.image}', fit: BoxFit.contain),
            ),
          ),
          const SizedBox(height: 6),
          Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
          Text(
            cardTierLabel(l, status.tier),
            style: TextStyle(fontSize: 11, color: tierColor, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 7: 카드 상세 수정**

`lib/features/cards/card_detail_sheet.dart` 전체를 아래로 교체한다:

```dart
import 'package:flutter/material.dart';

import '../../core/cards/card_def.dart';
import '../../core/cards/card_status.dart';
import '../../l10n/app_localizations.dart';
import 'card_tile.dart';

/// 카드 상세 — 그림 · 이름 · 설명 · 등급, 이 넷뿐이다.
/// 관련 절 목록도, 외운 표시도, "3/5" 같은 진행 숫자도 두지 않는다:
/// 다음 등급까지 뭐가 남았는지는 앱이 알려주지 않는다(설계 §6).
void showCardDetail(BuildContext context, CardStatus status, String locale) {
  showModalBottomSheet<void>(
    context: context,
    builder: (context) {
      final l = AppLocalizations.of(context)!;
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 120,
              child: CardTile(status: status, locale: locale),
            ),
            const SizedBox(height: 16),
            Text(cardNameFor(status.card, locale),
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              cardTierLabel(l, status.tier),
              style: TextStyle(
                  color: cardTierColor(status.tier), fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(cardDescriptionFor(status.card, locale), textAlign: TextAlign.center),
          ],
        ),
      );
    },
  );
}
```

- [ ] **Step 8: 도감 화면 수정**

`lib/features/cards/card_collection_screen.dart`의 `itemBuilder`(48~52줄)를 아래로 교체한다:

```dart
            itemBuilder: (context, i) => CardTile(
              status: cards[i],
              locale: locale,
              onTap: () => showCardDetail(context, cards[i], locale),
            ),
```

나머지는 그대로 둔다(`cards`가 `List<CardStatus>`로 바뀔 뿐 `isEmpty`·`length` 사용은 동일하다).

- [ ] **Step 9: 테스트 통과 확인**

Run: `flutter test test/card_collection_screen_test.dart`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add lib/l10n/ lib/app/providers.dart lib/features/cards/ test/card_collection_screen_test.dart
git commit -m "feat(cards): 도감에 등급 표시 — 테두리 색 + 등급 이름"
```

---

### Task 5: 등급이 오를 때마다 뒤집기

**Files:**
- Modify: `lib/features/cards/card_flip.dart`
- Modify: `lib/features/courses/section_complete_screen.dart`
- Modify: `lib/features/memorize/memorize_screen.dart`
- Test: `test/card_flip_test.dart` (기존 파일 교체)

**Interfaces:**
- Consumes: `CardStatus`, `CardRepository.pendingUpgradesForVerse/markRevealedTier`, `cardCatalogProvider`, `cardRepositoryProvider`, `unlockedCardsProvider`, `CardTile`, `cardTierLabel`.
- Produces:
  - `CardFlip` — `card` 대신 `CardStatus status`를 받는다. 나머지 시그니처(`locale`, `onRevealed`)는 그대로.

- [ ] **Step 1: 실패하는 위젯 테스트 작성**

`test/card_flip_test.dart` 전체를 아래로 교체한다:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/core/cards/card_status.dart';
import 'package:verse_flutter/core/cards/card_tier.dart';
import 'package:verse_flutter/core/cards/verse_ref.dart';
import 'package:verse_flutter/features/cards/card_flip.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

const _dove = CardDef(
  id: 'dove',
  name: '비둘기',
  nameEn: 'Dove',
  kind: 'animal',
  description: '',
  descriptionEn: '',
  image: '',
  verses: [VerseRef(1, 8, 8), VerseRef(1, 8, 9)],
);

Widget _wrap(CardTier tier, VoidCallback onRevealed) => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Scaffold(
        body: Center(
          child: CardFlip(
            status: CardStatus(_dove, tier),
            locale: 'ko',
            onRevealed: onRevealed,
          ),
        ),
      ),
    );

void main() {
  testWidgets('처음엔 뒷면(안내 문구)만 보이고 이름·등급은 가려져 있다', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.bronze, () {}));
    await tester.pumpAndSettle();

    expect(find.text('탭해서 뒤집기'), findsOneWidget);
    expect(find.text('비둘기'), findsNothing);
    expect(find.text('브론즈'), findsNothing);
  });

  testWidgets('탭하면 앞면이 공개되고 콜백이 불린다', (tester) async {
    var revealed = 0;
    await tester.pumpWidget(_wrap(CardTier.bronze, () => revealed++));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(CardFlip));
    await tester.pumpAndSettle();

    expect(find.text('비둘기'), findsOneWidget);
    expect(find.text('브론즈'), findsOneWidget);
    expect(find.text('탭해서 뒤집기'), findsNothing);
    expect(revealed, 1);
  });

  testWidgets('등급업도 같은 뒤집기다 — 오른 등급이 앞면에 보인다', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.silver, () {}));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(CardFlip));
    await tester.pumpAndSettle();

    expect(find.text('실버'), findsOneWidget);
  });
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_flip_test.dart`
Expected: FAIL — `CardFlip`이 아직 `card`를 받는다.

- [ ] **Step 3: CardFlip 수정**

`lib/features/cards/card_flip.dart`에서 아래 세 곳만 고친다. 나머지(뒷면·회전 로직)는 그대로다.

import 블록을 교체:

```dart
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/cards/card_status.dart';
import '../../l10n/app_localizations.dart';
import 'card_tile.dart';
```

클래스 선언부(11~20줄)를 교체:

```dart
/// 카드 획득 연출. 뒷면으로 시작하고, 사용자가 탭하면 뒤집혀 앞면이 공개된다.
/// 첫 등장(브론즈)이든 등급업이든 같은 연출이다 — 앞면에 등급이 함께 보이므로
/// 뒤집는 순간이 곧 "올랐다"는 확인이 된다.
class CardFlip extends StatefulWidget {
  const CardFlip({super.key, required this.status, required this.locale, required this.onRevealed});

  final CardStatus status;
  final String locale;
  final VoidCallback onRevealed;

  @override
  State<CardFlip> createState() => _CardFlipState();
}
```

앞면 렌더(60~63줄의 `SizedBox`)를 교체:

```dart
                    child: SizedBox(
                      width: 140,
                      child: CardTile(status: widget.status, locale: widget.locale),
                    ),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/card_flip_test.dart`
Expected: PASS

- [ ] **Step 5: 섹션 완료 화면에서 뒤집기 제거**

`lib/features/courses/section_complete_screen.dart`에서 `import '../cards/card_flip.dart';` 줄을 지우고,
51~73줄의 카드 블록(주석 `// 이 섹션에서 새로 얻는 카드가 있으면...`부터 `orElse: ... ),`까지)을
아래 한 줄로 되돌린다:

```dart
            const SizedBox(height: 40),
```

해금 단위가 섹션이 아니게 됐으므로 이 자리에는 카드가 오지 않는다.

- [ ] **Step 6: 암송 결과 화면에 뒤집기 삽입**

`lib/features/memorize/memorize_screen.dart`의 import 블록에 추가한다:

```dart
import '../../core/cards/card_status.dart';
import '../../core/cards/card_tier.dart';
import '../../core/cards/verse_ref.dart';
import '../cards/card_flip.dart';
import '../cards/card_tile.dart';
```

`_maybeCheckMilestone` 아래(85줄 뒤)에 상태 필드와 감지 메서드를 추가한다.
필드는 `_milestone`이 선언된 곳 옆에 둔다:

```dart
  List<CardStatus> _cardUpgrades = const [];
```

감지 메서드:

```dart
  /// 카드 등급 감지 — green 판정 직후, 방금 외운 절이 속한 카드의 등급이 올랐는지 본다.
  /// 마일스톤과 같은 조건(green, 받아쓰기 제외)을 쓴다.
  void _maybeCheckCardUpgrades(MemorizeState next) {
    if (next.clientGrade != grading.Grade.green || next.mode == 'dictation')
      return;
    final item = next.item;
    // 변수명을 verseRef로 둔다 — `ref`는 위젯의 Riverpod ref라 겹치면 안 된다.
    final verseRef = VerseRef(item.book, item.chapter, item.verse);
    ref.read(cardCatalogProvider.future).then((catalog) {
      return ref
          .read(cardRepositoryProvider)
          .pendingUpgradesForVerse(catalog, verseRef);
    }).then((ups) {
      if (mounted && ups.isNotEmpty) setState(() => _cardUpgrades = ups);
    }).catchError((_) {});
  }
```

`_maybeCheckMilestone` 안의 `justEnteredResult` 가드는 그대로 두고, 그 아래에서 새 메서드를 부른다.
`_maybeCheckMilestone`의 `if (!justEnteredResult) return;` 다음 줄에 추가:

```dart
    _maybeCheckCardUpgrades(next);
```

`_ResultView` 생성 부분(162~170줄)에 인자를 추가한다:

```dart
              MemorizePhase.result => _ResultView(
                  state: state,
                  milestone: _milestone,
                  cardUpgrades: _cardUpgrades,
                  onRetry: () {
                    setState(() {
                      _milestone = null;
                      _cardUpgrades = const [];
                    });
                    notifier.backToStudy();
                  },
                  onDone: () => _onDone(context),
                ),
```

- [ ] **Step 7: _ResultView에 뒤집기 렌더 추가**

`_ResultView`의 생성자·필드(621~629줄)를 교체한다:

```dart
  const _ResultView(
      {required this.state,
      required this.milestone,
      required this.cardUpgrades,
      required this.onRetry,
      required this.onDone});
  final MemorizeState state;
  final int? milestone;
  final List<CardStatus> cardUpgrades;
  final VoidCallback onRetry;
  final VoidCallback onDone;
```

`build`의 `if (milestone != null) ...[ ... ],` 블록 **바로 뒤**에 카드 블록을 넣는다:

```dart
          // 등급이 오른 카드는 한 장씩 뒤집어 공개한다.
          for (final status in cardUpgrades) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                  color: p.surface,
                  border: Border.all(color: cardTierColor(status.tier), width: 2)),
              child: Column(
                children: [
                  Text(
                    status.tier == CardTier.bronze ? l.cardsNewCard : l.cardsTierUp,
                    style: TextStyle(fontSize: 16, color: cardTierColor(status.tier)),
                  ),
                  const SizedBox(height: 12),
                  CardFlip(
                    status: status,
                    locale: locale,
                    onRevealed: () {
                      ref
                          .read(cardRepositoryProvider)
                          .markRevealedTier(status.card.id, status.tier);
                      ref.invalidate(unlockedCardsProvider);
                    },
                  ),
                ],
              ),
            ),
          ],
```

`CardTier`를 쓰므로 import 블록에 추가한다:

```dart
import '../../core/cards/card_tier.dart';
```

- [ ] **Step 8: 전체 테스트 + 분석**

Run: `flutter test`
Expected: 전체 PASS.

Run: `flutter analyze`
Expected: 신규·수정 코드 무경고. (`sectionCardProvider` 삭제로 인한 미사용 import가 남아 있으면 지운다.)

- [ ] **Step 9: 수동 검증**

Run: `flutter run`

확인:
1. `카드` 탭 → 아직 등급이 없으면 Shaun + "구절을 외우면 카드가 모여요".
2. 창세기 8:8을 외운다 → 결과 화면에 **"새 카드!" + 뒷면 카드**. 탭 → 뒤집히며 **"비둘기 · 브론즈"** 공개.
3. `카드` 탭 → 비둘기가 브론즈 테두리로 있고, 탭하면 설명·등급이 뜬다.
   **관련 절 목록도, "1/5" 같은 숫자도 없다.**
4. 같은 절을 다시 외워도 **뒤집기가 다시 뜨지 않는다**.
5. 창세기 8:9, 8:10을 더 외운다 → 3/5 = 0.6 → **"등급 상승!" + 실버**로 다시 뒤집힌다.
6. 8:11, 8:12까지 외운다 → **레전드**.
7. 섹션 완료 화면에는 **카드가 나오지 않는다**.

- [ ] **Step 10: 커밋**

```bash
git add lib/features/cards/card_flip.dart lib/features/courses/section_complete_screen.dart lib/features/memorize/memorize_screen.dart test/card_flip_test.dart
git commit -m "feat(cards): 등급이 오를 때마다 암송 결과 화면에서 뒤집기"
```

---

## 완료 기준

- [ ] 카드가 `verses` 목록으로 정의되고, 카드 추가·수정에 Dart 수정이 필요 없다.
- [ ] 관련 절 1개만 외워도 브론즈 카드가 나오고, 전부 외우면 레전드가 된다.
- [ ] 등급 임계값이 `assets/cards/tiers.json`에 있고 코드 수정 없이 조정된다.
- [ ] 등급이 오를 때마다 암송 결과 화면에서 뒤집어 공개되고, 같은 등급은 반복되지 않는다.
- [ ] 섹션 완료 화면에는 카드가 나오지 않는다.
- [ ] 상세에 **관련 절 목록·외운 표시·진행 숫자가 없다.** 전체 수집 카운터도 없다.
- [ ] `cards.json`의 모든 ref가 실제 절로 해석된다(무결성 테스트).
- [ ] 새 drift 테이블 0개.
- [ ] `flutter test` 전체 통과, `flutter analyze` 무경고.

## 이 계획에 포함되지 않은 것

- **카드 설명 문구와 관련 절 목록 확정** — 사용자가 `cards.json`에서 직접 채운다. 이 계획은
  로직 확인용 시작 세트만 넣는다.
- **실제 카드 아트** — 플레이스홀더 타일 그대로.
- **등급별 아트 차등** — 같은 카드는 등급이 달라도 같은 그림이다.
- **카드 공유 이미지, 서버 카탈로그 원격 갱신, 가챠·재화·중복 교환** — 스펙 §8 범위 밖.

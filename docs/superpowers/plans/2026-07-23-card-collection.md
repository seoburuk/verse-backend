# 카드 컬렉션(도감) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경 동물·인물(장비로 표현) 카드를 번들 JSON 카탈로그로 정의하고, 섹션을 완주하면 해금해, 섹션 완료 화면에서 뒤집어 공개하고 `카드` 탭 도감에서 모아 본다.

**Architecture:** 카드 목록은 `assets/cards/cards.json`(코드 수정 없이 갱신 가능)에 두고 `CardCatalog`이 로드한다. 해금 여부는 새 테이블 없이 기존 `CourseItems`+`Progress` 조인으로 "완주한 섹션 집합"을 파생해 판정한다. 뒤집기 1회 기록만 기존 `SyncMeta`에 남긴다. 아트가 없으면 이름 첫 글자 타일로 대체 렌더한다.

**Tech Stack:** Flutter, Riverpod, drift(기존 테이블 재사용), rootBundle JSON, flutter gen-l10n, flutter_test.

## Global Constraints

- 작업 디렉토리: `verse-flutter/`. 모든 경로는 이 기준.
- **새 drift 테이블을 만들지 않는다.** 해금은 `Progress` 파생, 뒤집기 기록은 `SyncMeta` 재사용.
- **카드 목록을 Dart 코드에 하드코딩하지 않는다.** 전부 `assets/cards/cards.json`에서 읽는다 — 카드 아이디어가 계속 업데이트될 전제다.
- **잠긴 카드를 화면에 표시하지 않는다.** 실루엣·빈 슬롯 모두 없다.
- **수집 카운터("23/40")를 만들지 않는다.** 전체 장수를 노출하지 않는다.
- **무작위 뽑기(가챠)·재화·중복 교환을 만들지 않는다.**
- 인물 카드는 사람을 그리지 않고 장비·상징물로 표현한다(`kind: "figure"`).
- 새 문자열은 `lib/l10n/app_ko.arb`(템플릿) + `lib/l10n/app_en.arb`에 추가하고 `flutter gen-l10n` 재생성. 하드코딩 금지.
- 아트 파일은 이 계획에서 만들지 않는다. `image`가 비었거나 파일이 없으면 플레이스홀더 타일로 렌더한다.

## File Structure

- Create: `assets/cards/cards.json` — 카드 카탈로그(데이터).
- Create: `lib/core/cards/card_def.dart` — 카드 1장 모델 + JSON 파싱.
- Create: `lib/core/cards/card_catalog.dart` — 에셋에서 카탈로그 로드.
- Create: `lib/core/cards/card_repository.dart` — 완주 섹션 파생 + 해금 판정 + 뒤집기 기록.
- Create: `lib/features/cards/card_tile.dart` — 카드 타일(플레이스홀더 렌더 포함).
- Create: `lib/features/cards/card_detail_sheet.dart` — 카드 상세(그림·이름·설명).
- Create: `lib/features/cards/card_flip.dart` — 뒤집기 위젯.
- Modify: `lib/features/cards/card_collection_screen.dart` — 플레이스홀더 → 도감 그리드.
- Modify: `lib/features/courses/section_complete_screen.dart` — 뒤집기 공개 삽입.
- Modify: `lib/app/providers.dart` — 카드 프로바이더.
- Modify: `lib/core/settings/app_settings_repository.dart` — 공개한 카드 기록 키.
- Modify: `pubspec.yaml` — `assets/cards/` 등록.
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`.

---

### Task 1: 카탈로그 데이터 + 모델 + 로더

**Files:**
- Create: `assets/cards/cards.json`
- Create: `lib/core/cards/card_def.dart`
- Create: `lib/core/cards/card_catalog.dart`
- Modify: `pubspec.yaml`
- Test: `test/card_catalog_test.dart`

**Interfaces:**
- Produces:
  - `class CardDef` — 필드 `String id, name, nameEn, kind, description, descriptionEn`, `String? image`, `String unlockCourseSlug`, `int unlockSectionOrd`. 생성자 `CardDef.fromJson(Map<String, dynamic>)`.
  - `String cardNameFor(CardDef c, String locale)` / `String cardDescriptionFor(CardDef c, String locale)` — locale이 'en'이고 영문이 비어있지 않으면 영문, 아니면 한글.
  - `class CardCatalog { static Future<List<CardDef>> load(); }` — `assets/cards/cards.json`을 읽어 파싱하고, 항목 하나가 깨져도 그 항목만 건너뛴다.

- [ ] **Step 1: 카탈로그 데이터 작성**

`assets/cards/cards.json`. 실제 코스 슬러그와 섹션 ord(= 장 번호)에 맞춘 시작 세트다.
카드는 앞으로 계속 추가·수정되며, **이 파일만 고치면 된다**.

```json
[
  {
    "id": "dove",
    "name": "비둘기",
    "name_en": "Dove",
    "kind": "animal",
    "description": "홍수가 끝났음을 알린 새. 감람나무 잎을 물고 돌아왔다.",
    "description_en": "The bird that announced the flood had ended, returning with an olive leaf.",
    "image": "",
    "unlock": { "courseSlug": "book-01-genesis", "sectionOrd": 8 }
  },
  {
    "id": "ark",
    "name": "방주",
    "name_en": "The Ark",
    "kind": "figure",
    "description": "노아가 지은 거대한 배. 뭍의 생명을 실어 홍수를 건넜다.",
    "description_en": "The great vessel Noah built to carry life through the flood.",
    "image": "",
    "unlock": { "courseSlug": "book-01-genesis", "sectionOrd": 6 }
  },
  {
    "id": "staff",
    "name": "지팡이",
    "name_en": "The Staff",
    "kind": "figure",
    "description": "모세가 들었던 지팡이. 바다를 가르고 반석을 쳤다.",
    "description_en": "The staff Moses carried, which parted the sea and struck the rock.",
    "image": "",
    "unlock": { "courseSlug": "book-02-exodus", "sectionOrd": 14 }
  },
  {
    "id": "sling",
    "name": "물맷돌",
    "name_en": "The Sling",
    "kind": "figure",
    "description": "소년 다윗이 골리앗 앞에 들고 나간 것. 갑옷 대신 시냇돌 다섯이었다.",
    "description_en": "What young David carried against Goliath — five smooth stones instead of armor.",
    "image": "",
    "unlock": { "courseSlug": "book-09-1-samuel", "sectionOrd": 17 }
  },
  {
    "id": "lion",
    "name": "사자",
    "name_en": "Lion",
    "kind": "animal",
    "description": "다니엘이 갇힌 굴의 맹수. 밤새 입이 봉해졌다.",
    "description_en": "The beasts in the den where Daniel was thrown — their mouths shut all night.",
    "image": "",
    "unlock": { "courseSlug": "book-27-daniel", "sectionOrd": 6 }
  },
  {
    "id": "great-fish",
    "name": "큰 물고기",
    "name_en": "Great Fish",
    "kind": "animal",
    "description": "요나를 삼킨 바다 생물. 사흘 밤낮을 품었다.",
    "description_en": "The sea creature that swallowed Jonah and held him three days and nights.",
    "image": "",
    "unlock": { "courseSlug": "book-32-jonah", "sectionOrd": 2 }
  }
]
```

- [ ] **Step 2: pubspec에 에셋 등록**

`pubspec.yaml`의 `assets:` 목록에 한 줄 추가한다:

```yaml
  assets:
    - assets/courses/
    - assets/sounds/
    - assets/mascot/
    - assets/cards/
```

- [ ] **Step 3: 실패하는 테스트 작성**

`test/card_catalog_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';

void main() {
  test('JSON 한 장을 CardDef로 파싱한다', () {
    final c = CardDef.fromJson({
      'id': 'dove',
      'name': '비둘기',
      'name_en': 'Dove',
      'kind': 'animal',
      'description': '홍수가 끝났음을 알린 새.',
      'description_en': 'The bird that announced the flood had ended.',
      'image': '',
      'unlock': {'courseSlug': 'book-01-genesis', 'sectionOrd': 8},
    });

    expect(c.id, 'dove');
    expect(c.kind, 'animal');
    expect(c.unlockCourseSlug, 'book-01-genesis');
    expect(c.unlockSectionOrd, 8);
    expect(c.image, '');
  });

  test('locale에 따라 이름·설명을 고른다', () {
    final c = CardDef.fromJson({
      'id': 'lion',
      'name': '사자',
      'name_en': 'Lion',
      'kind': 'animal',
      'description': '굴의 맹수.',
      'description_en': 'Beast of the den.',
      'unlock': {'courseSlug': 'book-27-daniel', 'sectionOrd': 6},
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
      'kind': 'animal',
      'description': '설명',
      'unlock': {'courseSlug': 's', 'sectionOrd': 1},
    });

    expect(cardNameFor(c, 'en'), '이름');
    expect(cardDescriptionFor(c, 'en'), '설명');
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_catalog_test.dart`
Expected: FAIL — `CardDef` 미정의.

- [ ] **Step 5: 모델 구현**

`lib/core/cards/card_def.dart`:

```dart
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
    required this.unlockCourseSlug,
    required this.unlockSectionOrd,
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

  final String unlockCourseSlug;
  final int unlockSectionOrd;

  factory CardDef.fromJson(Map<String, dynamic> json) {
    final unlock = json['unlock'] as Map<String, dynamic>;
    return CardDef(
      id: json['id'] as String,
      name: json['name'] as String,
      nameEn: json['name_en'] as String? ?? '',
      kind: json['kind'] as String? ?? 'animal',
      description: json['description'] as String? ?? '',
      descriptionEn: json['description_en'] as String? ?? '',
      image: json['image'] as String? ?? '',
      unlockCourseSlug: unlock['courseSlug'] as String,
      unlockSectionOrd: unlock['sectionOrd'] as int,
    );
  }
}

String cardNameFor(CardDef c, String locale) =>
    locale == 'en' && c.nameEn.isNotEmpty ? c.nameEn : c.name;

String cardDescriptionFor(CardDef c, String locale) =>
    locale == 'en' && c.descriptionEn.isNotEmpty ? c.descriptionEn : c.description;
```

- [ ] **Step 6: 카탈로그 로더 구현**

`lib/core/cards/card_catalog.dart`:

```dart
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import 'card_def.dart';

/// 번들 에셋에서 카드 카탈로그를 읽는다. 항목 하나가 깨져도 앱이 죽지 않도록
/// 그 항목만 건너뛴다 — 카탈로그는 사람이 계속 손으로 고치는 파일이다.
class CardCatalog {
  static Future<List<CardDef>> load() async {
    final raw = await rootBundle.loadString('assets/cards/cards.json');
    final list = jsonDecode(raw) as List<dynamic>;
    final cards = <CardDef>[];
    for (final item in list) {
      try {
        cards.add(CardDef.fromJson(item as Map<String, dynamic>));
      } catch (_) {
        // 잘못된 항목은 건너뛴다(오타 하나로 도감 전체가 막히면 안 된다).
      }
    }
    return cards;
  }
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `flutter test test/card_catalog_test.dart`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add assets/cards/cards.json pubspec.yaml lib/core/cards/card_def.dart lib/core/cards/card_catalog.dart test/card_catalog_test.dart
git commit -m "feat(cards): 카드 카탈로그 데이터 + 모델 + 로더"
```

---

### Task 2: 해금 판정 + 뒤집기 기록

**Files:**
- Create: `lib/core/cards/card_repository.dart`
- Modify: `lib/core/settings/app_settings_repository.dart`
- Test: `test/card_repository_test.dart`

**Interfaces:**
- Consumes: `CardDef`(Task 1), `AppDatabase`, `AppSettingsRepository`.
- Produces:
  - `AppSettingsRepository.revealedCardsKey` (`'revealed_cards'`, 콤마로 이은 카드 id 목록)
  - `class CardRepository { CardRepository(AppDatabase db, AppSettingsRepository settings); }`
  - `Future<Set<int>> completedSectionIds()` — 모든 절이 cleared인 섹션 id 집합.
  - `Future<List<CardDef>> unlockedCards(List<CardDef> catalog)` — 해금된 카드만, 카탈로그 순서 유지.
  - `Future<CardDef?> cardForSection(List<CardDef> catalog, int sectionId)` — 그 섹션에 매핑된 카드(없으면 null).
  - `Future<bool> isRevealed(String cardId)` / `Future<void> markRevealed(String cardId)`

- [ ] **Step 1: 공개 기록 키 추가**

`lib/core/settings/app_settings_repository.dart`의 키 상수들 아래에 추가:

```dart
  static const revealedCardsKey = 'revealed_cards'; // 뒤집기를 이미 본 카드 id, 콤마 구분
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/card_repository_test.dart`:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/core/cards/card_repository.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/settings/app_settings_repository.dart';

CardDef _card(String id, String slug, int ord) => CardDef(
      id: id,
      name: id,
      nameEn: id,
      kind: 'animal',
      description: '',
      descriptionEn: '',
      image: '',
      unlockCourseSlug: slug,
      unlockSectionOrd: ord,
    );

void main() {
  late AppDatabase db;
  late CardRepository repo;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = CardRepository(db, AppSettingsRepository(db));
  });
  tearDown(() => db.close());

  /// 코스(slug) 1개 + 섹션(ord) 1개 + 그 안의 절 n개를 심는다.
  Future<void> seedSection({
    required int courseId,
    required String slug,
    required int sectionId,
    required int ord,
    required int itemCount,
  }) async {
    await db.into(db.courses).insertOnConflictUpdate(CoursesCompanion.insert(
        id: Value(courseId), slug: slug, title: slug, ord: 0, category: 'ot'));
    await db.into(db.sections).insertOnConflictUpdate(SectionsCompanion.insert(
        id: Value(sectionId), courseId: courseId, title: 's', ord: ord));
    for (var i = 0; i < itemCount; i++) {
      await db.into(db.courseItems).insertOnConflictUpdate(CourseItemsCompanion.insert(
          id: Value(sectionId * 1000 + i),
          courseId: courseId,
          sectionId: Value(sectionId),
          ord: i,
          book: 1,
          chapter: ord,
          verse: i + 1,
          verseText: 'v$i'));
    }
  }

  Future<void> clearItem(int itemId) async {
    await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
        courseItemId: Value(itemId), grade: 'green', cleared: const Value(true), updatedAt: DateTime.now()));
  }

  test('모든 절을 외운 섹션만 완주로 친다', () async {
    await seedSection(courseId: 1, slug: 'gen', sectionId: 11, ord: 8, itemCount: 2);
    await clearItem(11000); // 2개 중 1개만

    expect(await repo.completedSectionIds(), isEmpty);

    await clearItem(11001);
    expect(await repo.completedSectionIds(), {11});
  });

  test('해금된 카드만 반환한다', () async {
    await seedSection(courseId: 1, slug: 'gen', sectionId: 11, ord: 8, itemCount: 1);
    await seedSection(courseId: 1, slug: 'gen', sectionId: 12, ord: 6, itemCount: 1);
    await clearItem(11000); // ord 8만 완주

    final catalog = [_card('dove', 'gen', 8), _card('ark', 'gen', 6)];
    final unlocked = await repo.unlockedCards(catalog);

    expect(unlocked.map((c) => c.id), ['dove']);
  });

  test('매핑이 없는 섹션은 카드가 없다', () async {
    await seedSection(courseId: 1, slug: 'gen', sectionId: 11, ord: 8, itemCount: 1);
    final catalog = [_card('dove', 'gen', 8)];

    expect((await repo.cardForSection(catalog, 11))!.id, 'dove');
    expect(await repo.cardForSection(catalog, 999), isNull);
  });

  test('뒤집기 기록은 카드별로 누적된다', () async {
    expect(await repo.isRevealed('dove'), isFalse);
    await repo.markRevealed('dove');
    expect(await repo.isRevealed('dove'), isTrue);
    expect(await repo.isRevealed('ark'), isFalse);

    await repo.markRevealed('ark');
    expect(await repo.isRevealed('dove'), isTrue);
    expect(await repo.isRevealed('ark'), isTrue);
  });
}
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_repository_test.dart`
Expected: FAIL — `CardRepository` 미정의.

- [ ] **Step 4: 리포지토리 구현**

`lib/core/cards/card_repository.dart`:

```dart
import 'package:drift/drift.dart';

import '../db/app_database.dart';
import '../settings/app_settings_repository.dart';
import 'card_def.dart';

/// 카드 해금 판정. 새 테이블 없이 기존 진행도에서 파생한다 —
/// "그 섹션의 모든 절을 외웠는가"가 곧 해금 조건이다.
class CardRepository {
  CardRepository(this._db, this._settings);

  final AppDatabase _db;
  final AppSettingsRepository _settings;

  /// 모든 절이 cleared인 섹션 id 집합. 절이 하나도 없는 섹션은 제외한다.
  Future<Set<int>> completedSectionIds() async {
    final rows = await (_db.select(_db.courseItems).join([
      leftOuterJoin(_db.progress, _db.progress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(_db.courseItems.sectionId.isNotNull()))
        .get();

    final total = <int, int>{};
    final cleared = <int, int>{};
    for (final r in rows) {
      final sectionId = r.readTable(_db.courseItems).sectionId!;
      total[sectionId] = (total[sectionId] ?? 0) + 1;
      if (r.readTableOrNull(_db.progress)?.cleared ?? false) {
        cleared[sectionId] = (cleared[sectionId] ?? 0) + 1;
      }
    }
    return {
      for (final e in total.entries)
        if ((cleared[e.key] ?? 0) >= e.value) e.key,
    };
  }

  /// 카탈로그에서 해금된 카드만 골라 원래 순서대로 반환한다.
  Future<List<CardDef>> unlockedCards(List<CardDef> catalog) async {
    final done = await completedSectionIds();
    final byKey = await _sectionIdByCardKey(catalog);
    return [
      for (final c in catalog)
        if (done.contains(byKey['${c.unlockCourseSlug}#${c.unlockSectionOrd}'])) c,
    ];
  }

  /// 그 섹션에 매핑된 카드(없으면 null).
  Future<CardDef?> cardForSection(List<CardDef> catalog, int sectionId) async {
    final byKey = await _sectionIdByCardKey(catalog);
    for (final c in catalog) {
      if (byKey['${c.unlockCourseSlug}#${c.unlockSectionOrd}'] == sectionId) return c;
    }
    return null;
  }

  /// 'slug#ord' → sectionId. 카탈로그가 가리키는 조합만 조회한다.
  Future<Map<String, int>> _sectionIdByCardKey(List<CardDef> catalog) async {
    final slugs = catalog.map((c) => c.unlockCourseSlug).toSet();
    if (slugs.isEmpty) return {};

    final courses =
        await (_db.select(_db.courses)..where((t) => t.slug.isIn(slugs))).get();
    final courseIdBySlug = {for (final c in courses) c.slug: c.id};
    if (courseIdBySlug.isEmpty) return {};

    final sections = await (_db.select(_db.sections)
          ..where((t) => t.courseId.isIn(courseIdBySlug.values)))
        .get();
    final slugByCourseId = {for (final e in courseIdBySlug.entries) e.value: e.key};

    return {
      for (final s in sections)
        if (slugByCourseId.containsKey(s.courseId)) '${slugByCourseId[s.courseId]}#${s.ord}': s.id,
    };
  }

  Future<Set<String>> _revealed() async {
    final raw = await _settings.read(AppSettingsRepository.revealedCardsKey) ?? '';
    return raw.split(',').where((s) => s.isNotEmpty).toSet();
  }

  Future<bool> isRevealed(String cardId) async => (await _revealed()).contains(cardId);

  Future<void> markRevealed(String cardId) async {
    // `await _revealed()..add(...)` 형태는 캐스케이드 대상이 헷갈리므로 두 줄로 나눈다.
    final set = await _revealed();
    set.add(cardId);
    await _settings.write(AppSettingsRepository.revealedCardsKey, set.join(','));
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `flutter test test/card_repository_test.dart`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/core/cards/card_repository.dart lib/core/settings/app_settings_repository.dart test/card_repository_test.dart
git commit -m "feat(cards): 섹션 완주 기반 해금 판정 + 뒤집기 기록"
```

---

### Task 3: 도감 갤러리 화면

**Files:**
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Generated: `lib/l10n/app_localizations*.dart`
- Create: `lib/features/cards/card_tile.dart`
- Create: `lib/features/cards/card_detail_sheet.dart`
- Modify: `lib/features/cards/card_collection_screen.dart`
- Modify: `lib/app/providers.dart`
- Test: `test/card_collection_screen_test.dart` (기존 파일 교체)

**Interfaces:**
- Consumes: `CardCatalog.load()`, `CardRepository.unlockedCards`, `cardNameFor`, `cardDescriptionFor`.
- Produces:
  - `final cardCatalogProvider = FutureProvider<List<CardDef>>(...)`
  - `final cardRepositoryProvider = Provider<CardRepository>(...)`
  - `final unlockedCardsProvider = FutureProvider.autoDispose<List<CardDef>>(...)`
  - `class CardTile extends StatelessWidget` — 필드 `CardDef card`, `String locale`, `VoidCallback? onTap`.
  - `void showCardDetail(BuildContext context, CardDef card, String locale)`
  - l10n `cardsEmptyBody`.

- [ ] **Step 1: arb 키 추가**

`lib/l10n/app_ko.arb`에 추가:

```json
  "cardsEmptyBody": "섹션을 완성하면 카드가 모여요"
```

`lib/l10n/app_en.arb`에 추가:

```json
  "cardsEmptyBody": "Complete a section to collect cards"
```

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
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/features/cards/card_collection_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

CardDef _card(String id, String name, String slug, int ord) => CardDef(
      id: id,
      name: name,
      nameEn: name,
      kind: 'animal',
      description: '설명 $name',
      descriptionEn: 'desc $name',
      image: '',
      unlockCourseSlug: slug,
      unlockSectionOrd: ord,
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

Future<void> _seedCompletedSection(AppDatabase db) async {
  await db.into(db.courses).insertOnConflictUpdate(CoursesCompanion.insert(
      id: const Value(1), slug: 'gen', title: 'gen', ord: 0, category: 'ot'));
  await db.into(db.sections).insertOnConflictUpdate(SectionsCompanion.insert(
      id: const Value(11), courseId: 1, title: 's', ord: 8));
  await db.into(db.courseItems).insertOnConflictUpdate(CourseItemsCompanion.insert(
      id: const Value(1100), courseId: 1, sectionId: const Value(11), ord: 0,
      book: 1, chapter: 8, verse: 1, verseText: 'v'));
  await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
      courseItemId: const Value(1100), grade: 'green', cleared: const Value(true), updatedAt: DateTime.now()));
}

void main() {
  testWidgets('해금된 카드가 없으면 안내 문구를 보여준다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(_wrap(db, [_card('dove', '비둘기', 'gen', 8)]));
    await tester.pumpAndSettle();

    expect(find.text('섹션을 완성하면 카드가 모여요'), findsOneWidget);
    expect(find.text('비둘기'), findsNothing);
  });

  testWidgets('해금된 카드만 그리드에 뜨고 잠긴 카드는 없다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await _seedCompletedSection(db);

    await tester.pumpWidget(_wrap(db, [
      _card('dove', '비둘기', 'gen', 8), // 해금
      _card('ark', '방주', 'gen', 6), // 잠김
    ]));
    await tester.pumpAndSettle();

    expect(find.text('비둘기'), findsOneWidget);
    expect(find.text('방주'), findsNothing); // 잠긴 카드는 화면에 없다
  });

  testWidgets('카드를 탭하면 상세에 설명이 뜬다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await _seedCompletedSection(db);

    await tester.pumpWidget(_wrap(db, [_card('dove', '비둘기', 'gen', 8)]));
    await tester.pumpAndSettle();

    await tester.tap(find.text('비둘기'));
    await tester.pumpAndSettle();

    expect(find.text('설명 비둘기'), findsOneWidget);
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_collection_screen_test.dart`
Expected: FAIL — `cardCatalogProvider` 미정의.

- [ ] **Step 5: 프로바이더 추가**

`lib/app/providers.dart` import에 추가:

```dart
import '../core/cards/card_catalog.dart';
import '../core/cards/card_def.dart';
import '../core/cards/card_repository.dart';
```

파일 하단에 추가:

```dart
/// 카드 카탈로그(번들 JSON). 테스트에서 override 하기 쉽도록 프로바이더로 감싼다.
final cardCatalogProvider = FutureProvider<List<CardDef>>((ref) => CardCatalog.load());

final cardRepositoryProvider = Provider<CardRepository>(
  (ref) => CardRepository(ref.watch(databaseProvider), ref.watch(appSettingsRepositoryProvider)),
);

/// 도감에 보여줄 카드 = 해금된 것만(잠긴 카드는 노출하지 않는다).
final unlockedCardsProvider = FutureProvider.autoDispose<List<CardDef>>((ref) async {
  final catalog = await ref.watch(cardCatalogProvider.future);
  return ref.watch(cardRepositoryProvider).unlockedCards(catalog);
});
```

- [ ] **Step 6: 카드 타일 구현**

`lib/features/cards/card_tile.dart`:

```dart
import 'package:flutter/material.dart';

import '../../core/cards/card_def.dart';

/// 도감 그리드의 카드 한 칸. 아트가 아직 없으면(image가 비었으면)
/// 이름 첫 글자 + 종류별 색 타일로 대체 렌더한다 — 아트가 생기면 파일만 넣으면 된다.
class CardTile extends StatelessWidget {
  const CardTile({super.key, required this.card, required this.locale, this.onTap});

  final CardDef card;
  final String locale;
  final VoidCallback? onTap;

  Color get _tint => card.kind == 'figure' ? const Color(0xFF7C6BAF) : const Color(0xFF4F8A5B);

  @override
  Widget build(BuildContext context) {
    final name = cardNameFor(card, locale);
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(color: _tint, borderRadius: BorderRadius.circular(6)),
              alignment: Alignment.center,
              child: card.image.isEmpty
                  ? Text(
                      // characters 패키지 import를 피하려고 substring을 쓴다(한글 1글자는 BMP라 안전).
                      name.isEmpty ? '?' : name.substring(0, 1),
                      style: const TextStyle(fontSize: 32, color: Colors.white, fontWeight: FontWeight.bold),
                    )
                  : Image.asset('assets/cards/art/${card.image}', fit: BoxFit.contain),
            ),
          ),
          const SizedBox(height: 6),
          Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
```

- [ ] **Step 7: 카드 상세 구현**

`lib/features/cards/card_detail_sheet.dart`:

```dart
import 'package:flutter/material.dart';

import '../../core/cards/card_def.dart';
import 'card_tile.dart';

/// 카드 상세 — 그림 · 이름 · 설명. 바텀시트로 띄운다.
void showCardDetail(BuildContext context, CardDef card, String locale) {
  showModalBottomSheet<void>(
    context: context,
    builder: (context) => Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 120,
            child: CardTile(card: card, locale: locale),
          ),
          const SizedBox(height: 16),
          Text(cardNameFor(card, locale), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(cardDescriptionFor(card, locale), textAlign: TextAlign.center),
        ],
      ),
    ),
  );
}
```

- [ ] **Step 8: 도감 화면 교체**

`lib/features/cards/card_collection_screen.dart` 전체를 아래로 교체한다:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/widgets/mascot_sprite.dart';
import 'card_detail_sheet.dart';
import 'card_tile.dart';

/// 카드 도감. 해금된 카드만 보여준다 — 잠긴 카드도, 수집 카운터도 두지 않는다.
/// 수집을 재촉하는 장치 대신 모은 것을 되돌아보는 공간으로 둔다.
class CardCollectionScreen extends ConsumerWidget {
  const CardCollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final cardsAsync = ref.watch(unlockedCardsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.navCards)),
      body: cardsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (cards) {
          if (cards.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const MascotSprite(mood: MascotMood.idle, size: 96),
                  const SizedBox(height: 16),
                  Text(l.cardsEmptyBody, style: Theme.of(context).textTheme.titleMedium),
                ],
              ),
            );
          }
          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.8,
            ),
            itemCount: cards.length,
            itemBuilder: (context, i) => CardTile(
              card: cards[i],
              locale: locale,
              onTap: () => showCardDetail(context, cards[i], locale),
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `flutter test test/card_collection_screen_test.dart`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add lib/l10n/ lib/features/cards/ lib/app/providers.dart test/card_collection_screen_test.dart
git commit -m "feat(cards): 도감 갤러리 — 해금 카드만, 카운터 없음"
```

---

### Task 4: 섹션 완료 뒤집기 공개

**Files:**
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Generated: `lib/l10n/app_localizations*.dart`
- Create: `lib/features/cards/card_flip.dart`
- Modify: `lib/features/courses/section_complete_screen.dart`
- Test: `test/card_flip_test.dart`

**Interfaces:**
- Consumes: `CardRepository.cardForSection/isRevealed/markRevealed`, `CardTile`, `cardCatalogProvider`.
- Produces:
  - `class CardFlip extends StatefulWidget` — 필드 `CardDef card`, `String locale`, `VoidCallback onRevealed`.
  - `final sectionCardProvider = FutureProvider.autoDispose.family<CardDef?, int>(...)` — 아직 공개하지 않은 그 섹션의 카드(없거나 이미 공개했으면 null).
  - l10n `cardsNewCard`, `cardsTapToFlip`.

- [ ] **Step 1: arb 키 추가**

`lib/l10n/app_ko.arb`에 추가:

```json
  "cardsNewCard": "새 카드!",
  "cardsTapToFlip": "탭해서 뒤집기"
```

`lib/l10n/app_en.arb`에 추가:

```json
  "cardsNewCard": "New card!",
  "cardsTapToFlip": "Tap to flip"
```

- [ ] **Step 2: l10n 재생성**

Run: `flutter gen-l10n`
Expected: 에러 없음.

- [ ] **Step 3: 실패하는 위젯 테스트 작성**

`test/card_flip_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/features/cards/card_flip.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

const _dove = CardDef(
  id: 'dove',
  name: '비둘기',
  nameEn: 'Dove',
  kind: 'animal',
  description: '홍수가 끝났음을 알린 새.',
  descriptionEn: 'The bird.',
  image: '',
  unlockCourseSlug: 'gen',
  unlockSectionOrd: 8,
);

Widget _wrap(VoidCallback onRevealed) => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Scaffold(
        body: Center(child: CardFlip(card: _dove, locale: 'ko', onRevealed: onRevealed)),
      ),
    );

void main() {
  testWidgets('처음엔 뒷면(안내 문구)만 보이고 이름은 가려져 있다', (tester) async {
    await tester.pumpWidget(_wrap(() {}));
    await tester.pumpAndSettle();

    expect(find.text('탭해서 뒤집기'), findsOneWidget);
    expect(find.text('비둘기'), findsNothing);
  });

  testWidgets('탭하면 앞면이 공개되고 콜백이 불린다', (tester) async {
    var revealed = 0;
    await tester.pumpWidget(_wrap(() => revealed++));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(CardFlip));
    await tester.pumpAndSettle();

    expect(find.text('비둘기'), findsOneWidget);
    expect(find.text('탭해서 뒤집기'), findsNothing);
    expect(revealed, 1);
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/card_flip_test.dart`
Expected: FAIL — `CardFlip` 미정의.

- [ ] **Step 5: 뒤집기 위젯 구현**

`lib/features/cards/card_flip.dart`:

```dart
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/cards/card_def.dart';
import '../../l10n/app_localizations.dart';
import 'card_tile.dart';

/// 카드 획득 연출. 뒷면으로 시작하고, 사용자가 탭하면 뒤집혀 앞면이 공개된다.
/// 확정 보상이라 무작위성은 없지만 "내가 뒤집는 행위"가 기대감을 만든다.
class CardFlip extends StatefulWidget {
  const CardFlip({super.key, required this.card, required this.locale, required this.onRevealed});

  final CardDef card;
  final String locale;
  final VoidCallback onRevealed;

  @override
  State<CardFlip> createState() => _CardFlipState();
}

class _CardFlipState extends State<CardFlip> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
  bool _revealed = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _flip() async {
    if (_revealed) return;
    setState(() => _revealed = true);
    widget.onRevealed();
    await _controller.forward();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return GestureDetector(
      onTap: _flip,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          // 0 → 0.5는 뒷면이 접히고, 0.5 → 1은 앞면이 펴진다.
          final t = _controller.value;
          final angle = t * math.pi;
          final showFront = t >= 0.5;
          return Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()..setEntry(3, 2, 0.001)..rotateY(angle),
            child: showFront
                // 뒤집힌 뒤 앞면이 거울상이 되지 않도록 한 번 더 뒤집는다.
                ? Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()..rotateY(math.pi),
                    child: SizedBox(
                      width: 140,
                      child: CardTile(card: widget.card, locale: widget.locale),
                    ),
                  )
                : _back(context, l),
          );
        },
      ),
    );
  }

  Widget _back(BuildContext context, AppLocalizations l) {
    return SizedBox(
      width: 140,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFF2E2A3B),
                borderRadius: BorderRadius.circular(6),
              ),
              alignment: Alignment.center,
              child: const Text('?', style: TextStyle(fontSize: 40, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 6),
          Text(l.cardsTapToFlip, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/card_flip_test.dart`
Expected: PASS

- [ ] **Step 7: 섹션 카드 프로바이더 추가**

`lib/app/providers.dart` 하단에 추가:

```dart
/// 그 섹션에서 새로 얻는 카드. 매핑이 없거나 이미 뒤집어 본 카드면 null이다
/// (같은 완료 화면에 다시 들어와도 연출이 반복되지 않는다).
final sectionCardProvider = FutureProvider.autoDispose.family<CardDef?, int>((ref, sectionId) async {
  final catalog = await ref.watch(cardCatalogProvider.future);
  final repo = ref.watch(cardRepositoryProvider);
  final card = await repo.cardForSection(catalog, sectionId);
  if (card == null) return null;
  return await repo.isRevealed(card.id) ? null : card;
});
```

- [ ] **Step 8: 섹션 완료 화면에 뒤집기 삽입**

`lib/features/courses/section_complete_screen.dart` import에 추가:

```dart
import '../cards/card_flip.dart';
```

`build`의 Column에서 축하 문구 아래(`const SizedBox(height: 40),` 바로 앞)에 카드 블록을 넣는다.
기존 코드:

```dart
            Text(l.completeSectionComplete,
                style: TextStyle(fontSize: 24, color: p.green)),
            const SizedBox(height: 40),
```

교체 후:

```dart
            Text(l.completeSectionComplete,
                style: TextStyle(fontSize: 24, color: p.green)),
            // 이 섹션에서 새로 얻는 카드가 있으면 뒤집어 공개한다.
            ref.watch(sectionCardProvider(sectionId)).maybeWhen(
                  data: (card) => card == null
                      ? const SizedBox(height: 40)
                      : Padding(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          child: Column(
                            children: [
                              Text(l.cardsNewCard, style: TextStyle(fontSize: 16, color: p.yellow)),
                              const SizedBox(height: 12),
                              CardFlip(
                                card: card,
                                locale: locale,
                                onRevealed: () {
                                  ref.read(cardRepositoryProvider).markRevealed(card.id);
                                  ref.invalidate(unlockedCardsProvider);
                                },
                              ),
                            ],
                          ),
                        ),
                  orElse: () => const SizedBox(height: 40),
                ),
```

- [ ] **Step 9: 전체 테스트 + 분석**

Run: `flutter test`
Expected: 전체 PASS.

Run: `flutter analyze`
Expected: 신규 코드 무경고.

- [ ] **Step 10: 수동 검증**

Run: `flutter run`
확인:
1. `카드` 탭 → 아직 해금이 없으면 Shaun + "섹션을 완성하면 카드가 모여요".
2. 창세기 8장 섹션을 전부 외우고 완료 화면 진입 → **"새 카드!" + 뒷면 카드** 등장.
3. 탭 → **뒤집히며 "비둘기" 공개**.
4. `카드` 탭 → 비둘기가 그리드에 있고, 탭하면 설명이 뜬다. **잠긴 카드·카운터는 없다.**
5. 같은 섹션 완료 화면에 다시 들어가도 **뒤집기가 다시 뜨지 않는다**.

- [ ] **Step 11: 커밋**

```bash
git add lib/l10n/ lib/features/cards/card_flip.dart lib/features/courses/section_complete_screen.dart lib/app/providers.dart test/card_flip_test.dart
git commit -m "feat(cards): 섹션 완료 시 카드 뒤집기 공개"
```

---

## 완료 기준

- [ ] 카드 목록이 `assets/cards/cards.json`에만 있고, 카드 추가에 Dart 수정이 필요 없다.
- [ ] 섹션의 모든 절을 외우면 그 섹션에 매핑된 카드가 해금된다.
- [ ] 섹션 완료 화면에서 새 카드를 탭해 뒤집어 공개하고, 다시 들어가면 반복되지 않는다.
- [ ] 도감에 **해금된 카드만** 뜨고, **잠긴 카드·수집 카운터가 없다**.
- [ ] 해금이 0장이면 안내 문구가 뜬다.
- [ ] `image`가 빈 카드도 첫 글자 타일로 크래시 없이 렌더된다.
- [ ] 새 drift 테이블 0개.
- [ ] `flutter test` 전체 통과, `flutter analyze` 신규 코드 무경고.

## 이 계획에 포함되지 않은 것

- 실제 카드 아트 제작 — 플레이스홀더까지만. `assets/cards/art/`에 파일을 넣고 `image`를 채우면 교체된다.
- 카드 공유 이미지, 서버 카탈로그 원격 갱신, 가챠·재화·중복 교환 — 스펙 §9 범위 밖.
- 카드 목록 확정 — 6장은 시작 세트이고, 카탈로그는 계속 업데이트된다.

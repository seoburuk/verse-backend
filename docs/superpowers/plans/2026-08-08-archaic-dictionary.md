# KJV 고어 사전 (암송 결과 화면) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 암송 결과 화면에서 구절의 고어 단어를 탭하면 뜻(현대영어/영영/한글) 바텀시트를 보여준다.

**Architecture:** 고빈도 KJV 고어 약 300개를 정적 에셋 JSON으로 번들하고, `ArchaicDictionary`가 메모리 Map으로 로드·조회한다. 기존 `_MissedWordsCard`(결과 화면 구절 카드)를 초록 결과에도 노출하고 각 단어를 탭 가능하게 만든다.

**Tech Stack:** Flutter, Riverpod(기존 `FutureProvider`/`Provider` 패턴), rootBundle 에셋, flutter_test.

**Spec:** `docs/superpowers/specs/2026-08-08-archaic-dictionary-design.md`

## Global Constraints

- 사전 데이터 3필드(`modern`/`en`/`ko`) 모두 필수 — 필드 누락 항목은 로드 시 버린다(부분 렌더링 금지)
- 사전에 등재된 단어만 탭에 반응한다 (미등재 단어는 GestureDetector 자체를 안 붙임)
- 사전 로드 실패 시 빈 사전으로 동작 — 결과 화면은 항상 정상 렌더링
- 어미 변형 추론 금지 — 변형(hath/hast/doth/dost …)은 각각 표제어로 등재
- UI는 픽셀 팔레트 준수: `context.pixel`의 `p.surface` 배경, 2px `p.border`
- 새 사용자 노출 문자열은 `lib/l10n/app_en.arb` + `app_ko.arb` 양쪽에 추가
- 기존 오답 표시(빨강+실선 밑줄)는 그대로 유지, 사전 어포던스보다 우선
- 모든 커밋 메시지는 기존 관례대로 한국어 + conventional prefix

## File Structure

- Create: `scripts/extract_archaic_candidates.py` — 일회성 빈도 추출 (앱 빌드와 무관)
- Create: `assets/dictionary/archaic_kjv.json` — 사전 데이터 (진실의 원천)
- Create: `lib/core/dictionary/archaic_dictionary.dart` — 로드 + 조회
- Modify: `lib/app/providers.dart` — provider 등록
- Modify: `pubspec.yaml` — 에셋 등록
- Modify: `lib/features/memorize/memorize_screen.dart` — 카드 초록 노출 + 탭 + 바텀시트
- Modify: `lib/l10n/app_en.arb`, `lib/l10n/app_ko.arb`
- Test: `test/archaic_dictionary_test.dart`, `test/archaic_dictionary_data_test.dart`, `test/memorize_result_dictionary_test.dart`

---

### Task 1: 고어 후보 추출 스크립트 + 사전 데이터 생성

**Files:**
- Create: `scripts/extract_archaic_candidates.py`
- Create: `assets/dictionary/archaic_kjv.json`

**Interfaces:**
- Produces: `assets/dictionary/archaic_kjv.json` — `{ "<소문자 표제어>": { "modern": str, "en": str, "ko": str } }` 형태의 단일 JSON 객체. 이후 모든 Task가 이 스키마에 의존한다.

- [ ] **Step 1: KJV 전문 확보**

프로젝트 구터베르그 PD 텍스트를 스크래치패드에 받는다 (KJV 전문, 퍼블릭 도메인):

```bash
curl -sL https://www.gutenberg.org/cache/epub/10/pg10.txt -o /tmp/kjv_pd.txt
wc -l /tmp/kjv_pd.txt
```

Expected: 10만 줄 내외 텍스트. (다운로드 불가 시 백엔드 `bible_verses` 테이블 export로 대체 — 어느 쪽이든 빈도 순위만 쓰므로 결과 차이는 무시 가능.)

- [ ] **Step 2: 빈도 추출 스크립트 작성**

`scripts/extract_archaic_candidates.py`:

```python
#!/usr/bin/env python3
"""KJV 전문에서 토큰 빈도를 뽑아 고어 후보를 빈도순으로 출력한다.

일회성 스크립트 — 산출물인 assets/dictionary/archaic_kjv.json이 진실의 원천이며
이 스크립트는 앱 빌드/런타임과 무관하다.

사용법: python3 scripts/extract_archaic_candidates.py /tmp/kjv_pd.txt > /tmp/candidates.txt
"""
import re
import sys
from collections import Counter

# 현대 영어 기본 어휘(고어가 아닌 것)를 거르기 위한 대략적 판별:
# 고어 특유의 형태 패턴 + 알려진 고어 기능어 목록.
ARCHAIC_SUFFIXES = ("eth", "est")  # doeth, sayest ...
KNOWN_ARCHAIC = {
    "thee", "thou", "thy", "thine", "ye", "hath", "hast", "doth", "dost",
    "shalt", "wilt", "art", "wast", "wert", "unto", "thereof", "wherefore",
    "whence", "thence", "hence", "hither", "thither", "whither", "howbeit",
    "peradventure", "verily", "behold", "begat", "spake", "brake", "bare",
    "gat", "sware", "shew", "shewed", "saith", "yea", "nay", "whosoever",
    "whatsoever", "wherein", "whereby", "wherewith", "therein", "thereby",
    "hereafter", "heretofore", "aforetime", "betwixt", "twain", "ere",
    "oft", "nought", "naught", "wot", "wist", "trow", "hearken", "beseech",
    "sojourn", "raiment", "victuals", "kine", "firmament", "concupiscence",
}

def main(path: str) -> None:
    text = open(path, encoding="utf-8").read().lower()
    tokens = re.findall(r"[a-z]+", text)
    freq = Counter(tokens)
    candidates = []
    for word, n in freq.most_common():
        if word in KNOWN_ARCHAIC or (
            len(word) > 4 and word.endswith(ARCHAIC_SUFFIXES)
        ):
            candidates.append((word, n))
    for word, n in candidates:
        print(f"{n}\t{word}")

if __name__ == "__main__":
    main(sys.argv[1])
```

- [ ] **Step 3: 후보 목록 생성 및 상위 선별**

```bash
python3 scripts/extract_archaic_candidates.py /tmp/kjv_pd.txt > /tmp/candidates.txt
head -50 /tmp/candidates.txt
wc -l /tmp/candidates.txt
```

Expected: 빈도 내림차순 `빈도\t단어` 목록. `-eth/-est` 패턴이 물어온 오탐(예: "harvest", "priest", "forest" 같은 일반 단어)을 눈으로 걸러내며 상위 약 300개를 고른다. 이 선별 판단은 구현자가 직접 한다.

- [ ] **Step 4: 300개 항목 3필드 생성 → `assets/dictionary/archaic_kjv.json`**

선별한 각 표제어에 대해 아래 스키마로 JSON을 작성한다 (구현자가 AI 지식으로 직접 작성하되, KJV 용례 기준 의미로):

```json
{
  "hath": {
    "modern": "has",
    "en": "third-person singular present of \"have\"",
    "ko": "가지다·~했다 (have의 3인칭 단수 고어형)"
  },
  "thee": {
    "modern": "you (object)",
    "en": "objective case of \"thou\"; you (singular)",
    "ko": "너를·너에게 (2인칭 단수 목적격)"
  },
  "saith": {
    "modern": "says",
    "en": "third-person singular present of \"say\"",
    "ko": "말하다 (say의 3인칭 단수 고어형)"
  }
}
```

규칙:
- 키는 소문자, 변형은 각각 별도 표제어 (hath/hast/hath 각각)
- `modern`은 짧은 대응어, `en`은 한 문장 영영 정의, `ko`는 한 문장 한글 설명
- 세 필드 모두 비어 있으면 안 됨

검증:

```bash
python3 -c "
import json
d = json.load(open('assets/dictionary/archaic_kjv.json'))
assert all(k == k.lower() for k in d), 'lowercase keys'
assert all(v['modern'] and v['en'] and v['ko'] for v in d.values()), 'all fields'
print(len(d), 'entries OK')
"
```

Expected: `~300 entries OK`

- [ ] **Step 5: 커밋**

```bash
git add scripts/extract_archaic_candidates.py assets/dictionary/archaic_kjv.json
git commit -m "feat: KJV 고어 사전 데이터 300항목 + 추출 스크립트"
```

> **사람 검수 게이트:** 이 JSON은 배포 전 사용자가 300줄 전수 검수한다. 검수는 개발과 병렬로 진행 — 이후 Task는 계속 진행한다.

---

### Task 2: 에셋 등록 + 데이터 무결성 테스트

**Files:**
- Modify: `pubspec.yaml` (flutter.assets 목록)
- Test: `test/archaic_dictionary_data_test.dart`

**Interfaces:**
- Consumes: Task 1의 `assets/dictionary/archaic_kjv.json`
- Produces: 번들 에셋 `assets/dictionary/` (rootBundle 경로 `assets/dictionary/archaic_kjv.json`)

- [ ] **Step 1: 무결성 테스트 작성**

`test/archaic_dictionary_data_test.dart`:

```dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 에셋 JSON 자체의 무결성 — 로더를 거치지 않고 파일을 직접 검사한다.
/// (cards_catalog_integrity_test.dart와 같은 접근.)
void main() {
  test('archaic_kjv.json: 모든 항목이 소문자 키와 3필드를 가진다', () {
    final raw = File('assets/dictionary/archaic_kjv.json').readAsStringSync();
    final map = jsonDecode(raw) as Map<String, dynamic>;
    expect(map, isNotEmpty);
    for (final e in map.entries) {
      expect(e.key, e.key.toLowerCase(), reason: '${e.key}: 키는 소문자');
      final v = e.value as Map<String, dynamic>;
      for (final f in ['modern', 'en', 'ko']) {
        expect(v[f], isA<String>(), reason: '${e.key}.$f 누락');
        expect((v[f] as String).trim(), isNotEmpty, reason: '${e.key}.$f 빈 값');
      }
    }
  });
}
```

- [ ] **Step 2: 테스트 실행 → 통과 확인**

```bash
flutter test test/archaic_dictionary_data_test.dart
```

Expected: PASS (Task 1 데이터가 올바르면 바로 통과. 실패하면 데이터를 고친다 — 테스트를 고치지 않는다.)

- [ ] **Step 3: pubspec.yaml 에셋 등록**

`pubspec.yaml`의 `flutter: assets:` 목록(현재 `- assets/courses/` 있는 곳)에 추가:

```yaml
    - assets/dictionary/
```

- [ ] **Step 4: 빌드 확인 및 커밋**

```bash
flutter analyze --no-fatal-infos && flutter test test/archaic_dictionary_data_test.dart
git add pubspec.yaml test/archaic_dictionary_data_test.dart
git commit -m "test: 고어 사전 에셋 등록 + 데이터 무결성 테스트"
```

---

### Task 3: ArchaicDictionary 로더/조회 + provider

**Files:**
- Create: `lib/core/dictionary/archaic_dictionary.dart`
- Modify: `lib/app/providers.dart`
- Test: `test/archaic_dictionary_test.dart`

**Interfaces:**
- Consumes: 에셋 `assets/dictionary/archaic_kjv.json` (Task 2)
- Produces:
  - `class ArchaicEntry { final String word, modern, en, ko; }`
  - `class ArchaicDictionary { ArchaicEntry? lookup(String token); static ArchaicDictionary fromJsonString(String raw); static Future<ArchaicDictionary> loadFromAssets(); }`
  - `final archaicDictionaryProvider = FutureProvider<ArchaicDictionary>` (providers.dart)

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`test/archaic_dictionary_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/dictionary/archaic_dictionary.dart';

void main() {
  const sample = '''
  {
    "hath": {"modern": "has", "en": "third-person of have", "ko": "가지다 (고어)"},
    "broken": {"modern": "x", "en": "", "ko": "필드 하나가 비어 무효"}
  }
  ''';

  group('ArchaicDictionary.lookup', () {
    final dict = ArchaicDictionary.fromJsonString(sample);

    test('소문자 그대로 조회', () {
      expect(dict.lookup('hath')?.modern, 'has');
    });

    test('대문자·앞뒤 구두점 정규화 후 조회', () {
      expect(dict.lookup('Hath')?.modern, 'has');
      expect(dict.lookup('"Hath,')?.modern, 'has');
    });

    test('미등재 단어는 null', () {
      expect(dict.lookup('love'), isNull);
    });

    test('필드가 빈 항목은 로드 시 버려진다', () {
      expect(dict.lookup('broken'), isNull);
    });
  });

  test('깨진 JSON이면 빈 사전', () {
    final dict = ArchaicDictionary.fromJsonString('not json {');
    expect(dict.lookup('hath'), isNull);
    expect(dict.isEmpty, isTrue);
  });
}
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
flutter test test/archaic_dictionary_test.dart
```

Expected: FAIL — `archaic_dictionary.dart` 파일 없음 (URI 에러).

- [ ] **Step 3: 구현**

`lib/core/dictionary/archaic_dictionary.dart`:

```dart
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

/// KJV 고어 단어 하나의 뜻풀이. 세 필드 모두 필수 —
/// 하나라도 비면 로드 시 항목째 버린다(부분 렌더링 금지).
class ArchaicEntry {
  const ArchaicEntry({
    required this.word,
    required this.modern,
    required this.en,
    required this.ko,
  });

  final String word; // 표제어(소문자)
  final String modern; // 현대영어 대응
  final String en; // 영영 정의 한 문장
  final String ko; // 한글 설명 한 문장
}

/// 번들 에셋의 고어 사전. 300개 규모라 메모리 Map 하나로 충분하다.
/// 로드 실패는 빈 사전으로 흡수한다 — 사전이 없어도 암송은 막히면 안 된다.
class ArchaicDictionary {
  ArchaicDictionary._(this._entries);

  final Map<String, ArchaicEntry> _entries;

  bool get isEmpty => _entries.isEmpty;

  static ArchaicDictionary fromJsonString(String raw) {
    final entries = <String, ArchaicEntry>{};
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      for (final e in map.entries) {
        final v = e.value;
        if (v is! Map<String, dynamic>) continue;
        final modern = (v['modern'] as String?)?.trim() ?? '';
        final en = (v['en'] as String?)?.trim() ?? '';
        final ko = (v['ko'] as String?)?.trim() ?? '';
        if (modern.isEmpty || en.isEmpty || ko.isEmpty) continue;
        final word = e.key.toLowerCase();
        entries[word] =
            ArchaicEntry(word: word, modern: modern, en: en, ko: ko);
      }
    } catch (_) {
      entries.clear();
    }
    return ArchaicDictionary._(entries);
  }

  static Future<ArchaicDictionary> loadFromAssets() async {
    try {
      final raw =
          await rootBundle.loadString('assets/dictionary/archaic_kjv.json');
      return ArchaicDictionary.fromJsonString(raw);
    } catch (_) {
      return ArchaicDictionary._({});
    }
  }

  static final RegExp _edgePunct = RegExp(r"^[^a-zA-Z]+|[^a-zA-Z]+$");

  /// 소문자화 + 앞뒤 구두점 제거 후 조회. 어미 변형 추론은 하지 않는다 —
  /// 필요한 변형은 데이터에 표제어로 직접 등재한다.
  ArchaicEntry? lookup(String token) {
    final key = token.replaceAll(_edgePunct, '').toLowerCase();
    if (key.isEmpty) return null;
    return _entries[key];
  }
}
```

- [ ] **Step 4: 실행 → 통과 확인**

```bash
flutter test test/archaic_dictionary_test.dart
```

Expected: PASS (5 tests)

- [ ] **Step 5: provider 등록**

`lib/app/providers.dart`에 import와 provider 추가 (기존 provider들 아래):

```dart
import '../core/dictionary/archaic_dictionary.dart';
```

```dart
/// 고어 사전 — 앱 전역 1회 로드. 로드 전/실패 시 UI는 어포던스를 안 그릴 뿐
/// 결과 화면은 정상 동작한다.
final archaicDictionaryProvider = FutureProvider<ArchaicDictionary>(
    (ref) => ArchaicDictionary.loadFromAssets());
```

- [ ] **Step 6: analyze + 커밋**

```bash
flutter analyze --no-fatal-infos
git add lib/core/dictionary/archaic_dictionary.dart lib/app/providers.dart test/archaic_dictionary_test.dart
git commit -m "feat: ArchaicDictionary 로더·조회 + provider"
```

---

### Task 4: 결과 화면 — 카드 초록 노출 + 단어 탭 + 바텀시트

**Files:**
- Modify: `lib/features/memorize/memorize_screen.dart` (`_ResultView` build ~L947, `_MissedWordsCard` ~L1069)
- Modify: `lib/l10n/app_en.arb`, `lib/l10n/app_ko.arb`
- Test: `test/memorize_result_dictionary_test.dart`

**Interfaces:**
- Consumes: `archaicDictionaryProvider`, `ArchaicDictionary.lookup`, `ArchaicEntry` (Task 3); 기존 `MemorizeState.answerDisplay`, `resultMatchMask`
- Produces: `VerseWordsCard` — `memorize_screen.dart`에 정의하는 공개(top-level) `ConsumerWidget`.
  `VerseWordsCard({required List<String> words, required List<bool> matchMask, required bool showMistakes})`.
  기존 `_MissedWordsCard(state:, l:, p:)` 호출부는 이 위젯의 얇은 래퍼로 남긴다.
  공개로 두는 이유: 위젯 테스트가 `_ResultView` 전체(라우팅·세션·카드승급 상태까지 필요)를
  거치지 않고 이 카드 하나만 독립적으로 마운트해 검증하기 위함 — `card_detail_sheet.dart`의
  `showCardDetail()` 공개 함수 선례와 같은 이유.

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_en.arb`의 `memorizeMissedWordsTitle` (L143 부근) 아래에:

```json
  "memorizeVerseWordsTitle": "The verse — tap a word to see its meaning",
  "dictModernLabel": "Modern English",
  "dictKoLabel": "뜻",
```

`lib/l10n/app_ko.arb` 같은 위치에:

```json
  "memorizeVerseWordsTitle": "구절 — 단어를 누르면 뜻이 보여요",
  "dictModernLabel": "현대 영어",
  "dictKoLabel": "뜻",
```

주의: 사전 항목 내용(modern/en/ko)은 에셋 데이터이며 l10n 대상이 아니다.

```bash
flutter gen-l10n && grep -c "memorizeVerseWordsTitle" lib/l10n/app_localizations_en.dart
```

Expected: `1` 이상

- [ ] **Step 2: 실패하는 위젯 테스트 작성**

`test/memorize_result_dictionary_test.dart` — `card_detail_sheet_test.dart`의 부트스트랩 패턴(직접
`MaterialApp` + `AppLocalizations` delegate)을 따르되, provider가 필요하므로 `ProviderScope`로 감싼다:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/dictionary/archaic_dictionary.dart';
import 'package:verse_flutter/features/memorize/memorize_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

const _sampleDict = '''
{
  "hath": {"modern": "has", "en": "third-person of have", "ko": "가지다 (고어)"}
}
''';

Widget _wrap(Widget child, {String dictJson = _sampleDict}) => ProviderScope(
      overrides: [
        archaicDictionaryProvider.overrideWith(
            (ref) async => ArchaicDictionary.fromJsonString(dictJson)),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('ko'),
        home: Scaffold(body: child),
      ),
    );

void main() {
  testWidgets('showMistakes:false여도 등재 단어는 탭 가능하고 시트에 뜻이 뜬다',
      (tester) async {
    await tester.pumpWidget(_wrap(const VerseWordsCard(
      words: ['In', 'hath', 'love'],
      matchMask: [true, true, true],
      showMistakes: false,
    )));
    await tester.pump(); // FutureProvider 해소

    expect(find.text('구절 — 단어를 누르면 뜻이 보여요'), findsOneWidget);

    await tester.tap(find.text('hath'));
    await tester.pumpAndSettle();
    expect(find.text('has'), findsOneWidget);
  });

  testWidgets('미등재 단어 탭은 아무 시트도 열지 않는다', (tester) async {
    await tester.pumpWidget(_wrap(const VerseWordsCard(
      words: ['In', 'hath', 'love'],
      matchMask: [true, true, true],
      showMistakes: false,
    )));
    await tester.pump();

    await tester.tap(find.text('love'));
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsNothing);
  });

  testWidgets('showMistakes:true면 놓친 단어 제목이 뜨고 오답 표시가 우선한다',
      (tester) async {
    await tester.pumpWidget(_wrap(const VerseWordsCard(
      words: ['In', 'hath', 'love'],
      matchMask: [true, false, true], // hath를 놓친 것으로
      showMistakes: true,
    )));
    await tester.pump();

    expect(find.text('놓친 단어'), findsOneWidget);
    // 오답이면서 등재된 단어도 탭은 여전히 가능해야 한다.
    await tester.tap(find.text('hath'));
    await tester.pumpAndSettle();
    expect(find.text('has'), findsOneWidget);
  });
}
```

- [ ] **Step 3: 실행 → 실패 확인**

```bash
flutter test test/memorize_result_dictionary_test.dart
```

Expected: FAIL — `VerseWordsCard` 없음 (컴파일 에러).

- [ ] **Step 4: `VerseWordsCard` 신설 + `_MissedWordsCard`를 얇은 래퍼로 축소**

`lib/features/memorize/memorize_screen.dart` 수정.

(a) 파일 상단 import에 추가:

```dart
import '../../app/providers.dart';
import '../../core/dictionary/archaic_dictionary.dart';
```

(b) `_ResultView` build의 조건부 렌더(L947 부근)를 초록 포함으로 변경:

```dart
                // 완벽 정답이 아니면 놓친 단어를 빨강+밑줄로, 완벽 정답이면 읽기
                // 전용으로 — 어느 쪽이든 카드를 보여줘야 단어 탭 사전에 닿는다.
                if (widget.state.clientGrade != null) ...[
                  const SizedBox(height: 16),
                  _MissedWordsCard(state: widget.state, showMistakes: !isGreen),
                ],
```

(c) 기존 `_MissedWordsCard` 클래스(L1069~L1110)를 통째로 아래로 교체:

```dart
/// [_ResultView]에서 [MemorizeState]를 꺼내 [VerseWordsCard]에 넘기는 얇은 래퍼.
/// l/p는 VerseWordsCard가 context에서 직접 얻으므로 넘기지 않는다.
class _MissedWordsCard extends StatelessWidget {
  const _MissedWordsCard({required this.state, required this.showMistakes});
  final MemorizeState state;
  final bool showMistakes;

  @override
  Widget build(BuildContext context) => VerseWordsCard(
        words: state.answerDisplay,
        matchMask: state.resultMatchMask,
        showMistakes: showMistakes,
      );
}

/// 결과 화면의 구절 카드. 놓친 단어는 빨강+실선 밑줄([showMistakes]일 때),
/// 고어 사전에 등재된 단어는 점선 밑줄 어포던스 + 탭 시 뜻 바텀시트.
/// 오답이면서 등재된 단어는 오답 표시(빨강 실선)가 우선이고 탭만 살아 있다.
///
/// state 전체가 아니라 [words]/[matchMask]만 받는다 — 이 카드는 결과 화면
/// 밖에서도(위젯 테스트 등) 독립적으로 마운트할 수 있어야 한다.
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
        // 오답(빨강 실선)이 사전 어포던스(점선)보다 우선.
        decoration: missed || entry != null ? TextDecoration.underline : null,
        decorationStyle:
            missed ? TextDecorationStyle.solid : TextDecorationStyle.dotted,
        decorationColor: missed ? p.red : p.muted,
        fontWeight: missed ? FontWeight.bold : null,
      ),
    );
    if (entry == null) return text; // 미등재 단어는 탭 자체가 없다
    return GestureDetector(
      onTap: () => _showEntrySheet(context, l, p, entry),
      child: text,
    );
  }

  void _showEntrySheet(
      BuildContext context, AppLocalizations l, PixelPalette p, ArchaicEntry entry) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: p.surface,
      shape: Border.all(color: p.border, width: 2),
      builder: (_) => SafeArea(
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

주의: 이 클래스는 기존에 `l`/`p`를 생성자로 받았으나 새 버전은 `context`에서 직접
얻는다 — `_ResultView` 호출부(`_MissedWordsCard(state: ..., l: l, p: p)`)에 남아 있던
`l:`/`p:` 인자를 제거해야 한다(위 (b)에서 이미 반영).

- [ ] **Step 5: 테스트 실행 → 통과 확인**

```bash
flutter test test/memorize_result_dictionary_test.dart
```

Expected: PASS (3 tests)

```bash
flutter test test/memorize_controller_test.dart test/memorize_card_upgrades_test.dart
```

Expected: PASS — 기존 동작 무회귀 확인.

- [ ] **Step 6: 전체 테스트 + analyze**

```bash
flutter analyze --no-fatal-infos && flutter test
```

Expected: 전체 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/features/memorize/memorize_screen.dart lib/l10n/ test/memorize_result_dictionary_test.dart
git commit -m "feat: 암송 결과 구절 카드에 고어 사전 탭 + 초록 결과에도 카드 노출"
```

---

### Task 5: 실기기/시뮬레이터 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 시뮬레이터에서 암송 1회 진행**

앱을 시뮬레이터에서 실행해 확인:
1. 일부러 틀리게 제출 → 노랑/빨강 결과에서 카드가 기존처럼 보이고, `unto`·`hath` 류 단어에 점선 밑줄이 보인다
2. 점선 단어 탭 → 바텀시트에 표제어/현대영어/영영/한글이 뜬다
3. 완벽 정답 제출 → 초록 결과에도 카드가 뜨고 제목이 중립 문구다
4. 미등재 단어 탭 → 아무 일도 없다

- [ ] **Step 2: 스크린샷 확보 후 완료 보고**

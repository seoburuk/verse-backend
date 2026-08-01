# 카드 등급 비주얼·승급 연출 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드 도감의 등급(브론즈/실버/골드/레전드) 구분을 정적 프레임 장식으로 강화하고, 골드·레전드 카드는 탭하면 반짝임이 재생되며, 등급이 실제로 오르는 순간에는 인라인 전이(실버·골드) 또는 풀스크린 축하 모달(레전드)로 체감시킨다.

**Architecture:** 전부 기존 `verse-flutter/` 앱의 `lib/core/cards/`와 `lib/features/cards/`, `lib/features/memorize/` 안에서 끝난다. 새 drift 테이블·서버 API 없음 — 이전 등급은 이미 `CardRepository.revealedTier()`가 제공한다. 정적 프레임은 `CustomPainter`로 그리되, `assets/cards/frames/{tier}.svg`가 있으면 그것으로 대체하는 폴백 구조를 둔다(파일 존재 확인은 테스트하기 쉽도록 주입 가능한 함수로 뺀다). 승급 연출은 `CardFlip`에 `prevTier`를 넘겨 인라인 전이를 추가하고, 레전드만 별도의 `LegendPromotionOverlay`(큐 처리)로 분리한다.

**Tech Stack:** Flutter/Dart, Riverpod, `flutter_svg`, `drift`(테스트용 인메모리 DB), `flutter_test`.

## Global Constraints

- 새 drift 테이블·마이그레이션 없음 — 기존 `revealedCardTiersKey` 설정값과 `CourseItems`/`Progress` 조인만 쓴다.
- 색·모양(노치)·핍 개수로 등급을 구별하는 기존 색약 대응 원칙을 깨지 않는다 — 애니메이션·프레임은 부가 신호다.
- 상시 재생되는 애니메이션은 두지 않는다 — 레전드의 광택 줄은 정지 상태 유지, 탭했을 때만 골드·레전드가 반짝인다.
- 프레임 SVG 파일이 없어도(현재 `assets/cards/frames/`는 비어 있음) 기능은 완결돼야 한다 — 없으면 `CustomPainter` 폴백.
- 레전드 승급만 풀스크린 모달, 브론즈·실버·골드는 완료 화면 인라인 흐름 유지.
- 동시에 여러 장이 레전드로 오르면 모달을 한 번에 하나씩 큐로 보여준다.
- 기존 도감·등급 판정·카드 카탈로그 테스트는 전부 그대로 통과해야 한다.

---

## Task 1: `CardStatus`에 이전 등급(`prevTier`) 싣기

**Files:**
- Modify: `verse-flutter/lib/core/cards/card_status.dart`
- Modify: `verse-flutter/lib/core/cards/card_repository.dart:48-64` (`pendingUpgradesForVerse`)
- Test: `verse-flutter/test/card_repository_test.dart`

**Interfaces:**
- Consumes: 기존 `CardRepository._revealedTiers()`(private, 이미 `pendingUpgradesForVerse` 안에서 호출됨), `CardTier` enum.
- Produces: `CardStatus.prevTier` (`CardTier?`, 첫 획득이면 `null`) — Task 5·8이 이 필드로 인라인/모달을 가른다.

이후 승급 연출(§4)이 "이전 등급"을 알아야 하는데, 지금 `CardStatus`는 카드와 새 등급만 들고 있다. `pendingUpgradesForVerse`는 이미 `revealed[c.id]`로 이전 등급을 조회하고 있으므로 그 값을 버리지 말고 `CardStatus`에 실어 나른다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/card_repository_test.dart`의 `'등급이 오른 카드만 뒤집을 거리로 내놓는다'` 테스트 바로 아래에 추가:

```dart
  test('뒤집을 거리에 이전 등급이 함께 실린다', () async {
    await seedVerse(a, cleared: true);
    await seedVerse(b);
    await seedVerse(c);
    await seedVerse(d);
    final catalog = [_card('dove', [a, b, c, d])];

    // 첫 획득이면 이전 등급이 없다.
    var pending = await repo.pendingUpgradesForVerse(catalog, a);
    expect(pending.single.prevTier, isNull);

    // 브론즈로 축하한 뒤 한 절 더 외우면 이전 등급이 브론즈로 실린다.
    await repo.markRevealedTier('dove', CardTier.bronze);
    await seedVerse(b, cleared: true);
    pending = await repo.pendingUpgradesForVerse(catalog, b);
    expect(pending.single.tier, CardTier.silver);
    expect(pending.single.prevTier, CardTier.bronze);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_repository_test.dart --plain-name "뒤집을 거리에 이전 등급이 함께 실린다"`
Expected: FAIL — `prevTier` getter가 `CardStatus`에 없어 컴파일 에러.

- [ ] **Step 3: `CardStatus`에 `prevTier` 추가**

`verse-flutter/lib/core/cards/card_status.dart` 전체를 다음으로 교체:

```dart
import 'card_def.dart';
import 'card_tier.dart';

/// 카드 + 지금 등급 + (있다면) 직전에 공개했던 등급. 등급이 없는 카드는
/// CardStatus로 만들지 않는다(화면에 나오지 않으므로 "등급 없음" 상태를 들고 다닐 이유가 없다).
class CardStatus {
  const CardStatus(this.card, this.tier, {this.prevTier});

  final CardDef card;
  final CardTier tier;

  /// 뒤집기 전에 마지막으로 공개했던 등급. 첫 획득이면 null.
  /// `CardRepository.unlockedCards`(도감 목록)에서는 항상 null이다 —
  /// "직전 등급"은 오직 방금 오른 승급 목록에서만 의미가 있다.
  final CardTier? prevTier;
}
```

- [ ] **Step 4: `pendingUpgradesForVerse`가 `prevTier`를 채우게 수정**

`verse-flutter/lib/core/cards/card_repository.dart:48-64`를 다음으로 교체:

```dart
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
      out.add(CardStatus(c, tier, prevTier: seen));
    }
    return out;
  }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_repository_test.dart`
Expected: PASS (전체 파일, 기존 테스트 포함).

- [ ] **Step 6: 커밋**

```bash
cd verse-flutter
git add lib/core/cards/card_status.dart lib/core/cards/card_repository.dart test/card_repository_test.dart
git commit -m "feat: CardStatus에 이전 등급(prevTier) 싣기"
```

---

## Task 2: 등급별 디더링·브래킷·틴트·2중 테두리 페인터

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Test: `verse-flutter/test/card_tile_tier_frame_test.dart` (신규)

**Interfaces:**
- Consumes: 기존 `cardTierColor(CardTier)`, `cardTierNotch(CardTier)`, `cardTierBorderWidth(CardTier)`, `cardTierPipCount(CardTier)`, `_NotchClipper`(파일 내 private, 그대로 재사용).
- Produces: `ditherColorsFor(CardTier)` (`(Color light, Color dark)`, 순수 함수 — Task 3·이후 재사용 없음, 이 태스크 내부 검증용), `CardTierFrame` 위젯이 등급별로 디더링/브래킷/틴트/2중 테두리 레이어를 포함하게 됨(외부 시그니처는 변경 없음 — `tier`/`tint`/`child` 그대로).

카드 도감 설계 스펙 §2 표: 브론즈는 변경 없음, 실버는 디더링, 골드는 디더링+브래킷+틴트, 레전드는 디더링+브래킷+틴트+2중 테두리.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/card_tile_tier_frame_test.dart` 신규 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_tier.dart';
import 'package:verse_flutter/features/cards/card_tile.dart';

void main() {
  group('ditherColorsFor', () {
    test('브론즈는 디더링이 없다 — 두 색이 같다(단색 유지 신호)', () {
      final (light, dark) = ditherColorsFor(CardTier.bronze);
      expect(light, dark);
    });

    test('실버는 지정된 두 회색이다', () {
      final (light, dark) = ditherColorsFor(CardTier.silver);
      expect(light, const Color(0xFFC8CDD6));
      expect(dark, const Color(0xFF7C8290));
    });

    test('골드·레전드는 등급색에서 파생된 서로 다른 두 색이다', () {
      for (final t in [CardTier.gold, CardTier.legend]) {
        final (light, dark) = ditherColorsFor(t);
        expect(light, isNot(dark));
      }
    });
  });

  Widget wrap(CardTier tier) => MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 100,
            height: 100,
            child: CardTierFrame(
              tier: tier,
              tint: Colors.green,
              child: const SizedBox.expand(),
            ),
          ),
        ),
      );

  testWidgets('브론즈는 브래킷·2중 테두리 페인터가 없다', (tester) async {
    await tester.pumpWidget(wrap(CardTier.bronze));
    expect(find.byType(CustomPaint), findsWidgets);
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is TierBracketPainter),
        findsNothing);
    expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is TierDoubleBorderPainter),
        findsNothing);
  });

  testWidgets('골드는 브래킷이 있지만 2중 테두리는 없다', (tester) async {
    await tester.pumpWidget(wrap(CardTier.gold));
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is TierBracketPainter),
        findsOneWidget);
    expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is TierDoubleBorderPainter),
        findsNothing);
  });

  testWidgets('레전드는 브래킷과 2중 테두리가 모두 있다', (tester) async {
    await tester.pumpWidget(wrap(CardTier.legend));
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is TierBracketPainter),
        findsOneWidget);
    expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is TierDoubleBorderPainter),
        findsOneWidget);
  });
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: FAIL — `ditherColorsFor`, `TierBracketPainter`, `TierDoubleBorderPainter`가 아직 없어 컴파일 에러.

- [ ] **Step 3: `card_tile.dart`에 페인터·헬퍼 추가, `CardTierFrame` 레이어 확장**

`verse-flutter/lib/features/cards/card_tile.dart`에서 `cardKindColor` 함수(현재 55-62줄) 바로 아래에 다음을 삽입:

```dart
/// 등급별 디더링 두 색. 실버는 지정된 회색 쌍, 골드·레전드는 등급색에서
/// 밝게/어둡게 파생한다. 브론즈는 디더링을 안 하므로 두 값이 같다(단색과 동일하게 그려진다).
(Color, Color) ditherColorsFor(CardTier tier) {
  final base = cardTierColor(tier);
  return switch (tier) {
    CardTier.bronze => (base, base),
    CardTier.silver => (const Color(0xFFC8CDD6), const Color(0xFF7C8290)),
    CardTier.gold => (Color.lerp(base, Colors.white, 0.35)!, Color.lerp(base, Colors.black, 0.25)!),
    CardTier.legend => (Color.lerp(base, Colors.white, 0.35)!, Color.lerp(base, Colors.black, 0.25)!),
  };
}

/// 실버 이상에서 테두리를 체커 패턴 두 색으로 칠하는 페인터. 격자 한 칸은 2px.
class TierDitherPainter extends CustomPainter {
  const TierDitherPainter(this.light, this.dark, this.clipper);
  final Color light;
  final Color dark;
  final CustomClipper<Path> clipper;

  static const _cell = 2.0;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.clipPath(clipper.getClip(size));
    final cols = (size.width / _cell).ceil();
    final rows = (size.height / _cell).ceil();
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        final isLight = (x + y).isEven;
        final paint = Paint()..color = isLight ? light : dark;
        canvas.drawRect(Rect.fromLTWH(x * _cell, y * _cell, _cell, _cell), paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant TierDitherPainter old) =>
      old.light != light || old.dark != dark;
}

/// 골드·레전드 전용 모서리 ㄱ자 브래킷. 네 모서리 안쪽에 짧은 두 선을 그린다.
class TierBracketPainter extends CustomPainter {
  const TierBracketPainter(this.color);
  final Color color;

  static const _len = 8.0;
  static const _pad = 4.0;
  static const _stroke = 2.0;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = _stroke;

    void bracket(Offset corner, double dx, double dy) {
      canvas.drawLine(corner, corner + Offset(dx * _len, 0), paint);
      canvas.drawLine(corner, corner + Offset(0, dy * _len), paint);
    }

    bracket(Offset(_pad, _pad), 1, 1);
    bracket(Offset(size.width - _pad, _pad), -1, 1);
    bracket(Offset(_pad, size.height - _pad), 1, -1);
    bracket(Offset(size.width - _pad, size.height - _pad), -1, -1);
  }

  @override
  bool shouldRepaint(covariant TierBracketPainter old) => old.color != color;
}

/// 레전드 전용 2중 테두리 — 안쪽 테두리 1px 안에 얇은 두 번째 선.
class TierDoubleBorderPainter extends CustomPainter {
  const TierDoubleBorderPainter(this.color, this.notch);
  final Color color;
  final double notch;

  @override
  void paint(Canvas canvas, Size size) {
    final inset = 1.0;
    final inner = Rect.fromLTWH(inset, inset, size.width - inset * 2, size.height - inset * 2);
    final clipper = _NotchClipper(math.max(0, notch - inset));
    final path = clipper.getClip(Size(inner.width, inner.height)).shift(inner.topLeft);
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(covariant TierDoubleBorderPainter old) =>
      old.color != color || old.notch != notch;
}
```

이제 `CardTierFrame.build`(기존 `LayoutBuilder` 안, 현재 108-140줄)를 다음으로 교체 — 테두리 색 레이어를 디더링으로 바꾸고, 틴트·브래킷·2중 테두리 레이어를 조건부로 추가한다:

```dart
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        final borderClipper = _NotchClipper(notch);
        final (ditherLight, ditherDark) = ditherColorsFor(tier);
        final showBracket = tier == CardTier.gold || tier == CardTier.legend;
        final showTint = tier == CardTier.gold || tier == CardTier.legend;
        final showDoubleBorder = tier == CardTier.legend;

        return Stack(
          children: [
            // 테두리 레이어 — 브론즈는 단색, 실버 이상은 디더링 패턴.
            Positioned.fill(
              child: tier == CardTier.bronze
                  ? ClipPath(clipper: borderClipper, child: ColoredBox(color: tierColor))
                  : CustomPaint(painter: TierDitherPainter(ditherLight, ditherDark, borderClipper)),
            ),
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.all(borderW),
                child: ClipPath(
                  clipper: _NotchClipper(math.max(0, notch - borderW)),
                  child: Stack(
                    children: [
                      ColoredBox(color: tint, child: child),
                      if (showTint)
                        Positioned.fill(child: ColoredBox(color: tierColor.withValues(alpha: 0.12))),
                    ],
                  ),
                ),
              ),
            ),
            if (showBracket)
              Positioned.fill(child: CustomPaint(painter: TierBracketPainter(tierColor))),
            if (showDoubleBorder)
              Positioned.fill(child: CustomPaint(painter: TierDoubleBorderPainter(tierColor, notch))),
            if (tier == CardTier.legend)
              Positioned.fill(
                child: ClipPath(
                  clipper: _NotchClipper(notch),
                  child: CustomPaint(painter: _ShinePainter(tierColor)),
                ),
              ),
            for (final p in _pipPositions(pips, size))
              Positioned(
                left: p.dx,
                top: p.dy,
                child: Container(width: 5, height: 5, color: tierColor),
              ),
          ],
        );
      },
    );
```

주의: `showTint`일 때 콘텐츠 위에 틴트를 얹으면 카드 이니셜·아트가 가려질 수 있으므로, 틴트 레이어는 `child`(콘텐츠) **뒤가 아니라 위**에 낮은 alpha로 얹는다 — 위 코드에서 `ColoredBox(color: tint, child: child)`가 먼저, `Positioned.fill(ColoredBox(alpha 0.12))`가 그 위 순서로 이미 그렇게 되어 있다(Stack은 나중 child가 위에 그려진다).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: PASS.

- [ ] **Step 5: 기존 카드 관련 위젯 테스트 회귀 확인**

Run: `cd verse-flutter && flutter test test/card_flip_test.dart test/card_collection_screen_test.dart test/card_kind_color_test.dart`
Expected: PASS — 프레임 레이어가 늘었을 뿐 기존에 찾던 텍스트·구조는 그대로다.

- [ ] **Step 6: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tier_frame_test.dart
git commit -m "feat: 등급별 디더링·브래킷·2중 테두리 프레임 레이어"
```

---

## Task 3: 프레임 SVG 폴백 — `assets/cards/frames/{tier}.svg`

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Modify: `verse-flutter/pubspec.yaml`
- Create: `verse-flutter/assets/cards/frames/.gitkeep`
- Test: `verse-flutter/test/card_tile_tier_frame_test.dart`

**Interfaces:**
- Consumes: Task 2의 `CardTierFrame`, `TierDitherPainter` 등.
- Produces: `CardTierFrame`에 옵션 파라미터 `frameAssetChecker` (`Future<bool> Function(CardTier tier)`, 기본값 `defaultCardFrameAssetExists`) — 위젯 테스트가 실제 에셋 파일 없이도 "있다고 가정"하는 경로를 검증할 수 있게 주입 가능하게 한다. `cardFrameAssetPath(CardTier)` (`String`) 헬퍼도 함께 노출한다.

Flutter는 실제로 파일이 없으면 `rootBundle.load()`가 예외를 던진다. 이를 그대로 감지 함수로 감싸되, 테스트에서는 실제 파일 유무에 기대지 않도록 **체크 함수를 주입 가능하게** 만든다(기본 동작은 실제 asset 존재 여부, 테스트는 페이크를 주입).

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/card_tile_tier_frame_test.dart`의 `main()` 안, 기존 테스트들 뒤에 추가:

```dart
  Widget wrapWithChecker(CardTier tier, Future<bool> Function(CardTier) checker) => MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 100,
            height: 100,
            child: CardTierFrame(
              tier: tier,
              tint: Colors.green,
              frameAssetChecker: checker,
              child: const SizedBox.expand(),
            ),
          ),
        ),
      );

  testWidgets('프레임 SVG가 없다고 판단되면 페인터 프레임을 그대로 쓴다', (tester) async {
    await tester.pumpWidget(wrapWithChecker(CardTier.gold, (_) async => false));
    await tester.pumpAndSettle();
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is TierDitherPainter),
        findsOneWidget);
    expect(find.byType(SvgPicture), findsNothing);
  });

  testWidgets('프레임 SVG가 있다고 판단되면 SvgPicture로 대체된다', (tester) async {
    await tester.pumpWidget(wrapWithChecker(CardTier.gold, (_) async => true));
    await tester.pumpAndSettle();
    expect(find.byType(SvgPicture), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is TierDitherPainter),
        findsNothing);
  });

  test('cardFrameAssetPath는 등급 이름으로 svg 경로를 만든다', () {
    expect(cardFrameAssetPath(CardTier.gold), 'assets/cards/frames/gold.svg');
    expect(cardFrameAssetPath(CardTier.legend), 'assets/cards/frames/legend.svg');
  });
```

파일 상단 import에 `package:flutter_svg/flutter_svg.dart` 추가:

```dart
import 'package:flutter_svg/flutter_svg.dart';
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: FAIL — `frameAssetChecker` 파라미터·`cardFrameAssetPath`가 없어 컴파일 에러.

- [ ] **Step 3: 체크 함수·경로 헬퍼 추가, `CardTierFrame`을 `StatefulWidget`으로 전환**

`card_tile.dart`에서 `ditherColorsFor` 함수 위에 추가:

```dart
/// 등급별 프레임 SVG 경로. `assets/cards/frames/`에 이 이름의 파일이 있으면
/// CardTierFrame이 페인터 대신 이 그림을 쓴다.
String cardFrameAssetPath(CardTier tier) => 'assets/cards/frames/${tier.name}.svg';

/// 프레임 SVG가 실제로 번들에 있는지 확인한다. 없으면(현재는 항상 없음) false —
/// CardTierFrame이 페인터 프레임으로 폴백한다.
Future<bool> defaultCardFrameAssetExists(CardTier tier) async {
  try {
    await rootBundle.load(cardFrameAssetPath(tier));
    return true;
  } catch (_) {
    return false;
  }
}
```

`card_tile.dart` 상단 import에 `package:flutter/services.dart show rootBundle`를 추가:

```dart
import 'package:flutter/services.dart' show rootBundle;
```

`CardTierFrame`을 `StatelessWidget`에서 `StatefulWidget`으로 바꾼다. 기존 클래스 선언(현재 93-105줄 부근)을 다음으로 교체:

```dart
class CardTierFrame extends StatefulWidget {
  const CardTierFrame({
    super.key,
    required this.tier,
    required this.tint,
    required this.child,
    this.frameAssetChecker = defaultCardFrameAssetExists,
  });

  final CardTier tier;
  final Color tint;
  final Widget child;
  final Future<bool> Function(CardTier tier) frameAssetChecker;

  @override
  State<CardTierFrame> createState() => _CardTierFrameState();
}

class _CardTierFrameState extends State<CardTierFrame> {
  late Future<bool> _hasFrameAsset = widget.frameAssetChecker(widget.tier);

  @override
  void didUpdateWidget(covariant CardTierFrame old) {
    super.didUpdateWidget(old);
    if (old.tier != widget.tier) {
      _hasFrameAsset = widget.frameAssetChecker(widget.tier);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tier = widget.tier;
    final tierColor = cardTierColor(tier);
    final notch = cardTierNotch(tier);
    final borderW = cardTierBorderWidth(tier);
    final pips = cardTierPipCount(tier);

    return FutureBuilder<bool>(
      future: _hasFrameAsset,
      builder: (context, snapshot) {
        if (snapshot.data == true) {
          return Stack(
            children: [
              Positioned.fill(
                child: SvgPicture.asset(cardFrameAssetPath(tier), fit: BoxFit.fill),
              ),
              Padding(padding: EdgeInsets.all(borderW), child: widget.child),
              for (final p in _pipPositions(pips, const Size(100, 100)))
                Positioned(left: p.dx, top: p.dy, child: Container(width: 5, height: 5, color: tierColor)),
            ],
          );
        }
        return _paintedFrame(tier, tierColor, notch, borderW, pips);
      },
    );
  }

  Widget _paintedFrame(CardTier tier, Color tierColor, double notch, double borderW, int pips) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        final borderClipper = _NotchClipper(notch);
        final (ditherLight, ditherDark) = ditherColorsFor(tier);
        final showBracket = tier == CardTier.gold || tier == CardTier.legend;
        final showTint = tier == CardTier.gold || tier == CardTier.legend;
        final showDoubleBorder = tier == CardTier.legend;

        return Stack(
          children: [
            Positioned.fill(
              child: tier == CardTier.bronze
                  ? ClipPath(clipper: borderClipper, child: ColoredBox(color: tierColor))
                  : CustomPaint(painter: TierDitherPainter(ditherLight, ditherDark, borderClipper)),
            ),
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.all(borderW),
                child: ClipPath(
                  clipper: _NotchClipper(math.max(0, notch - borderW)),
                  child: Stack(
                    children: [
                      ColoredBox(color: widget.tint, child: widget.child),
                      if (showTint)
                        Positioned.fill(child: ColoredBox(color: tierColor.withValues(alpha: 0.12))),
                    ],
                  ),
                ),
              ),
            ),
            if (showBracket)
              Positioned.fill(child: CustomPaint(painter: TierBracketPainter(tierColor))),
            if (showDoubleBorder)
              Positioned.fill(child: CustomPaint(painter: TierDoubleBorderPainter(tierColor, notch))),
            if (tier == CardTier.legend)
              Positioned.fill(
                child: ClipPath(
                  clipper: _NotchClipper(notch),
                  child: CustomPaint(painter: _ShinePainter(tierColor)),
                ),
              ),
            for (final p in _pipPositions(pips, size))
              Positioned(
                left: p.dx,
                top: p.dy,
                child: Container(width: 5, height: 5, color: tierColor),
              ),
          ],
        );
      },
    );
  }
}
```

(`_pipPositions`는 기존 private 최상위 함수였다면 클래스 밖으로 옮겨 공용으로 쓴다 — 기존 코드에서 `CardTierFrame`의 인스턴스 메서드였다면 최상위 함수로 추출한다: `List<Offset> _pipPositions(int count, Size size) { ... }`를 클래스 밖, `TierDoubleBorderPainter` 아래에 그대로 옮긴다.)

- [ ] **Step 4: `pubspec.yaml`에 프레임 폴더 등록, `.gitkeep` 추가**

`verse-flutter/pubspec.yaml:61-66`의 `assets:` 목록에 한 줄 추가:

```yaml
  assets:
    - assets/courses/
    - assets/sounds/
    - assets/mascot/
    - assets/cards/
    - assets/cards/art/
    - assets/cards/frames/
```

빈 폴더는 git이 추적하지 않으므로 `verse-flutter/assets/cards/frames/.gitkeep`을 빈 파일로 생성한다(내용 없음).

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd verse-flutter && flutter pub get && flutter test test/card_tile_tier_frame_test.dart`
Expected: PASS.

- [ ] **Step 6: 전체 카드 관련 테스트 회귀 확인**

Run: `cd verse-flutter && flutter test test/card_flip_test.dart test/card_collection_screen_test.dart test/card_kind_color_test.dart test/card_repository_test.dart`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
cd verse-flutter
git add pubspec.yaml assets/cards/frames/.gitkeep lib/features/cards/card_tile.dart test/card_tile_tier_frame_test.dart
git commit -m "feat: 카드 프레임 SVG 폴백 구조(파일 없으면 페인터로 자동 대체)"
```

---

## Task 4: 탭 트리거 반짝임 — `CardTile`(골드·레전드)

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Test: `verse-flutter/test/card_tile_tap_sparkle_test.dart` (신규)

**Interfaces:**
- Consumes: Task 2·3의 `CardTierFrame`.
- Produces: `CardTile`의 외부 시그니처는 변경 없음(`status`/`locale`/`onTap`). 내부에 탭 시 반짝임을 재생하는 `_TapSparkle` 래퍼가 생긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/card_tile_tap_sparkle_test.dart` 신규 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/core/cards/card_status.dart';
import 'package:verse_flutter/core/cards/card_tier.dart';
import 'package:verse_flutter/features/cards/card_tile.dart';

const _card = CardDef(
  id: 'dove',
  name: '비둘기',
  nameEn: 'Dove',
  kind: 'animal',
  description: '',
  descriptionEn: '',
  image: '',
  verses: [],
);

Widget _wrap(CardTier tier, {VoidCallback? onTap}) => MaterialApp(
      home: Scaffold(
        body: CardTile(status: CardStatus(_card, tier), locale: 'ko', onTap: onTap),
      ),
    );

void main() {
  testWidgets('브론즈·실버는 탭해도 반짝임 오버레이가 없다', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.silver));
    await tester.tap(find.byType(CardTile));
    await tester.pump();
    expect(find.byKey(const ValueKey('card_tap_sparkle')), findsNothing);
  });

  testWidgets('골드는 탭하면 반짝임 오버레이가 잠깐 나타났다 사라진다', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.gold));
    expect(find.byKey(const ValueKey('card_tap_sparkle')), findsNothing);

    await tester.tap(find.byType(CardTile));
    await tester.pump();
    expect(find.byKey(const ValueKey('card_tap_sparkle')), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('card_tap_sparkle')), findsNothing);
  });

  testWidgets('탭하면 반짝임 여부와 무관하게 onTap이 즉시 호출된다', (tester) async {
    var tapped = 0;
    await tester.pumpWidget(_wrap(CardTier.legend, onTap: () => tapped++));
    await tester.tap(find.byType(CardTile));
    await tester.pump();
    expect(tapped, 1);
  });
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tap_sparkle_test.dart`
Expected: FAIL — `ValueKey('card_tap_sparkle')`를 가진 위젯이 없어 첫 번째 테스트를 제외하고 실패(2·3번째).

- [ ] **Step 3: `CardTile`에 탭 반짝임 삽입**

`card_tile.dart`의 `CardTile` 클래스(현재 189-247줄)를 다음으로 교체 — `build` 메서드가 `InkWell`을 직접 반환하던 것을, 골드·레전드에서만 반짝임 오버레이를 씌우는 구조로 바꾼다:

```dart
/// 도감 그리드의 카드 한 칸. 아트가 아직 없으면(image가 비었으면)
/// 이름 첫 글자 + 종류별 색 타일로 대체 렌더한다 — 아트가 생기면 파일만 넣으면 된다.
/// 등급은 테두리 색뿐 아니라 모서리 모양(CardTierFrame)과 이름으로 구별한다.
/// 골드·레전드는 탭하는 순간 짧은 반짝임이 재생된다(상시 애니메이션은 없다).
/// 남은 절이 몇 개인지는 알려주지 않는다.
class CardTile extends StatefulWidget {
  const CardTile({super.key, required this.status, required this.locale, this.onTap});

  final CardStatus status;
  final String locale;
  final VoidCallback? onTap;

  @override
  State<CardTile> createState() => _CardTileState();
}

class _CardTileState extends State<CardTile> with SingleTickerProviderStateMixin {
  late final AnimationController _sparkle =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 250));

  CardDef get _card => widget.status.card;
  Color get _tint => cardKindColor(_card.kind);
  bool get _sparkleEligible =>
      widget.status.tier == CardTier.gold || widget.status.tier == CardTier.legend;

  @override
  void dispose() {
    _sparkle.dispose();
    super.dispose();
  }

  void _onTap() {
    widget.onTap?.call();
    if (_sparkleEligible) _sparkle.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final p = context.pixel;
    final name = cardNameFor(_card, widget.locale);
    final tierColor = cardTierColor(widget.status.tier);
    return InkWell(
      onTap: _onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(boxShadow: [BoxShadow(color: p.shadow, offset: const Offset(2, 2))]),
              child: Stack(
                children: [
                  CardTierFrame(
                    tier: widget.status.tier,
                    tint: _tint,
                    child: Center(
                      child: _card.image.isEmpty
                          ? Text(
                              name.isEmpty ? '?' : name.substring(0, 1),
                              style: const TextStyle(fontSize: 32, color: Colors.white, fontWeight: FontWeight.bold),
                            )
                          : Padding(
                              padding: const EdgeInsets.all(6),
                              child: SizedBox.expand(
                                child: SvgPicture.asset('assets/cards/art/${_card.image}', fit: BoxFit.contain),
                              ),
                            ),
                    ),
                  ),
                  if (_sparkleEligible)
                    AnimatedBuilder(
                      animation: _sparkle,
                      builder: (context, _) {
                        if (_sparkle.value == 0) return const SizedBox.shrink();
                        return Positioned.fill(
                          key: const ValueKey('card_tap_sparkle'),
                          child: IgnorePointer(
                            child: CustomPaint(
                              painter: _TapSparklePainter(
                                progress: _sparkle.value,
                                color: tierColor,
                                withParticles: widget.status.tier == CardTier.legend,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: p.text)),
          Text(
            cardTierLabel(l, widget.status.tier),
            style: TextStyle(fontSize: 11, color: tierColor, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

/// 탭 반짝임 — 골드는 대각선 줄이 한 번 스치고, 레전드는 사각 픽셀 파티클도 함께 튄다.
class _TapSparklePainter extends CustomPainter {
  const _TapSparklePainter({required this.progress, required this.color, required this.withParticles});
  final double progress; // 0..1
  final Color color;
  final bool withParticles;

  @override
  void paint(Canvas canvas, Size size) {
    final alpha = (1 - progress).clamp(0.0, 1.0);
    final linePaint = Paint()
      ..color = color.withValues(alpha: 0.6 * alpha)
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.shortestSide * 0.1;
    final start = Offset(size.width * (progress - 0.3), 0);
    final end = Offset(size.width * progress, size.height);
    canvas.drawLine(start, end, linePaint);

    if (!withParticles) return;
    final center = Offset(size.width / 2, size.height / 2);
    final particlePaint = Paint()..color = color.withValues(alpha: alpha);
    for (var i = 0; i < 8; i++) {
      final angle = (i / 8) * 2 * math.pi;
      final dist = size.shortestSide * 0.4 * progress;
      final pos = center + Offset(math.cos(angle), math.sin(angle)) * dist;
      canvas.drawRect(Rect.fromCenter(center: pos, width: 3, height: 3), particlePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _TapSparklePainter old) =>
      old.progress != progress || old.color != color;
}
```

기존 파일 하단(현재 `CardTile` 뒤에 다른 클래스가 없다면) 위치는 그대로 유지한다. `card_tile.dart` 상단 import는 이미 Task 3에서 `flutter_svg`·`rootBundle`을 추가했으므로 `dart:math as math`만 이미 파일 최상단에 있는지 확인한다(기존 1번째 줄에 이미 있다 — 추가 불필요).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tap_sparkle_test.dart`
Expected: PASS.

- [ ] **Step 5: 회귀 확인**

Run: `cd verse-flutter && flutter test test/card_collection_screen_test.dart test/card_tile_tier_frame_test.dart`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tap_sparkle_test.dart
git commit -m "feat: 골드·레전드 카드 탭 트리거 반짝임"
```

---

## Task 5: `CardFlip` 인라인 승급 전이(브론즈~골드)

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_flip.dart`
- Test: `verse-flutter/test/card_flip_test.dart`

**Interfaces:**
- Consumes: Task 1의 `CardStatus.prevTier`.
- Produces: `CardFlip`에 옵션 파라미터 `prevTier`(`CardTier?`, 기본 `null`) 추가 — Task 8이 `_ResultView`에서 이 값을 넘긴다.

`prevTier`가 없거나 새 등급이 `legend`이면(레전드는 Task 7에서 별도 모달로 처리하므로 `CardFlip`에는 애초에 전달되지 않는다) 지금과 동일하게 동작한다. `prevTier`가 있고 `legend`가 아니면 뒤집힌 뒤 이전 등급 프레임 → 새 등급 프레임으로 전이한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/card_flip_test.dart`의 `_wrap` 헬퍼를 `prevTier`를 받도록 바꾸고 테스트를 추가한다. 파일 전체를 다음으로 교체:

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

Widget _wrap(CardTier tier, VoidCallback onRevealed, {CardTier? prevTier}) => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Scaffold(
        body: Center(
          child: CardFlip(
            status: CardStatus(_dove, tier, prevTier: prevTier),
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

  testWidgets('prevTier가 없으면(첫 획득) 전이 없이 바로 최종 등급이 보인다', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.silver, () {}));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(CardFlip));
    await tester.pumpAndSettle();

    expect(find.text('실버'), findsOneWidget);
  });

  testWidgets('prevTier가 있으면 이전 등급이 먼저 보였다가 새 등급으로 바뀐다', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.silver, () {}, prevTier: CardTier.bronze));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(CardFlip));
    await tester.pump(const Duration(milliseconds: 450)); // 뒤집기 완료 직후, 전이(400ms) 시작 전

    expect(find.text('브론즈'), findsOneWidget);
    expect(find.text('실버'), findsNothing);

    await tester.pumpAndSettle();

    expect(find.text('실버'), findsOneWidget);
    expect(find.text('브론즈'), findsNothing);
  });
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_flip_test.dart --plain-name "prevTier가 있으면"`
Expected: FAIL — `CardFlip`이 `prevTier`를 반영한 전이를 하지 않으므로 뒤집자마자 최종 등급("실버")이 보여 두 번째 `expect(find.text('브론즈'), findsOneWidget)`가 실패.

- [ ] **Step 3: `CardFlip`에 전이 로직 추가**

`verse-flutter/lib/features/cards/card_flip.dart` 전체를 읽고, `_CardFlipState`에 전이 상태를 추가한다. `_flip()`과 `build()`를 다음으로 교체(파일의 나머지 — import, 클래스 선언, 뒷면 렌더 부분 — 는 그대로 둔다):

```dart
class _CardFlipState extends State<CardFlip> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
  bool _revealed = false;
  bool _transitioned = false;

  bool get _isPromotion => widget.status.prevTier != null;

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
    if (_isPromotion) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      setState(() => _transitioned = true);
    }
  }

  CardStatus get _displayStatus {
    if (_isPromotion && !_transitioned) {
      return CardStatus(widget.status.card, widget.status.prevTier!);
    }
    return CardStatus(widget.status.card, widget.status.tier);
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
                ? Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()..rotateY(math.pi),
                    child: CardTile(status: _displayStatus, locale: widget.locale),
                  )
                : _backFace(context, l),
          );
        },
      ),
    );
  }
}
```

이 교체를 적용하려면 기존 파일에서 `_backFace` 메서드(뒷면 렌더 부분, 현재 `showFront`의 `else` 분기가 호출하던 위젯 빌드 로직)를 확인해 이름을 맞춘다 — 기존 코드가 인라인 위젯이었다면 별도 메서드로 추출하지 않고 원래 인라인 코드를 그대로 `: (기존 뒷면 위젯 코드)`에 붙여넣는다. 즉 위 `_backFace(context, l)` 자리에는 **원래 파일에서 `showFront`가 false일 때 렌더하던 코드를 그대로** 유지한다(뒷면 카드 안내 문구 등, 이번 태스크에서 변경하지 않는다).

파일 상단 import에 `package:flutter/services.dart`(HapticFeedback용) 추가:

```dart
import 'package:flutter/services.dart';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_flip_test.dart`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_flip.dart test/card_flip_test.dart
git commit -m "feat: CardFlip 인라인 승급 전이(이전 등급 → 새 등급)"
```

---

## Task 6: 레전드 전용 축하 문구 l10n 추가

**Files:**
- Modify: `verse-flutter/lib/l10n/app_ko.arb`
- Modify: `verse-flutter/lib/l10n/app_en.arb`

**Interfaces:**
- Consumes: 없음.
- Produces: `l.cardsLegendTitle`, `l.cardsLegendConfirm` — Task 7의 `LegendPromotionOverlay`가 사용.

- [ ] **Step 1: `app_ko.arb`에 키 추가**

`verse-flutter/lib/l10n/app_ko.arb`의 `"cardsTierLegend": "레전드",` 줄 바로 아래에 추가:

```json
  "cardsLegendTitle": "레전드 달성!",
  "cardsLegendConfirm": "확인",
```

- [ ] **Step 2: `app_en.arb`에 대응 키 추가**

`verse-flutter/lib/l10n/app_en.arb`의 `"cardsTierLegend": "Legend",` 줄 바로 아래에 추가:

```json
  "cardsLegendTitle": "Legend achieved!",
  "cardsLegendConfirm": "OK",
```

- [ ] **Step 3: 로컬라이제이션 재생성**

Run: `cd verse-flutter && flutter gen-l10n`
Expected: `lib/l10n/app_localizations.dart`, `app_localizations_ko.dart`, `app_localizations_en.dart`에 `cardsLegendTitle`/`cardsLegendConfirm` getter가 추가된다(명령이 자동으로 파일을 덮어쓴다).

- [ ] **Step 4: 생성 확인**

Run: `cd verse-flutter && grep -n "cardsLegendTitle" lib/l10n/app_localizations_ko.dart lib/l10n/app_localizations_en.dart`
Expected: 두 파일 모두에서 매치가 출력된다.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/l10n/app_ko.arb lib/l10n/app_en.arb lib/l10n/app_localizations.dart lib/l10n/app_localizations_ko.dart lib/l10n/app_localizations_en.dart
git commit -m "feat: 레전드 승급 모달용 l10n 문구 추가"
```

---

## Task 7: `LegendPromotionOverlay` — 풀스크린 모달(큐 처리)

**Files:**
- Create: `verse-flutter/lib/features/cards/legend_promotion_overlay.dart`
- Test: `verse-flutter/test/legend_promotion_overlay_test.dart` (신규)

**Interfaces:**
- Consumes: `CardStatus`(Task 1), `CardTile`(Task 4, 레전드 프레임 렌더에 재사용), `cardTierColor`.
- Produces: `LegendPromotionOverlay` 위젯 — 생성자 `({required List<CardStatus> cards, required void Function(CardStatus) onEachDismissed, required VoidCallback onAllDismissed})`. `cards`가 비어 있으면 아무것도 렌더하지 않는다. 하나씩 순서대로 보여주고, 확인을 누르면 `onEachDismissed(현재 카드)` 호출 후 다음 카드로, 마지막이면 `onAllDismissed()` 호출.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/legend_promotion_overlay_test.dart` 신규 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/core/cards/card_status.dart';
import 'package:verse_flutter/core/cards/card_tier.dart';
import 'package:verse_flutter/features/cards/legend_promotion_overlay.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

CardDef _card(String id, String name) => CardDef(
      id: id,
      name: name,
      nameEn: name,
      kind: 'animal',
      description: '',
      descriptionEn: '',
      image: '',
      verses: const [],
    );

Widget _wrap(List<CardStatus> cards, {
  required void Function(CardStatus) onEachDismissed,
  required VoidCallback onAllDismissed,
}) =>
    MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Scaffold(
        body: LegendPromotionOverlay(
          cards: cards,
          onEachDismissed: onEachDismissed,
          onAllDismissed: onAllDismissed,
        ),
      ),
    );

void main() {
  testWidgets('카드가 비어 있으면 아무것도 렌더하지 않는다', (tester) async {
    await tester.pumpWidget(_wrap(const [], onEachDismissed: (_) {}, onAllDismissed: () {}));
    expect(find.text('레전드 달성!'), findsNothing);
  });

  testWidgets('카드 한 장이면 확인을 누르면 onEachDismissed와 onAllDismissed가 모두 불린다', (tester) async {
    final dismissed = <String>[];
    var allDone = false;
    await tester.pumpWidget(_wrap(
      [CardStatus(_card('sheep', '어린양'), CardTier.legend)],
      onEachDismissed: (s) => dismissed.add(s.card.id),
      onAllDismissed: () => allDone = true,
    ));

    expect(find.text('레전드 달성!'), findsOneWidget);
    expect(find.text('어린양'), findsOneWidget);

    await tester.tap(find.text('확인'));
    await tester.pumpAndSettle();

    expect(dismissed, ['sheep']);
    expect(allDone, isTrue);
  });

  testWidgets('카드 두 장이면 순서대로 하나씩만 보이고 마지막에 onAllDismissed가 불린다', (tester) async {
    final dismissed = <String>[];
    var allDone = false;
    await tester.pumpWidget(_wrap(
      [
        CardStatus(_card('sheep', '어린양'), CardTier.legend),
        CardStatus(_card('earth', '지구'), CardTier.legend),
      ],
      onEachDismissed: (s) => dismissed.add(s.card.id),
      onAllDismissed: () => allDone = true,
    ));

    expect(find.text('어린양'), findsOneWidget);
    expect(find.text('지구'), findsNothing);

    await tester.tap(find.text('확인'));
    await tester.pumpAndSettle();

    expect(dismissed, ['sheep']);
    expect(allDone, isFalse, reason: '아직 두 번째 카드가 남았다');
    expect(find.text('지구'), findsOneWidget);
    expect(find.text('어린양'), findsNothing);

    await tester.tap(find.text('확인'));
    await tester.pumpAndSettle();

    expect(dismissed, ['sheep', 'earth']);
    expect(allDone, isTrue);
  });
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/legend_promotion_overlay_test.dart`
Expected: FAIL — `legend_promotion_overlay.dart` 파일이 없어 컴파일 에러.

- [ ] **Step 3: `LegendPromotionOverlay` 구현**

`verse-flutter/lib/features/cards/legend_promotion_overlay.dart` 신규 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/cards/card_def.dart';
import '../../core/cards/card_status.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/theme/pixel_theme.dart';
import 'card_tile.dart';

/// 레전드로 오른 카드를 완료 화면 위에서 풀스크린으로 축하한다.
/// 여러 장이 동시에 레전드가 되어도 한 번에 하나씩만 보여준다 —
/// 모달을 겹쳐 띄우지 않는다(도감 스펙의 "재촉하지 않는다" 원칙을 승급 순간에도 지킨다).
class LegendPromotionOverlay extends StatefulWidget {
  const LegendPromotionOverlay({
    super.key,
    required this.cards,
    required this.onEachDismissed,
    required this.onAllDismissed,
  });

  final List<CardStatus> cards;
  final void Function(CardStatus card) onEachDismissed;
  final VoidCallback onAllDismissed;

  @override
  State<LegendPromotionOverlay> createState() => _LegendPromotionOverlayState();
}

class _LegendPromotionOverlayState extends State<LegendPromotionOverlay> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    if (widget.cards.isNotEmpty) HapticFeedback.heavyImpact();
  }

  void _dismissCurrent() {
    final card = widget.cards[_index];
    widget.onEachDismissed(card);
    if (_index + 1 >= widget.cards.length) {
      widget.onAllDismissed();
      return;
    }
    setState(() => _index++);
    HapticFeedback.heavyImpact();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.cards.isEmpty) return const SizedBox.shrink();
    final l = AppLocalizations.of(context)!;
    final p = context.pixel;
    final status = widget.cards[_index];
    final locale = Localizations.localeOf(context).languageCode;
    final name = cardNameFor(status.card, locale);

    return Positioned.fill(
      child: ColoredBox(
        color: Colors.black87,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l.cardsLegendTitle,
                style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: 160,
                height: 160,
                child: CardTile(status: status, locale: locale),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _dismissCurrent,
                style: ElevatedButton.styleFrom(backgroundColor: p.green),
                child: Text(l.cardsLegendConfirm),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

`name` 변수는 현재 화면에서 사용되지 않으므로(테스트는 `CardTile` 내부의 이름 텍스트로 "어린양"을 찾는다) 실제로는 `CardTile`이 이름을 렌더하니 상위에서 별도로 안 그려도 된다 — 위 코드에서 `name` 로컬 변수를 지운다(사용하지 않는 변수 경고 방지):

```dart
    final status = widget.cards[_index];
    final locale = Localizations.localeOf(context).languageCode;
```

(위 두 줄만 남기고 `final name = ...` 줄은 제거한다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/legend_promotion_overlay_test.dart`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/legend_promotion_overlay.dart test/legend_promotion_overlay_test.dart
git commit -m "feat: 레전드 승급 풀스크린 축하 오버레이(큐 처리)"
```

---

## Task 8: `memorize_screen.dart` 배선 — 레전드는 모달로, 나머지는 인라인으로

**Files:**
- Modify: `verse-flutter/lib/features/memorize/memorize_screen.dart`
- Test: `verse-flutter/test/memorize_card_upgrades_test.dart` (신규, 기존 memorize 관련 테스트 위치·패턴을 확인해 맞춘다)

**Interfaces:**
- Consumes: Task 1의 `CardStatus.prevTier`, Task 5의 `CardFlip(prevTier: ...)`, Task 7의 `LegendPromotionOverlay`.
- Produces: 없음(최종 배선 — 이후 태스크 없음).

**참고**: 기존 memorize 화면 테스트가 어떤 방식으로 위젯을 구성하는지 먼저 확인한다.

- [ ] **Step 1: 기존 memorize 테스트 패턴 확인**

Run: `cd verse-flutter && ls test | grep -i memorize`

이 목록에서 `_ResultView`나 `cardUpgrades`를 다루는 기존 테스트 파일이 있는지 확인하고, 있다면 그 파일의 `MaterialApp`/`ProviderScope` 구성 방식을 그대로 따른다(이 계획은 없는 경우를 가정해 아래에서 `_ResultView`를 직접 단위 테스트한다 — `_ResultView`가 private이므로 같은 파일 안에서나 `memorize_screen.dart`가 `_ResultView`를 만드는 진입점을 통해서만 테스트 가능하다. 이 태스크는 `_ResultView`를 **public**으로 바꾸지 않고, 대신 로직 분기(레전드 필터링)를 별도의 순수 함수로 뽑아 그 함수만 단위 테스트한다).

- [ ] **Step 2: 실패하는 테스트 작성 — 필터링 순수 함수**

`verse-flutter/test/memorize_card_upgrades_test.dart` 신규 생성:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/cards/card_def.dart';
import 'package:verse_flutter/core/cards/card_status.dart';
import 'package:verse_flutter/core/cards/card_tier.dart';
import 'package:verse_flutter/features/memorize/memorize_screen.dart';

CardDef _card(String id) => CardDef(
      id: id,
      name: id,
      nameEn: id,
      kind: 'animal',
      description: '',
      descriptionEn: '',
      image: '',
      verses: const [],
    );

void main() {
  test('레전드 승급 카드와 그 외 카드를 나눈다', () {
    final upgrades = [
      CardStatus(_card('a'), CardTier.bronze),
      CardStatus(_card('b'), CardTier.silver, prevTier: CardTier.bronze),
      CardStatus(_card('c'), CardTier.legend, prevTier: CardTier.gold),
      CardStatus(_card('d'), CardTier.legend), // prevTier 없이도 legend면 모달로
    ];

    final split = splitCardUpgrades(upgrades);

    expect(split.inline.map((s) => s.card.id), ['a', 'b']);
    expect(split.legend.map((s) => s.card.id), ['c', 'd']);
  });

  test('레전드 승급이 없으면 legend 목록이 비어 있다', () {
    final upgrades = [CardStatus(_card('a'), CardTier.bronze)];
    final split = splitCardUpgrades(upgrades);
    expect(split.legend, isEmpty);
    expect(split.inline, hasLength(1));
  });
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/memorize_card_upgrades_test.dart`
Expected: FAIL — `splitCardUpgrades` 함수가 없어 컴파일 에러.

- [ ] **Step 4: `splitCardUpgrades` 추가 및 `_ResultView` 배선**

`memorize_screen.dart` 상단 import에 추가:

```dart
import '../cards/legend_promotion_overlay.dart';
```

파일 안에서 `class _ResultView` 선언 바로 위에 순수 함수와 결과 타입을 추가:

```dart
class CardUpgradeSplit {
  const CardUpgradeSplit(this.inline, this.legend);
  final List<CardStatus> inline;
  final List<CardStatus> legend;
}

/// 방금 오른 카드들을 인라인 전이(브론즈~골드)와 풀스크린 모달(레전드) 대상으로 나눈다.
CardUpgradeSplit splitCardUpgrades(List<CardStatus> upgrades) {
  final inline = <CardStatus>[];
  final legend = <CardStatus>[];
  for (final u in upgrades) {
    if (u.tier == CardTier.legend) {
      legend.add(u);
    } else {
      inline.add(u);
    }
  }
  return CardUpgradeSplit(inline, legend);
}
```

`_ResultView`를 `ConsumerWidget`에서 `ConsumerStatefulWidget`으로 바꿔 레전드 큐가 처리된 뒤에도 화면이 남아있게 한다. 현재 733-745줄의 클래스 선언을 다음으로 교체:

```dart
class _ResultView extends ConsumerStatefulWidget {
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

  @override
  ConsumerState<_ResultView> createState() => _ResultViewState();
}

class _ResultViewState extends ConsumerState<_ResultView> {
  late CardUpgradeSplit _split = splitCardUpgrades(widget.cardUpgrades);

  @override
  void didUpdateWidget(covariant _ResultView old) {
    super.didUpdateWidget(old);
    if (old.cardUpgrades != widget.cardUpgrades) {
      _split = splitCardUpgrades(widget.cardUpgrades);
    }
  }

  void _onLegendDismissed(CardStatus status) {
    ref.read(cardRepositoryProvider).markRevealedTier(status.card.id, status.tier);
    ref.invalidate(unlockedCardsProvider);
  }

  void _onAllLegendsDismissed() {
    setState(() {
      _split = CardUpgradeSplit(_split.inline, const []);
    });
  }
```

이어서 기존 `Color _gradeColor(...)`, `String _gradeLabel(...)`, `build(BuildContext context, WidgetRef ref)` 메서드는 그대로 `_ResultViewState` 안에 들어가되, `build`의 시그니처에서 `WidgetRef ref` 파라미터는 제거한다(State 안에서는 `ref`가 이미 필드로 제공된다):

```dart
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final p = context.pixel;
    final locale = Localizations.localeOf(context).languageCode;
    final gradeColor = _gradeColor(context, widget.state.clientGrade);
    final isGreen = widget.state.clientGrade == grading.Grade.green;
    final canAdvance = widget.state.clientGrade != grading.Grade.red;
    final hasSession = ref.watch(hasSessionProvider).value ?? false;
```

(메서드 본문 나머지에서 `state`는 `widget.state`로, `milestone`은 `widget.milestone`으로, `onRetry`/`onDone`은 `widget.onRetry`/`widget.onDone`으로, `cardUpgrades`는 `_split.inline`으로 각각 바꾼다.)

기존 851-879줄의 카드 뒤집기 루프(`for (final status in cardUpgrades) ...`)를 `_split.inline`을 쓰도록 바꾸고, `CardFlip`에 `prevTier`를 넘긴다:

```dart
          // 등급이 오른 카드는 한 장씩 뒤집어 공개한다. 레전드는 여기 없다 — 아래 풀스크린으로 간다.
          for (final status in _split.inline) ...[
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

(이 블록의 내용 자체는 `cardUpgrades` → `_split.inline`으로 바꾼 것 외에 변경 없다. `CardFlip`은 이미 Task 5에서 `prevTier`를 `CardStatus`에서 직접 읽으므로 `CardFlip` 호출부에 별도 파라미터를 추가할 필요는 없다 — `status`가 이미 `prevTier`를 담고 있다.)

`build` 메서드가 반환하는 최상위 위젯을 `Stack`으로 감싸 레전드 오버레이를 얹는다. 기존에 `_ResultView.build`가 `return SingleChildScrollView(...)`로 시작했다면(775줄), 다음처럼 감싼다:

```dart
    return Stack(
      children: [
        SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              // ... 기존 Column children 전부 그대로 ...
            ],
          ),
        ),
        if (_split.legend.isNotEmpty)
          LegendPromotionOverlay(
            cards: _split.legend,
            onEachDismissed: _onLegendDismissed,
            onAllDismissed: _onAllLegendsDismissed,
          ),
      ],
    );
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/memorize_card_upgrades_test.dart`
Expected: PASS.

- [ ] **Step 6: 전체 회귀 확인**

Run: `cd verse-flutter && flutter analyze && flutter test`
Expected: `flutter analyze`에 새 에러 없음(경고는 기존 수준 유지). `flutter test`는 전체 스위트가 PASS.

- [ ] **Step 7: 커밋**

```bash
cd verse-flutter
git add lib/features/memorize/memorize_screen.dart test/memorize_card_upgrades_test.dart
git commit -m "feat: 레전드 승급은 풀스크린 모달로, 나머지는 인라인 전이로 배선"
```

---

## Self-Review Notes (실행 전 참고)

- **§1~§4 스펙 커버리지**: 정적 강화(§2)=Task 2, 프레임 아트 폴백(§2-1)=Task 3, 탭 반짝임(§3)=Task 4, 인라인 전이(§4 B1)=Task 1·5, 레전드 풀스크린(§4 B2)=Task 6·7·8. 재사용 관계(§5)는 각 태스크의 Interfaces에 반영. 테스트(§6)는 각 태스크의 Step에 대응. 범위 밖(§7) 항목(책장, 필터, NEW 뱃지, 카드 그림 아트, 상시 애니메이션, 비-레전드 풀스크린)은 어떤 태스크에도 포함하지 않았다.
- **`CardTierFrame`을 `Stateless→Stateful` 전환(Task 3)**은 SVG 존재 확인이 비동기이기 때문에 불가피하다 — Task 2에서 만든 정적 페인터 레이어를 Task 3의 `_paintedFrame`으로 그대로 옮겨 재사용하므로 중복 구현이 아니다.
- **`_ResultView`를 `ConsumerWidget→ConsumerStatefulWidget` 전환(Task 8)**은 레전드 모달의 큐 상태(`_split`)를 화면이 기억해야 하기 때문이다 — `cardUpgrades`가 부모(`_MemorizeScreenState`)에서 오는 것은 그대로이고, 그 하위에서 로컬 상태로 큐를 관리한다.
- Task 8의 Step 4는 기존 `memorize_screen.dart`의 정확한 줄 구성에 따라 다소 수작업 병합이 필요하다 — 실행자는 반드시 파일을 먼저 Read하고 diff를 눈으로 확인한 뒤 적용한다.

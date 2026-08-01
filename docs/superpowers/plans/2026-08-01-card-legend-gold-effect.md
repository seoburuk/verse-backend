# 카드 수집 레전드·골드 이펙트 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드 도감 상세 화면의 레전드 홀로그램을 다중 레이어로 강화하고, 골드·레전드 상세 등장 시 광택 스윕을, 승급 순간(레전드 풀스크린 모달·골드 인라인)에 파티클/반짝임 연출을 추가한다.

**Architecture:** 순수 함수(`holoOffset`, `sweepOffset`)와 신규 `CustomPainter`(`SweepPainter`, `ParticleBurstPainter`, `RadialRaysPainter`)를 `lib/features/cards/card_effects.dart`에 모아 세 소비처(`CardTile`, `CardDetailSheet`, `LegendPromotionOverlay`, `CardFlip`)가 공유한다. `CardTile`에 `faceOverlay` 슬롯을 추가해 그리드 밖(상세·승급) 화면 한정 이펙트를 얹는다.

**Tech Stack:** Flutter/Dart, `CustomPainter`/`AnimationController` 기반. 신규 의존성 없음(`sensors_plus`는 기존에 이미 있음).

## Global Constraints

- 새 데이터·테이블·의존성 없음. `pubspec.yaml` 변경 없음.
- 그리드(`CardCollectionScreen`, 그리드 컨텍스트의 `CardTile`)는 상시 애니메이션을 받지 않는다 — 이번 이펙트는 전부 상세 화면(`CardDetailSheet`)과 승급 화면(`LegendPromotionOverlay`, `CardFlip`)에서만 동작한다.
- 노치 개수·핍 개수·좌표(`cardTierNotch`, `cardTierPipCount`, `_pipPositions`)는 변경하지 않는다.
- `MediaQuery.of(context).disableAnimations`(동작 줄이기)가 켜져 있으면 모든 신규 애니메이션(스윕·파티클·광선·승급 시퀀스)은 재생을 건너뛰고 최종 상태로 즉시 렌더한다.
- `HoloPrismPainter`의 생성자 시그니처 `HoloPrismPainter(Offset tilt, double notch)`와 공개 필드 `tilt`는 유지한다 — 기존 테스트(`test/card_tile_tier_frame_test.dart`)가 이 필드를 직접 읽는다.
- 골드는 상세 등장 스윕과 인라인 승급 반짝임+축소 파티클만 받는다. 상시 홀로그램·풀스크린 모달·큰 파티클 물량은 레전드 전용으로 남긴다.
- 배경 장식(방사 광선 등)에 무한 반복(`AnimationController.repeat()`)을 쓰지 않는다 — 이 프로젝트의 위젯 테스트는 전부 `pumpAndSettle()`을 쓰며, 끝나지 않는 애니메이션은 테스트를 영원히 멈추지 않게 만든다(기존 `card_detail_sheet_test.dart`의 자이로 타임아웃 타이머 관련 주석이 이미 같은 문제를 지적한다). 방사 광선은 고정 각도로 정적으로 그린다.

---

## 파일 변경 요약

| 파일 | 변경 | 관련 태스크 |
|---|---|---|
| `lib/features/cards/card_effects.dart` (신규) | `holoOffset`, `sweepOffset` 순수 함수 + `SweepPainter`, `ParticleBurstPainter`, `RadialRaysPainter` | 1, 3 |
| `lib/features/cards/card_tile.dart` | `HoloPrismPainter` 3레이어 확장, `CardTile`에 `faceOverlay` 슬롯 추가 | 2, 4 |
| `lib/features/cards/card_detail_sheet.dart` | 골드·레전드 상세 등장 스윕 배선, 레전드 홀로 지연 활성화 | 5 |
| `lib/features/cards/legend_promotion_overlay.dart` | 시퀀스 재구성(광선·확대·스윕·파티클·문구·탭 스킵) | 6 |
| `lib/features/cards/card_flip.dart` | 골드 승급 전이에 반짝임+축소 파티클 | 7 |

---

### Task 1: `card_effects.dart` — 순수 함수 `holoOffset`, `sweepOffset`

**Files:**
- Create: `verse-flutter/lib/features/cards/card_effects.dart`
- Test: `verse-flutter/test/card_effects_test.dart`

**Interfaces:**
- Produces: `Offset holoOffset(Offset tilt, {double gain = 1.6})`, `double sweepOffset(double t)` — Task 2, 3, 5, 6, 7이 이 두 함수를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```dart
// verse-flutter/test/card_effects_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/features/cards/card_effects.dart';

void main() {
  group('holoOffset', () {
    test('게인을 곱해 감도를 높인다', () {
      final result = holoOffset(const Offset(0.3, -0.2));
      expect(result.dx, closeTo(0.48, 0.001));
      expect(result.dy, closeTo(-0.32, 0.001));
    });

    test('게인을 곱한 값이 1.0을 넘으면 1.0으로 클램프된다', () {
      final result = holoOffset(const Offset(0.9, 0.9));
      expect(result.dx, 1.0);
      expect(result.dy, 1.0);
    });

    test('음수 방향도 -1.0으로 클램프된다', () {
      final result = holoOffset(const Offset(-0.9, -0.9));
      expect(result.dx, -1.0);
      expect(result.dy, -1.0);
    });

    test('gain을 직접 지정할 수 있다', () {
      final result = holoOffset(const Offset(0.5, 0.0), gain: 1.0);
      expect(result.dx, closeTo(0.5, 0.001));
    });
  });

  group('sweepOffset', () {
    test('t=0이면 카드 왼쪽 바깥(-0.3)에서 시작한다', () {
      expect(sweepOffset(0), closeTo(-0.3, 0.001));
    });

    test('t=1이면 카드 오른쪽 바깥(1.3)에서 끝난다', () {
      expect(sweepOffset(1), closeTo(1.3, 0.001));
    });

    test('t=0.5면 카드 중앙(0.5) 근처를 지난다', () {
      expect(sweepOffset(0.5), closeTo(0.5, 0.001));
    });
  });
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_effects_test.dart`
Expected: FAIL — `card_effects.dart` 파일이 없어 import 에러.

- [ ] **Step 3: 최소 구현 작성**

```dart
// verse-flutter/lib/features/cards/card_effects.dart
import 'package:flutter/material.dart';

/// 자이로 기울기(-1..1)를 홀로그램 그라데이션에 쓰기 좋은 오프셋으로 변환한다.
/// 게인을 곱해 손목을 조금만 틀어도 반응이 보이게 하고, 다시 -1..1로 클램프한다.
Offset holoOffset(Offset tilt, {double gain = 1.6}) {
  return Offset(
    (tilt.dx * gain).clamp(-1.0, 1.0),
    (tilt.dy * gain).clamp(-1.0, 1.0),
  );
}

/// 스윕 애니메이션 진행도(0..1)를 카드 폭 기준 대각선 위치로 매핑한다.
/// 카드 왼쪽 바깥(-0.3)에서 시작해 오른쪽 바깥(1.3)까지 지나가도록
/// 카드 폭보다 넓은 범위를 쓴다 — 띠가 카드 경계에서 뚝 끊기지 않는다.
double sweepOffset(double t) => -0.3 + t * 1.6;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_effects_test.dart`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_effects.dart test/card_effects_test.dart
git commit -m "feat: 홀로·스윕 오프셋 순수 함수 card_effects.dart"
```

---

### Task 2: `HoloPrismPainter` 3레이어 확장

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart:202-229` (`HoloPrismPainter`)
- Test: `verse-flutter/test/card_tile_tier_frame_test.dart` (기존 파일에 추가)

**Interfaces:**
- Consumes: `holoOffset(Offset tilt, {double gain})` (Task 1)
- Produces: `HoloPrismPainter(Offset tilt, double notch)` — 생성자 시그니처와 `tilt` 필드는 기존과 동일하게 유지(§ Global Constraints). Task 5·6에서 이 페인터를 그대로 재사용.

- [ ] **Step 1: 실패하는 테스트 작성**

기존 `test/card_tile_tier_frame_test.dart`의 `group('holoTilt', ...)` 블록 끝(`);` 직전, 마지막 테스트 뒤)에 추가한다.

```dart
    testWidgets('기울기 값이 극단적이어도(업스트림 클램프 전) 크래시 없이 렌더된다', (tester) async {
      final tilt = ValueNotifier<Offset?>(const Offset(5.0, -5.0));
      addTearDown(tilt.dispose);
      await tester.pumpWidget(wrapWithTilt(CardTier.legend, tilt));
      expect(tester.takeException(), isNull);
    });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`

이 특정 테스트는 현재 구현으로도 통과할 수 있다(기존 코드가 이미 크래시하지 않으므로) — 이번 태스크의 진짜 회귀 방지선은 **기존 전체 스위트가 계속 통과하는지**다. 아래 Step 4에서 전체 스위트를 다시 돌려 확인한다.

Expected: PASS (아직 구현 변경 전이므로 이 특정 케이스는 이미 통과 — Step 3에서 3레이어로 바꾼 뒤에도 계속 통과해야 함을 확인하는 것이 목적)

- [ ] **Step 3: `HoloPrismPainter` 3레이어로 확장**

`card_tile.dart`의 `import` 목록 맨 위에 추가:

```dart
import 'card_effects.dart';
```

`card_tile.dart:202-229`의 `HoloPrismPainter` 클래스 전체를 아래로 교체:

```dart
/// 레전드 상세 전용 — 세 레이어로 홀로그램을 만든다: 주 무지개 밴드, 반대 방향
/// 역밴드(간섭 무늬), 기울기 방향으로 밝아지는 글리터 점. 그림·텍스트 가독성을
/// 해치지 않게 alpha를 낮게 두고, 노치 클리핑 안쪽에만 그린다.
class HoloPrismPainter extends CustomPainter {
  const HoloPrismPainter(this.tilt, this.notch);
  final Offset tilt;
  final double notch;

  static const _bandColors = [
    Color(0x00000000),
    Color(0x59FF6B6B),
    Color(0x59FFD93D),
    Color(0x596BCB77),
    Color(0x594D96FF),
    Color(0x59C77DFF),
    Color(0x00000000),
  ];

  static const _reverseBandColors = [
    Color(0x00000000),
    Color(0x38C77DFF),
    Color(0x384D96FF),
    Color(0x386BCB77),
    Color(0x38FFD93D),
    Color(0x38FF6B6B),
    Color(0x00000000),
  ];

  /// 글리터 점 좌표(0..1 정규화). 고정 시드라 매 프레임 재계산하지 않고
  /// 클래스 로드 시 한 번만 만든다 — 테스트에서도 항상 같은 패턴이 나온다.
  static final List<Offset> _glitterSeeds = List.generate(40, (i) {
    final rng = math.Random(i);
    return Offset(rng.nextDouble(), rng.nextDouble());
  });

  @override
  void paint(Canvas canvas, Size size) {
    canvas.clipPath(_NotchClipper(notch).getClip(size));
    final rect = Offset.zero & size;

    final primary = holoOffset(tilt);
    _paintBand(canvas, rect, primary, _bandColors);

    final reverse = holoOffset(Offset(-tilt.dx, -tilt.dy));
    _paintBand(canvas, rect, reverse, _reverseBandColors);

    _paintGlitter(canvas, size, primary);
  }

  void _paintBand(Canvas canvas, Rect rect, Offset offset, List<Color> colors) {
    final begin = Alignment(-1.0 + offset.dx, -1.0 + offset.dy);
    final end = Alignment(1.0 + offset.dx, 1.0 + offset.dy);
    final paint = Paint()
      ..shader = LinearGradient(
        begin: begin,
        end: end,
        tileMode: TileMode.mirror,
        colors: colors,
      ).createShader(rect)
      ..blendMode = BlendMode.plus;
    canvas.drawRect(rect, paint);
  }

  /// 기울기 방향(하이라이트 축)에 가까운 점일수록 밝게, 먼 점은 거의 안 보이게 한다.
  void _paintGlitter(Canvas canvas, Size size, Offset highlightAxis) {
    for (final seed in _glitterSeeds) {
      final pos = Offset(seed.dx * size.width, seed.dy * size.height);
      final normalized = Offset(
        seed.dx * 2 - 1,
        seed.dy * 2 - 1,
      );
      final dist = (normalized - highlightAxis).distance.clamp(0.0, 2.0);
      final alpha = ((1 - dist / 2.0) * 0.9).clamp(0.0, 0.9);
      if (alpha <= 0.02) continue;
      canvas.drawRect(
        Rect.fromCenter(center: pos, width: 1.5, height: 1.5),
        Paint()..color = Colors.white.withValues(alpha: alpha),
      );
    }
  }

  @override
  bool shouldRepaint(covariant HoloPrismPainter old) => old.tilt != tilt;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart test/card_tile_tap_sparkle_test.dart`
Expected: PASS (기존 holoTilt 그룹 테스트 전부 + 새 극단값 테스트 통과. `before.tilt`/`after.tilt` 필드 검증도 그대로 통과해야 함 — 생성자 시그니처가 안 바뀌었으므로 통과한다.)

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tier_frame_test.dart
git commit -m "feat: 레전드 홀로그램 3레이어 확장(역밴드+글리터)"
```

---

### Task 3: `SweepPainter`, `ParticleBurstPainter`, `RadialRaysPainter`

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_effects.dart` (Task 1에서 만든 파일에 추가)
- Test: `verse-flutter/test/card_effects_test.dart` (기존 파일에 추가)

**Interfaces:**
- Consumes: `sweepOffset(double t)` (Task 1)
- Produces: `SweepPainter(double progress, Color color)`, `ParticleBurstPainter(double progress, Color color, {int count = 24})`, `RadialRaysPainter(Color color, double rotation, {int rayCount = 10})` — Task 5(상세 스윕), 6(승급 모달), 7(골드 인라인)이 그대로 재사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/card_effects_test.dart` 파일에서, 최상단 `import` 블록 바로 다음(기존 `void main() {` 줄 앞)에 헬퍼 함수를 추가한다:

```dart
void _expectDoesNotThrow(CustomPainter painter, Size size) {
  final recorder = PictureRecorder();
  final canvas = Canvas(recorder);
  painter.paint(canvas, size);
  recorder.endRecording().dispose();
}
```

그리고 기존 `main() { ... }` 함수 **안**, 마지막 `group('sweepOffset', ...)` 블록 뒤·`main()`을 닫는 `}` 앞에 아래 세 그룹을 추가한다:

```dart
  group('SweepPainter', () {
    test('progress가 1.0 이상이면 shouldRepaint가 이전과 달라도 그리기는 스킵된다(예외 없음)', () {
      const painter = SweepPainter(1.0, Colors.white);
      _expectDoesNotThrow(painter, const Size(100, 100));
    });

    test('progress 0..1 사이 값에서 예외 없이 그려진다', () {
      const painter = SweepPainter(0.4, Colors.white);
      _expectDoesNotThrow(painter, const Size(100, 100));
    });

    test('shouldRepaint는 progress가 다르면 true다', () {
      const a = SweepPainter(0.2, Colors.white);
      const b = SweepPainter(0.6, Colors.white);
      expect(a.shouldRepaint(b), isTrue);
    });

    test('shouldRepaint는 progress·color가 같으면 false다', () {
      const a = SweepPainter(0.2, Colors.white);
      const b = SweepPainter(0.2, Colors.white);
      expect(a.shouldRepaint(b), isFalse);
    });
  });

  group('ParticleBurstPainter', () {
    test('progress 0..1 사이 값에서 예외 없이 그려진다', () {
      const painter = ParticleBurstPainter(0.5, Colors.amber, count: 12);
      _expectDoesNotThrow(painter, const Size(160, 160));
    });

    test('progress가 1.0 이상이면 그리기를 스킵해도 예외가 없다', () {
      const painter = ParticleBurstPainter(1.0, Colors.amber);
      _expectDoesNotThrow(painter, const Size(160, 160));
    });

    test('count가 달라도 shouldRepaint가 true다', () {
      const a = ParticleBurstPainter(0.5, Colors.amber, count: 8);
      const b = ParticleBurstPainter(0.5, Colors.amber, count: 12);
      expect(a.shouldRepaint(b), isTrue);
    });
  });

  group('RadialRaysPainter', () {
    test('정적 회전각으로 예외 없이 그려진다', () {
      const painter = RadialRaysPainter(Colors.purple, 0.0);
      _expectDoesNotThrow(painter, const Size(300, 300));
    });
  });
```

그리고 파일 상단 import에 `dart:ui show PictureRecorder`가 필요하면 추가한다(대부분 `package:flutter/material.dart`가 이미 `Canvas`/`PictureRecorder`를 재노출하므로 별도 import 불필요 — `flutter/material.dart` 임포트로 충분하다).

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_effects_test.dart`
Expected: FAIL — `SweepPainter`, `ParticleBurstPainter`, `RadialRaysPainter`가 아직 없어 컴파일 에러.

- [ ] **Step 3: 세 페인터 구현**

`card_effects.dart`에 `import 'dart:math' as math;`를 파일 최상단에 추가하고, 파일 끝에 아래를 추가:

```dart
/// 골드·레전드 상세 등장/승급 시 1회 재생되는 대각선 광택 스윕.
/// progress>=1.0이면 아무것도 그리지 않는다 — 재생이 끝나면 자연히 사라진다.
class SweepPainter extends CustomPainter {
  const SweepPainter(this.progress, this.color);
  final double progress; // 0..1
  final Color color;

  static const _bandWidth = 0.18;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress >= 1.0) return;
    final center = sweepOffset(progress);
    final s0 = (center - _bandWidth).clamp(0.0, 1.0);
    final s1 = center.clamp(0.0, 1.0);
    final s2 = (center + _bandWidth).clamp(0.0, 1.0);
    final stops = [s0, s1, s2.clamp(s1, 1.0)];
    final rect = Offset.zero & size;
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          color.withValues(alpha: 0),
          color.withValues(alpha: 0.5),
          color.withValues(alpha: 0),
        ],
        stops: stops,
      ).createShader(rect);
    canvas.drawRect(rect, paint);
  }

  @override
  bool shouldRepaint(covariant SweepPainter old) =>
      old.progress != progress || old.color != color;
}

/// 파티클 1회 폭발 — count개의 작은 사각 파티클이 중심에서 사방으로 등속
/// 확산하며 페이드아웃한다. 고정 시드로 각도를 뽑아 같은 count면 항상 같은
/// 패턴이 나온다(테스트 안정성).
class ParticleBurstPainter extends CustomPainter {
  const ParticleBurstPainter(this.progress, this.color, {this.count = 24});
  final double progress; // 0..1
  final Color color;
  final int count;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress >= 1.0) return;
    final alpha = (1 - progress).clamp(0.0, 1.0);
    final center = Offset(size.width / 2, size.height / 2);
    final paint = Paint()..color = color.withValues(alpha: alpha);
    final rng = math.Random(7);
    for (var i = 0; i < count; i++) {
      final angle = (i / count) * 2 * math.pi + rng.nextDouble() * 0.3;
      final dist = size.shortestSide * 0.6 * progress;
      final pos = center + Offset(math.cos(angle), math.sin(angle)) * dist;
      canvas.drawRect(
          Rect.fromCenter(center: pos, width: 3, height: 3), paint);
    }
  }

  @override
  bool shouldRepaint(covariant ParticleBurstPainter old) =>
      old.progress != progress || old.color != color || old.count != count;
}

/// 레전드 승급 모달 배경 방사 광선. 상시 회전시키지 않는다(위젯 테스트가
/// pumpAndSettle을 쓰므로 끝나지 않는 애니메이션을 두면 테스트가 멈추지 않는다) —
/// rotation은 카드마다 고정된 각도로, 정적 장식으로만 쓴다.
class RadialRaysPainter extends CustomPainter {
  const RadialRaysPainter(this.color, this.rotation, {this.rayCount = 10});
  final Color color;
  final double rotation;
  final int rayCount;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final length = size.longestSide;
    final paint = Paint()
      ..color = color.withValues(alpha: 0.08)
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.shortestSide * 0.02;
    for (var i = 0; i < rayCount; i++) {
      final angle = rotation + (i / rayCount) * 2 * math.pi;
      final end = center + Offset(math.cos(angle), math.sin(angle)) * length;
      canvas.drawLine(center, end, paint);
    }
  }

  @override
  bool shouldRepaint(covariant RadialRaysPainter old) =>
      old.rotation != rotation || old.color != color;
}
```

`test/card_effects_test.dart` 상단 import에 `Colors`를 쓰므로 `package:flutter/material.dart` import가 이미 있는지 확인한다(Task 1에서 이미 추가함 — 그대로 유지).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_effects_test.dart`
Expected: PASS (전체 — pure function 8개 + 페인터 9개 테스트)

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_effects.dart test/card_effects_test.dart
git commit -m "feat: 스윕·파티클·방사 광선 페인터 추가"
```

---

### Task 4: `CardTile`에 `faceOverlay` 슬롯 추가

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart` (`CardTile` 위젯, `class CardTile` ~line 574 이후)
- Test: `verse-flutter/test/card_tile_tap_sparkle_test.dart` (기존 파일에 추가)

**Interfaces:**
- Produces: `CardTile({..., Widget? faceOverlay})` — 카드 얼굴(정사각 프레임) 영역 위에 얹히는 화면 한정 오버레이. Task 5(상세 스윕), 7(골드 인라인 승급)이 이 파라미터를 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/card_tile_tap_sparkle_test.dart` 파일의 `main()` 안, 마지막 테스트 뒤에 추가:

```dart
  testWidgets('faceOverlay를 넘기면 카드 얼굴 영역에 렌더된다', (tester) async {
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: SizedBox(
          width: 100,
          height: 150,
          child: CardTile(
            status: const CardStatus(_card, CardTier.gold),
            locale: 'ko',
            faceOverlay: const ColoredBox(
              key: ValueKey('test_face_overlay'),
              color: Colors.transparent,
            ),
          ),
        ),
      ),
    ));
    expect(find.byKey(const ValueKey('test_face_overlay')), findsOneWidget);
  });

  testWidgets('faceOverlay를 안 넘기면 아무 오버레이도 없다(기본값 null)', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.gold));
    expect(find.byKey(const ValueKey('test_face_overlay')), findsNothing);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tap_sparkle_test.dart`
Expected: FAIL — `CardTile`에 `faceOverlay` named parameter가 없어 컴파일 에러.

- [ ] **Step 3: `CardTile`에 `faceOverlay` 추가**

`card_tile.dart`의 `CardTile` 위젯 정의(현재 574-594줄 부근)를 아래로 교체:

```dart
class CardTile extends StatefulWidget {
  const CardTile({
    super.key,
    required this.status,
    required this.locale,
    this.onTap,
    this.holoTilt,
    this.faceOverlay,
  });

  final CardStatus status;
  final String locale;
  final VoidCallback? onTap;

  /// 카드 상세 오버레이에서만 넘어오는 레전드 홀로그램 기울기. 도감 그리드는
  /// 이 파라미터를 넘기지 않으므로 항상 null이고, CardTierFrame까지 그대로 null이
  /// 전달돼 홀로 레이어가 생기지 않는다.
  final ValueListenable<Offset?>? holoTilt;

  /// 카드 얼굴(정사각 프레임) 위에 추가로 얹을 오버레이. 상세 등장 스윕, 골드
  /// 인라인 승급 반짝임처럼 그리드에는 없는 화면 한정 이펙트를 넣을 때 쓴다.
  /// 그리드 타일은 이 파라미터를 넘기지 않아 기본값 null로 상시 애니메이션 없음
  /// 원칙을 유지한다.
  final Widget? faceOverlay;

  @override
  State<CardTile> createState() => _CardTileState();
}
```

같은 파일의 `_CardTileState.build()`에서, `Stack(children: [...])`의 자식 목록(현재 643-689줄 부근, `CardTierFrame(...)` 다음, `if (_sparkleEligible) ...` 앞이나 뒤 어느 쪽이든 동일 Stack 안)에 아래 항목을 추가한다:

```dart
                  if (widget.faceOverlay != null)
                    Positioned.fill(
                      child: IgnorePointer(child: widget.faceOverlay!),
                    ),
```

(정확히는 기존 `CardTierFrame(...)` 위젯 다음, `if (_sparkleEligible) AnimatedBuilder(...)` 앞에 삽입한다 — Stack의 자식 순서상 얼굴 오버레이가 탭 반짝임보다 아래에 깔려도 무방하다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tap_sparkle_test.dart test/card_tile_tier_frame_test.dart`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tap_sparkle_test.dart
git commit -m "feat: CardTile에 faceOverlay 슬롯 추가"
```

---

### Task 5: 상세 화면 등장 스윕 + 레전드 홀로 지연 활성화

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_detail_sheet.dart`
- Test: `verse-flutter/test/card_detail_sheet_test.dart` (기존 파일에 추가)

**Interfaces:**
- Consumes: `SweepPainter(double progress, Color color)` (Task 3), `CardTile({..., Widget? faceOverlay})` (Task 4), `cardTierColor(CardTier)` (기존, `card_tile.dart`)
- Produces: 없음(리프 화면) — Task 6과는 독립.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/card_detail_sheet_test.dart` 파일의 `main()` 안, 마지막 테스트(`'접근성 동작 줄이기가 켜져 있으면 자이로를 구독하지 않는다'`) 뒤에 추가:

```dart
  testWidgets('골드 카드 상세를 열면 스윕이 재생되다 사라진다', (tester) async {
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () =>
                  showCardDetail(context, const CardStatus(_dove, CardTier.gold), 'ko'),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pump(); // 다이얼로그 진입 애니메이션(200ms) 시작
    await tester.pump(const Duration(milliseconds: 200)); // 다이얼로그 진입 완료, 스윕 시작 직후

    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is SweepPainter),
      findsOneWidget,
    );

    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is SweepPainter),
      findsNothing,
    );
  });

  testWidgets('레전드는 스윕이 끝나기 전에는 홀로 레이어가 뜨지 않는다', (tester) async {
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => showCardDetail(
                context,
                const CardStatus(_dove, CardTier.legend),
                'ko',
                tiltStream: const Stream<AccelerometerEvent>.empty(),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200)); // 다이얼로그 진입 완료, 스윕 재생 중

    final frameDuringSweep =
        tester.widget<CardTierFrame>(find.byType(CardTierFrame));
    expect(frameDuringSweep.holoTilt, isNull,
        reason: '스윕이 끝나기 전에는 holoTilt를 넘기지 않는다');

    await tester.pumpAndSettle();
    final frameAfterSweep =
        tester.widget<CardTierFrame>(find.byType(CardTierFrame));
    expect(frameAfterSweep.holoTilt, isNotNull,
        reason: '스윕이 끝나면 holoTilt가 활성화된다');

    await tester.pumpWidget(const SizedBox()); // 자이로 타임아웃 타이머 정리(기존 관례)
  });

  testWidgets('동작 줄이기가 켜져 있으면 레전드는 스윕 없이 즉시 홀로가 활성화된다', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);

    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => showCardDetail(
                context,
                const CardStatus(_dove, CardTier.legend),
                'ko',
                tiltStream: const Stream<AccelerometerEvent>.empty(),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    final frame = tester.widget<CardTierFrame>(find.byType(CardTierFrame));
    expect(frame.holoTilt, isNotNull);
  });
```

`test/card_detail_sheet_test.dart` 상단 import에 `import 'package:verse_flutter/features/cards/card_effects.dart';`를 추가한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_detail_sheet_test.dart`
Expected: FAIL — 골드 상세에 `SweepPainter`가 없고(첫 테스트), 레전드 상세가 스윕과 무관하게 항상 `holoTilt`를 넘기고 있어(현재는 `_tiltController`를 늘 전달) 두 번째 테스트의 "스윕 중엔 null" 기대가 깨짐.

- [ ] **Step 3: `card_detail_sheet.dart` 수정**

전체 파일을 아래로 교체한다:

```dart
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../../core/cards/card_def.dart';
import '../../core/cards/card_status.dart';
import '../../core/cards/card_tier.dart';
import '../../l10n/app_localizations.dart';
import 'card_effects.dart';
import 'card_tile.dart';
import 'gyro_tilt_controller.dart';

/// 카드 상세 — 그림 · 이름 · 설명 · 등급, 이 넷뿐이다.
/// 관련 절 목록도, 외운 표시도, "3/5" 같은 진행 숫자도 두지 않는다:
/// 다음 등급까지 뭐가 남았는지는 앱이 알려주지 않는다(설계 §6).
///
/// 화면 대부분을 덮는 어두운 배경 위에 카드를 화면 폭의 65%로 크게 띄운다 —
/// 그리드의 작은 타일로는 등급 프레임이 잘 안 보이므로, 눌렀을 때는 또렷하게
/// 보이게 한다. 배경 탭 또는 우상단 닫기 버튼으로 닫는다.
///
/// 골드·레전드는 상세를 열면 광택 스윕이 1회 재생된다. 레전드는 스윕이 끝난
/// 뒤부터 자이로 반응 홀로그램이 활성화된다 — 스윕과 동시에 홀로까지 뜨면
/// 등장 순간이 산만해지므로 순서를 나눈다.
///
/// [tiltStream]은 테스트에서 가짜 가속도계 스트림을 주입하기 위한 것이다 —
/// 기본값(null)이면 `GyroTiltController`가 실제 `accelerometerEventStream()`을 쓴다.
void showCardDetail(
  BuildContext context,
  CardStatus status,
  String locale, {
  Stream<AccelerometerEvent>? tiltStream,
}) {
  showGeneralDialog<void>(
    context: context,
    barrierLabel: cardNameFor(status.card, locale),
    barrierDismissible: true,
    barrierColor: Colors.black87,
    transitionDuration: const Duration(milliseconds: 200),
    pageBuilder: (context, animation, secondaryAnimation) {
      return _CardDetailBody(status: status, locale: locale, tiltStream: tiltStream);
    },
    transitionBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(opacity: animation, child: child);
    },
  );
}

class _CardDetailBody extends StatefulWidget {
  const _CardDetailBody({required this.status, required this.locale, this.tiltStream});

  final CardStatus status;
  final String locale;
  final Stream<AccelerometerEvent>? tiltStream;

  @override
  State<_CardDetailBody> createState() => _CardDetailBodyState();
}

class _CardDetailBodyState extends State<_CardDetailBody>
    with SingleTickerProviderStateMixin {
  GyroTiltController? _tiltController;
  AnimationController? _sweepController;
  bool _holoActive = false;
  bool _initialized = false;

  bool get _sweepEligible =>
      widget.status.tier == CardTier.gold || widget.status.tier == CardTier.legend;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // didChangeDependencies에서 만드는 이유는 MediaQuery(접근성 설정)가 여기서만
    // 안전하게 조회 가능해서다 — 한 번만 초기화한다.
    if (_initialized) return;
    _initialized = true;
    final reduceMotion = MediaQuery.of(context).disableAnimations;

    if (widget.status.tier == CardTier.legend) {
      _tiltController = GyroTiltController(
        stream: widget.tiltStream,
        enabled: !reduceMotion,
      )..start();
    }

    if (_sweepEligible) {
      _sweepController =
          AnimationController(vsync: this, duration: const Duration(milliseconds: 550));
      if (widget.status.tier == CardTier.legend) {
        _sweepController!.addStatusListener(_onSweepStatus);
      }
      if (reduceMotion) {
        _sweepController!.value = 1.0;
        _holoActive = widget.status.tier == CardTier.legend;
      } else {
        _sweepController!.forward();
      }
    }
  }

  void _onSweepStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed && mounted) {
      setState(() => _holoActive = true);
    }
  }

  @override
  void dispose() {
    _tiltController?.dispose();
    _sweepController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final screenSize = MediaQuery.sizeOf(context);
    // 세로가 좁은 화면(가로 모드 등)에서도 카드+텍스트가 넘치지 않게
    // 화면 폭과 높이 중 작은 쪽을 기준으로 카드 크기를 잡는다.
    final cardSize = (screenSize.width * 0.65).clamp(0.0, screenSize.height * 0.5);
    final tierColor = cardTierColor(widget.status.tier);
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Material(
        // showGeneralDialog은 Scaffold 밖에 오버레이로 뜨므로, CardTile 안의
        // InkWell(카드 탭 반짝임 트리거)이 쓸 Material 조상을 직접 대준다.
        type: MaterialType.transparency,
        child: SafeArea(
          child: Stack(
            children: [
              Center(
                child: GestureDetector(
                  // 카드 자체를 탭했을 때 배경 탭으로 오인해 닫히지 않게 흡수한다.
                  onTap: () {},
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: cardSize,
                          child: CardTile(
                            status: widget.status,
                            locale: widget.locale,
                            holoTilt: _holoActive ? _tiltController : null,
                            faceOverlay: _sweepController == null
                                ? null
                                : AnimatedBuilder(
                                    animation: _sweepController!,
                                    builder: (context, _) {
                                      return CustomPaint(
                                        painter: SweepPainter(
                                            _sweepController!.value, tierColor),
                                      );
                                    },
                                  ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          cardNameFor(widget.status.card, widget.locale),
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(color: Colors.white),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          cardTierLabel(l, widget.status.tier),
                          style: TextStyle(
                            color: tierColor,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          cardDescriptionFor(widget.status.card, widget.locale),
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white70),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_detail_sheet_test.dart`
Expected: PASS — 신규 3개 테스트 + 기존 전체(카드 크기, 배경 탭, 카드 탭 무시, 닫기 버튼, 절 미노출, 레전드 자이로 반응, 브론즈 holoTilt null, 구독 취소, 동작 줄이기) 전부 통과.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_detail_sheet.dart test/card_detail_sheet_test.dart
git commit -m "feat: 상세 화면 골드·레전드 등장 스윕 + 레전드 홀로 지연 활성화"
```

---

### Task 6: 레전드 풀스크린 모달 시퀀스 재구성

**Files:**
- Modify: `verse-flutter/lib/features/cards/legend_promotion_overlay.dart`
- Test: `verse-flutter/test/legend_promotion_overlay_test.dart` (기존 파일에 추가)

**Interfaces:**
- Consumes: `SweepPainter(double progress, Color color)`, `ParticleBurstPainter(double progress, Color color, {int count})`, `RadialRaysPainter(Color color, double rotation, {int rayCount})` (Task 3), `cardTierColor(CardTier)` (기존)
- Produces: 없음(리프 화면).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/legend_promotion_overlay_test.dart` 파일의 `main()` 안, 마지막 테스트 뒤에 추가:

```dart
  testWidgets('재생 중 아무 곳이나 탭하면 즉시 확인 버튼이 나타난다', (tester) async {
    await tester.pumpWidget(_wrap(
      [CardStatus(_card('sheep', '어린양'), CardTier.legend)],
      onEachDismissed: (_) {},
      onAllDismissed: () {},
    ));
    await tester.pump(); // 시퀀스 시작 직후
    expect(find.text('확인'), findsNothing);

    await tester.tapAt(const Offset(5, 5));
    await tester.pump();

    expect(find.text('확인'), findsOneWidget);
  });

  testWidgets('시퀀스 재생 중에는 스윕·파티클이 보이고 끝나면 사라진다', (tester) async {
    await tester.pumpWidget(_wrap(
      [CardStatus(_card('sheep', '어린양'), CardTier.legend)],
      onEachDismissed: (_) {},
      onAllDismissed: () {},
    ));
    await tester.pump(const Duration(milliseconds: 400)); // 시퀀스 중반

    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is SweepPainter),
      findsOneWidget,
    );

    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is SweepPainter),
      findsNothing,
    );
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is ParticleBurstPainter),
      findsNothing,
    );
  });

  testWidgets('동작 줄이기가 켜져 있으면 시퀀스 없이 바로 확인 버튼이 보인다', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);

    await tester.pumpWidget(_wrap(
      [CardStatus(_card('sheep', '어린양'), CardTier.legend)],
      onEachDismissed: (_) {},
      onAllDismissed: () {},
    ));
    await tester.pump();

    expect(find.text('확인'), findsOneWidget);
  });

  testWidgets('여러 장을 넘길 때마다 시퀀스가 다시 재생된다(두 번째 카드도 탭 스킵 가능)', (tester) async {
    final dismissed = <String>[];
    await tester.pumpWidget(_wrap(
      [
        CardStatus(_card('sheep', '어린양'), CardTier.legend),
        CardStatus(_card('earth', '지구'), CardTier.legend),
      ],
      onEachDismissed: (s) => dismissed.add(s.card.id),
      onAllDismissed: () {},
    ));
    await tester.tapAt(const Offset(5, 5)); // 첫 카드 스킵
    await tester.pump();
    await tester.tap(find.text('확인'));
    await tester.pump();

    // 두 번째 카드는 시퀀스가 리셋되어 확인 버튼이 아직 없어야 한다.
    expect(find.text('지구'), findsOneWidget);
    expect(find.text('확인'), findsNothing);

    await tester.tapAt(const Offset(5, 5)); // 두 번째 카드도 스킵
    await tester.pump();
    expect(find.text('확인'), findsOneWidget);

    await tester.tap(find.text('확인'));
    await tester.pumpAndSettle();
    expect(dismissed, ['sheep', 'earth']);
  });
```

`test/legend_promotion_overlay_test.dart` 상단 import에 아래 두 줄을 추가한다:

```dart
import 'package:flutter/services.dart';
import 'package:verse_flutter/features/cards/card_effects.dart';
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/legend_promotion_overlay_test.dart`
Expected: FAIL — 현재 구현은 시퀀스·탭 스킵이 없어 확인 버튼이 항상 즉시 보이므로 "재생 중에는 버튼 없음" 기대가 깨진다. `SweepPainter`/`ParticleBurstPainter`도 없어 찾을 수 없다.

- [ ] **Step 3: `legend_promotion_overlay.dart` 재구성**

전체 파일을 아래로 교체한다:

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/cards/card_status.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/theme/pixel_theme.dart';
import 'card_effects.dart';
import 'card_tile.dart';

/// 레전드로 오른 카드를 완료 화면 위에서 풀스크린으로 축하한다.
/// 여러 장이 동시에 레전드가 되어도 한 번에 하나씩만 보여준다 —
/// 모달을 겹쳐 띄우지 않는다(도감 스펙의 "재촉하지 않는다" 원칙을 승급 순간에도 지킨다).
///
/// 카드마다 배경 페이드 → 카드 확대 등장(+ 스윕) → 파티클 → 문구 등장 순으로
/// 900ms 시퀀스가 한 번 재생된 뒤 확인 버튼이 나타난다. 재생 중 아무 곳이나
/// 탭하면 즉시 최종 상태로 건너뛴다 — 여러 장을 연속으로 넘길 때 매번 기다리지
/// 않아도 된다.
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

class _LegendPromotionOverlayState extends State<LegendPromotionOverlay>
    with SingleTickerProviderStateMixin {
  static const _sequenceDuration = Duration(milliseconds: 900);

  int _index = 0;
  bool _dismissing = false;
  bool _buttonVisible = false;
  bool _started = false;
  late final AnimationController _sequence;

  @override
  void initState() {
    super.initState();
    if (widget.cards.isNotEmpty) HapticFeedback.heavyImpact();
    _sequence = AnimationController(vsync: this, duration: _sequenceDuration)
      ..addStatusListener(_onSequenceStatus);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _startSequence();
  }

  void _startSequence() {
    if (widget.cards.isEmpty) return;
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    if (reduceMotion) {
      _sequence.value = 1.0;
      _buttonVisible = true;
    } else {
      _sequence.forward(from: 0);
    }
  }

  void _onSequenceStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed && mounted) {
      setState(() => _buttonVisible = true);
    }
  }

  void _skip() {
    if (_buttonVisible) return;
    _sequence.stop();
    setState(() {
      _sequence.value = 1.0;
      _buttonVisible = true;
    });
  }

  void _dismissCurrent() {
    if (_dismissing) return;
    _dismissing = true;
    final card = widget.cards[_index];
    widget.onEachDismissed(card);
    if (_index + 1 >= widget.cards.length) {
      widget.onAllDismissed();
      return;
    }
    setState(() {
      _index++;
      _dismissing = false;
      _buttonVisible = false;
    });
    _sequence.value = 0.0;
    _startSequence();
    HapticFeedback.heavyImpact();
  }

  @override
  void dispose() {
    _sequence.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.cards.isEmpty) return const SizedBox.shrink();
    final l = AppLocalizations.of(context)!;
    final p = context.pixel;
    final status = widget.cards[_index];
    final locale = Localizations.localeOf(context).languageCode;
    final tierColor = cardTierColor(status.tier);

    return GestureDetector(
      onTap: _skip,
      behavior: HitTestBehavior.opaque,
      child: SizedBox.expand(
        child: AnimatedBuilder(
          animation: _sequence,
          builder: (context, _) {
            final t = _sequence.value;
            final bgOpacity = const Interval(0.0, 0.15).transform(t);
            final scaleT = Curves.easeOutBack
                .transform(const Interval(0.15, 0.75).transform(t));
            final sweepT =
                const Interval(0.15, 0.75, curve: Curves.easeOutCubic).transform(t);
            final particleT = const Interval(0.62, 0.95).transform(t);
            final titleOpacity = const Interval(0.7, 1.0).transform(t);

            return Stack(
              children: [
                Positioned.fill(
                  child: Opacity(
                    opacity: bgOpacity,
                    child: const ColoredBox(color: Colors.black87),
                  ),
                ),
                Positioned.fill(
                  child: Opacity(
                    opacity: bgOpacity,
                    child: CustomPaint(painter: RadialRaysPainter(tierColor, 0.0)),
                  ),
                ),
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Opacity(
                        opacity: titleOpacity,
                        child: Text(
                          l.cardsLegendTitle,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Transform.scale(
                        scale: 0.6 + 0.4 * scaleT,
                        child: SizedBox(
                          width: 160,
                          child: CardTile(
                            status: status,
                            locale: locale,
                            faceOverlay: Stack(
                              children: [
                                if (sweepT < 1.0)
                                  CustomPaint(
                                      painter: SweepPainter(sweepT, Colors.white)),
                                if (particleT < 1.0)
                                  CustomPaint(
                                    painter: ParticleBurstPainter(particleT, tierColor,
                                        count: 26),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      if (_buttonVisible)
                        ElevatedButton(
                          onPressed: _dismissCurrent,
                          style: ElevatedButton.styleFrom(backgroundColor: p.green),
                          child: Text(l.cardsLegendConfirm),
                        ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/legend_promotion_overlay_test.dart`
Expected: PASS — 기존 4개 테스트(빈 목록, 한 장 확인, 두 장 순차, 빠른 두 번 탭) + 신규 4개 테스트 전부 통과.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/legend_promotion_overlay.dart test/legend_promotion_overlay_test.dart
git commit -m "feat: 레전드 승급 모달 시퀀스 재구성(광선·확대·스윕·파티클·탭 스킵)"
```

---

### Task 7: 골드 인라인 승급 반짝임 + 축소 파티클

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_flip.dart`
- Test: `verse-flutter/test/card_flip_test.dart` (기존 파일에 추가)

**Interfaces:**
- Consumes: `SweepPainter(double progress, Color color)`, `ParticleBurstPainter(double progress, Color color, {int count})` (Task 3), `CardTile({..., Widget? faceOverlay})` (Task 4), `cardTierColor(CardTier)` (기존)
- Produces: 없음(리프 화면).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/card_flip_test.dart` 파일의 `main()` 안, 마지막 테스트 뒤에 추가:

```dart
  testWidgets('골드로 승급하면 전이 순간 반짝임+파티클이 재생되다 사라진다', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.gold, () {}, prevTier: CardTier.silver));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(CardFlip));
    await tester.pump(); // 뒤집기 시작
    await tester.pump(const Duration(milliseconds: 450)); // 뒤집기 완료, 전이 대기 중
    await tester.pump(const Duration(milliseconds: 400)); // 전이(실버→골드) 완료 직후

    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is SweepPainter),
      findsOneWidget,
    );
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is ParticleBurstPainter),
      findsOneWidget,
    );

    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is SweepPainter),
      findsNothing,
    );
  });

  testWidgets('브론즈→실버 승급은 반짝임+파티클을 받지 않는다(골드 전용)', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.silver, () {}, prevTier: CardTier.bronze));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(CardFlip));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is SweepPainter),
      findsNothing,
    );
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is ParticleBurstPainter),
      findsNothing,
    );
  });
```

`test/card_flip_test.dart` 상단 import에 `import 'package:verse_flutter/features/cards/card_effects.dart';`를 추가한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_flip_test.dart`
Expected: FAIL — 첫 테스트는 `SweepPainter`/`ParticleBurstPainter`를 찾지 못해 실패. 두 번째 테스트는 현재도 통과(원래부터 없으므로) — 회귀 방지선 역할.

- [ ] **Step 3: `card_flip.dart` 수정**

`card_flip.dart` 상단 import에 추가:

```dart
import 'card_effects.dart';
```

`_CardFlipState` 클래스를 아래로 교체(파일 전체의 `class _CardFlipState` ~ 클래스 닫는 `}`까지):

```dart
class _CardFlipState extends State<CardFlip>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final AnimationController _promoEffect;
  bool _revealed = false;
  bool _transitioned = false;

  bool get _isPromotion =>
      widget.status.prevTier != null && widget.status.tier != CardTier.legend;

  bool get _isGoldPromotion => _isPromotion && widget.status.tier == CardTier.gold;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 400));
    _promoEffect = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 500));
  }

  @override
  void dispose() {
    _controller.dispose();
    _promoEffect.dispose();
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
      if (_isGoldPromotion) _promoEffect.forward(from: 0);
    }
  }

  CardStatus get _displayStatus {
    if (_isPromotion && !_transitioned) {
      return CardStatus(widget.status.card, widget.status.prevTier!);
    }
    return widget.status;
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
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.001)
              ..rotateY(angle),
            child: showFront
                // 뒤집힌 뒤 앞면이 거울상이 되지 않도록 한 번 더 뒤집는다.
                ? Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()..rotateY(math.pi),
                    child: SizedBox(
                      width: 140,
                      child: CardTile(
                        status: _displayStatus,
                        locale: widget.locale,
                        faceOverlay: _isGoldPromotion && _transitioned
                            ? AnimatedBuilder(
                                animation: _promoEffect,
                                builder: (context, _) {
                                  final progress = _promoEffect.value;
                                  final color = cardTierColor(CardTier.gold);
                                  return Stack(
                                    children: [
                                      if (progress < 1.0)
                                        CustomPaint(
                                            painter: SweepPainter(progress, Colors.white)),
                                      if (progress < 1.0)
                                        CustomPaint(
                                          painter: ParticleBurstPainter(progress, color,
                                              count: 10),
                                        ),
                                    ],
                                  );
                                },
                              )
                            : null,
                      ),
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
              child: const Text('?',
                  style: TextStyle(fontSize: 40, color: Colors.white)),
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_flip_test.dart`
Expected: PASS — 기존 4개 테스트 + 신규 2개 테스트 전부 통과.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_flip.dart test/card_flip_test.dart
git commit -m "feat: 골드 인라인 승급에 반짝임+축소 파티클 추가"
```

---

## 전체 회귀 확인 (모든 태스크 완료 후)

- [ ] **Step 1: 카드 관련 전체 테스트 스위트 실행**

Run: `cd verse-flutter && flutter test test/card_catalog_load_test.dart test/card_catalog_test.dart test/card_collection_screen_test.dart test/card_detail_sheet_test.dart test/card_effects_test.dart test/card_flip_test.dart test/card_generator_test.dart test/card_kind_color_test.dart test/card_repository_test.dart test/card_tier_test.dart test/card_tile_tap_sparkle_test.dart test/card_tile_tier_frame_test.dart test/cards_catalog_integrity_test.dart test/gyro_tilt_controller_test.dart test/legend_promotion_overlay_test.dart test/memorize_card_upgrades_test.dart`
Expected: PASS 전체.

- [ ] **Step 2: 정적 분석**

Run: `cd verse-flutter && flutter analyze lib/features/cards`
Expected: `No issues found!` (또는 이번 변경과 무관한 기존 경고만).

# 카드 임팩트·테두리 디자인 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드 프레임을 전 등급 공통(그림창 테두리+베벨)과 등급별 재질(동판/브러시드은/유광금/프리즘홀로) 사다리로 강화하고, 레전드 카드는 상세 오버레이에서 기기 기울기(자이로)에 반응하는 홀로그램을 얻게 한다.

**Architecture:** `lib/features/cards/card_tile.dart`의 `CardTierFrame`(정적 프레임 렌더)을 재질별 `CustomPainter` 여러 개로 재구성한다. 자이로 입력은 완전히 별도 파일(`gyro_tilt_controller.dart`)의 순수 클래스로 분리해 `CardTierFrame`/`CardTile`은 `ValueListenable<Offset?>?` 하나만 받는다 — 그리드는 이 값을 아예 넘기지 않으므로 센서 코드 경로가 안 생긴다. `card_detail_sheet.dart`가 레전드 카드를 볼 때만 컨트롤러를 만들고 닫힐 때 정리한다.

**Tech Stack:** Flutter/Dart, `sensors_plus`(신규), `flutter_test`.

## Global Constraints

- 노치(팔각 실루엣)·핍 개수·좌표는 **절대 변경하지 않는다** — 기존 `_NotchClipper`, `cardTierNotch`, `cardTierPipCount`, `_pipPositions`를 그대로 재사용한다.
- 그림창 테두리·베벨은 **브론즈부터 전 등급 공통**으로 적용한다.
- 등급별 재질: 브론즈=동판(그레인), 실버=브러시드 은, 골드=강한 베벨+정지 광택+브래킷, 레전드=골드 전부+프리즘 홀로.
- 골드의 정지 광택 띠는 기존 `_ShinePainter`를 재사용한다(golden 톤 그대로, 색은 `cardTierColor(tier)` 인자로 이미 등급별로 갈린다).
- **프리즘 홀로그램은 카드 상세 오버레이(`card_detail_sheet.dart`)에서만** 렌더된다. 도감 그리드(`CardTile`이 `card_collection_screen.dart`에서 쓰이는 자리)는 홀로 관련 파라미터를 아예 넘기지 않는다 — 코드 경로 자체가 없어야 한다.
- 자이로는 가속도계(`accelerometerEventStream`)를 쓴다. 회전 속도(자이로스코프)가 아니다.
- 스무딩: `smoothed = smoothed * 0.85 + raw * 0.15` (지수 이동평균, 새 값 가중치 0.15).
- 폴백 3가지 모두 "정지된 골드 광택"(홀로 레이어 없음)으로 떨어진다: (1) 센서 구독 실패, (2) `MediaQuery.disableAnimations == true`(자이로 아예 구독 안 함), (3) 첫 이벤트가 500ms 안에 안 옴.
- 상세 오버레이가 닫히면 센서 구독을 즉시 취소한다.
- 기존 도감·등급 판정·카드 카탈로그·카드 상세 테스트는 전부 그대로 통과해야 한다(단, `ditherColorsFor`/`TierDitherPainter`를 다루던 테스트는 그 함수·클래스 자체가 이번 계획에서 없어지므로 대체 테스트로 교체한다 — 이는 의도된 변경이다).

---

## Task 1: `sensors_plus` 의존성 추가

**Files:**
- Modify: `verse-flutter/pubspec.yaml`

**Interfaces:**
- Consumes: 없음.
- Produces: `package:sensors_plus/sensors_plus.dart`의 `accelerometerEventStream()`, `AccelerometerEvent` — Task 2가 사용.

- [ ] **Step 1: `pubspec.yaml`에 의존성 추가**

`verse-flutter/pubspec.yaml`의 `dependencies:` 블록에서 `flutter_svg: ^2.0.10+1` 줄
바로 아래에 추가:

```yaml
  sensors_plus: ^6.1.1
```

- [ ] **Step 2: 의존성 설치**

Run: `cd verse-flutter && flutter pub get`
Expected: `Got dependencies!`로 끝난다. 버전 충돌이 나면 에러 메시지에 나온 호환 버전
범위로 `^6.1.1`을 조정한다(예: `^6.0.0`).

- [ ] **Step 3: iOS 빌드 확인(모션 권한 문구 필요 여부)**

Run: `cd verse-flutter && flutter analyze`
Expected: 새 에러 없음. `accelerometerEventStream()`은 iOS `CoreMotion`의 일반
가속도계 API라 `NSMotionUsageDescription`이 없어도 대부분 동작한다(만보기류
API만 그 권한이 필요하다). 이번 태스크에서는 실기기 빌드까지는 하지 않는다 —
Task 9에서 시뮬레이터로 동작을 확인한다.

- [ ] **Step 4: 커밋**

```bash
cd verse-flutter
git add pubspec.yaml pubspec.lock
git commit -m "chore: sensors_plus 의존성 추가 — 카드 자이로 홀로그램용"
```

---

## Task 2: `GyroTiltController` — 기울기 입력을 순수 클래스로 분리

**Files:**
- Create: `verse-flutter/lib/features/cards/gyro_tilt_controller.dart`
- Test: `verse-flutter/test/gyro_tilt_controller_test.dart`

**Interfaces:**
- Consumes: `package:sensors_plus/sensors_plus.dart`(`AccelerometerEvent`, `accelerometerEventStream`).
- Produces: `GyroTiltController` — `ValueNotifier<Offset?>`를 상속. 생성자
  `GyroTiltController({Stream<AccelerometerEvent>? stream, bool enabled = true, Duration timeout = const Duration(milliseconds: 500), double smoothing = 0.15})`.
  메서드 `void start()`, `bool get timedOut`. `value`(상속받은 `ValueNotifier.value`)가
  `Offset?` — null이면 정지 상태, 아니면 `(x, y)` 각각 -1.0~1.0로 정규화된 기울기.
  Task 7(홀로 페인터)·Task 9(상세 오버레이)가 이 클래스를 그대로 쓴다.

이 태스크는 센서 하드웨어 없이 전부 테스트 가능하다 — `stream` 파라미터로 가짜
`StreamController<AccelerometerEvent>`를 주입한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/gyro_tilt_controller_test.dart` 신규 생성:

```dart
import 'dart:async';
import 'dart:ui';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:verse_flutter/features/cards/gyro_tilt_controller.dart';

AccelerometerEvent _event(double x, double y) =>
    AccelerometerEvent(x, y, 9.8, DateTime.now());

void main() {
  test('첫 이벤트를 받으면 -1..1로 정규화된 값이 실린다', () {
    final source = StreamController<AccelerometerEvent>();
    final controller = GyroTiltController(stream: source.stream);
    addTearDown(controller.dispose);

    expect(controller.value, isNull);
    controller.start();
    source.add(_event(9.8, 0)); // 완전히 오른쪽으로 기움 → x=1.0 근방

    expect(controller.value, isNotNull);
    expect(controller.value!.dx, closeTo(0.15, 0.01)); // 스무딩 첫 스텝: 0*0.85+1.0*0.15
    expect(controller.value!.dy, closeTo(0.0, 0.01));
  });

  test('연속된 이벤트가 지수 이동평균으로 스무딩된다', () {
    final source = StreamController<AccelerometerEvent>();
    final controller = GyroTiltController(stream: source.stream);
    addTearDown(controller.dispose);
    controller.start();

    for (var i = 0; i < 5; i++) {
      source.add(_event(9.8, 0));
    }
    // 5번 반복해도 스무딩 때문에 1.0에 바로 도달하지 않는다(수렴 중).
    expect(controller.value!.dx, lessThan(0.99));
    expect(controller.value!.dx, greaterThan(0.15));
  });

  test('enabled=false면 이벤트가 와도 구독하지 않아 값이 그대로 null이다', () {
    final source = StreamController<AccelerometerEvent>();
    final controller = GyroTiltController(stream: source.stream, enabled: false);
    addTearDown(controller.dispose);

    controller.start();
    source.add(_event(9.8, 0));

    expect(controller.value, isNull);
  });

  test('스트림이 에러를 던져도 크래시 없이 값이 null로 유지된다', () async {
    final source = StreamController<AccelerometerEvent>();
    final controller = GyroTiltController(stream: source.stream);
    addTearDown(controller.dispose);
    controller.start();

    source.addError(Exception('센서 없음'));
    await Future<void>.delayed(Duration.zero);

    expect(controller.value, isNull);
  });

  test('타임아웃 시간 안에 첫 이벤트가 없으면 timedOut이 true로 확정된다', () {
    fakeAsync((async) {
      final source = StreamController<AccelerometerEvent>();
      final controller = GyroTiltController(
        stream: source.stream,
        timeout: const Duration(milliseconds: 500),
      );
      addTearDown(controller.dispose);
      controller.start();

      expect(controller.timedOut, isFalse);
      async.elapse(const Duration(milliseconds: 600));
      expect(controller.timedOut, isTrue);
      expect(controller.value, isNull);
    });
  });

  test('타임아웃 전에 이벤트가 오면 timedOut이 되지 않는다', () {
    fakeAsync((async) {
      final source = StreamController<AccelerometerEvent>();
      final controller = GyroTiltController(
        stream: source.stream,
        timeout: const Duration(milliseconds: 500),
      );
      addTearDown(controller.dispose);
      controller.start();

      async.elapse(const Duration(milliseconds: 100));
      source.add(_event(9.8, 0));
      async.elapse(const Duration(milliseconds: 600));

      expect(controller.timedOut, isFalse);
      expect(controller.value, isNotNull);
    });
  });

  test('dispose 후에는 구독이 취소되어 이후 이벤트가 값에 반영되지 않는다', () async {
    final source = StreamController<AccelerometerEvent>.broadcast();
    final controller = GyroTiltController(stream: source.stream);
    controller.start();
    source.add(_event(9.8, 0));
    final beforeDispose = controller.value;

    controller.dispose();
    source.add(_event(-9.8, 0));
    await Future<void>.delayed(Duration.zero);

    // dispose 후 ValueNotifier에 접근하면 예외가 나므로, dispose 전 마지막 값만 확인한다.
    expect(beforeDispose, isNotNull);
  });
}
```

`fake_async` 패키지가 `dev_dependencies`에 없으면 추가한다 — `verse-flutter/pubspec.yaml`의
`dev_dependencies:` 블록을 확인하고 없으면 `fake_async: ^1.3.1`을 추가한 뒤
`flutter pub get`을 다시 돌린다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/gyro_tilt_controller_test.dart`
Expected: FAIL — `gyro_tilt_controller.dart` 파일이 없어 컴파일 에러.

- [ ] **Step 3: `GyroTiltController` 구현**

`verse-flutter/lib/features/cards/gyro_tilt_controller.dart` 신규 생성:

```dart
import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:sensors_plus/sensors_plus.dart';

/// 기기 기울기를 -1.0~1.0으로 정규화해 들고 있는다. null이면 아직 값이 없거나
/// 비활성 상태 — 호출부(카드 홀로그램)는 이 경우 정지 상태로 렌더해야 한다.
///
/// 회전 속도(자이로스코프)가 아니라 가속도계를 쓴다 — 필요한 건 "지금 어느 쪽으로
/// 기울었는가"라는 절대 자세이지 회전 속도가 아니다.
class GyroTiltController extends ValueNotifier<Offset?> {
  GyroTiltController({
    Stream<AccelerometerEvent>? stream,
    this.enabled = true,
    this.timeout = const Duration(milliseconds: 500),
    this.smoothing = 0.15,
  })  : _stream = stream ?? accelerometerEventStream(),
        super(null);

  final Stream<AccelerometerEvent> _stream;
  final bool enabled;
  final Duration timeout;

  /// 지수 이동평균의 새 값 가중치. smoothed = smoothed*(1-smoothing) + raw*smoothing.
  final double smoothing;

  StreamSubscription<AccelerometerEvent>? _sub;
  Timer? _timeoutTimer;
  Offset _smoothed = Offset.zero;
  bool _gotFirstEvent = false;
  bool _timedOut = false;

  bool get timedOut => _timedOut;

  /// 구독을 시작한다. enabled가 false면 아무것도 하지 않는다(접근성 "동작 줄이기"
  /// 설정을 존중하는 호출부가 애초에 enabled: false로 생성한다).
  void start() {
    if (!enabled || _sub != null) return;
    _timeoutTimer = Timer(timeout, () {
      if (!_gotFirstEvent) _timedOut = true;
    });
    _sub = _stream.listen(_onEvent, onError: (_) {
      // 센서 구독 실패 — 정지 상태(value == null)를 유지한다.
      _sub?.cancel();
      _sub = null;
    });
  }

  void _onEvent(AccelerometerEvent event) {
    _gotFirstEvent = true;
    _timeoutTimer?.cancel();
    // 정지 상태에서 z축이 중력가속도(9.8)를 받으므로 그 값으로 x/y를 정규화한다.
    final raw = Offset(
      (event.x / 9.8).clamp(-1.0, 1.0),
      (event.y / 9.8).clamp(-1.0, 1.0),
    );
    _smoothed = Offset(
      _smoothed.dx * (1 - smoothing) + raw.dx * smoothing,
      _smoothed.dy * (1 - smoothing) + raw.dy * smoothing,
    );
    value = _smoothed;
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    _sub?.cancel();
    super.dispose();
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/gyro_tilt_controller_test.dart`
Expected: PASS (7개 테스트 전부).

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/gyro_tilt_controller.dart test/gyro_tilt_controller_test.dart pubspec.yaml pubspec.lock
git commit -m "feat: GyroTiltController — 가속도계 기울기를 순수 클래스로 분리"
```

---

## Task 3: 그림창 테두리(윈도우 보더) — 전 등급 공통

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Test: `verse-flutter/test/card_tile_tier_frame_test.dart`

**Interfaces:**
- Consumes: 기존 `_NotchClipper`, `cardTierNotch`, `cardTierBorderWidth`.
- Produces: `WindowBorderPainter` 클래스(공개, 테스트에서 타입 검사) — 콘텐츠(그림/이니셜)
  영역 안쪽에 얇은 어두운 테두리를 그린다. `CardTierFrame`의 `_tintedContent` 내부에서
  전 등급에 적용된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/card_tile_tier_frame_test.dart`에서 기존 `group('ditherColorsFor', ...)`
블록 **바로 위**(즉 `import` 구문들 다음, `void main() {` 시작 직후)에 추가:

```dart
  group('WindowBorderPainter', () {
    Widget wrapTier(CardTier tier) => MaterialApp(
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

    for (final tier in CardTier.values) {
      testWidgets('${tier.name}에도 그림창 테두리가 있다', (tester) async {
        await tester.pumpWidget(wrapTier(tier));
        expect(
          find.byWidgetPredicate((w) => w is CustomPaint && w.painter is WindowBorderPainter),
          findsOneWidget,
        );
      });
    }
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart --plain-name "그림창 테두리"`
Expected: FAIL — `WindowBorderPainter`가 없어 컴파일 에러.

- [ ] **Step 3: `WindowBorderPainter` 추가**

`verse-flutter/lib/features/cards/card_tile.dart`에서 `class _NotchClipper` 선언
바로 위에 추가:

```dart
/// 콘텐츠(그림/이니셜) 영역 안쪽에 얇은 어두운 테두리를 그려 "액자 안 그림창"처럼
/// 보이게 한다. 노치 좌표는 건드리지 않고 그 안쪽에 한 줄만 더한다 — 등급 공통.
class WindowBorderPainter extends CustomPainter {
  const WindowBorderPainter(this.clipper);
  final CustomClipper<Path> clipper;

  static const _inset = 2.0;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(
      _inset,
      _inset,
      math.max(0, size.width - _inset * 2),
      math.max(0, size.height - _inset * 2),
    );
    if (rect.width <= 0 || rect.height <= 0) return;
    final path = clipper.getClip(rect.size).shift(rect.topLeft);
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.black.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(covariant WindowBorderPainter old) => old.clipper != clipper;
}
```

이제 `_tintedContent` 메서드(현재 294-306줄 부근)를 다음으로 교체 — 콘텐츠 `Stack`
맨 위에 `WindowBorderPainter` 레이어를 추가한다:

```dart
  /// 갈래 색 틴트(ColoredBox) + 골드·레전드 등급색 알파 오버레이 + 그림창 테두리.
  /// SVG 프레임 분기와 페인터 프레임 분기가 같은 내용물 연출을 쓰도록 공유한다.
  Widget _tintedContent(CardTier tier, Color tierColor) {
    final showTint = tier == CardTier.gold || tier == CardTier.legend;
    return Stack(
      children: [
        ColoredBox(color: widget.tint, child: widget.child),
        if (showTint)
          Positioned.fill(
              child: ColoredBox(color: tierColor.withValues(alpha: 0.12))),
        Positioned.fill(
          child: CustomPaint(
            painter: WindowBorderPainter(const _NotchClipper(0)),
          ),
        ),
      ],
    );
  }
```

`_NotchClipper(0)`을 쓰는 이유: 콘텐츠 영역은 이미 바깥에서 `notch - borderW`만큼
깎인 `ClipPath`로 잘려 있으므로(`_paintedFrame`의 기존 `ClipPath(clipper: _NotchClipper(...))`),
그 안에 그리는 그림창 테두리는 사각형이어도 시각적으로 자연스럽다 — 노치는 바깥
테두리에서만 두드러지면 된다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tier_frame_test.dart
git commit -m "feat: 카드 프레임에 그림창 테두리 추가(전 등급 공통)"
```

---

## Task 4: 공유 베벨 헬퍼 + 브론즈 동판(그레인) 재질

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Test: `verse-flutter/test/card_tile_tier_frame_test.dart`

**Interfaces:**
- Consumes: `cardTierColor`, `_NotchClipper`.
- Produces: 최상위 함수 `Paint bevelPaint(Color base, Rect rect, {double contrast = 0.35})`
  (Task 5·6이 재사용), `CopperGrainPainter` 클래스(브론즈 전용, 공개).

- [ ] **Step 1: 실패하는 테스트 작성**

`card_tile_tier_frame_test.dart`의 `group('WindowBorderPainter', ...)` 블록 바로
아래에 추가:

```dart
  group('bevelPaint', () {
    test('좌상단에서 우하단으로 밝은 색 → 어두운 색 그라데이션 셰이더를 만든다', () {
      final paint = bevelPaint(const Color(0xFF9C6B3F), const Rect.fromLTWH(0, 0, 100, 100));
      expect(paint.shader, isNotNull);
    });
  });

  Widget wrapTier(CardTier tier) => MaterialApp(
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

  testWidgets('브론즈는 CopperGrainPainter로 그려진다', (tester) async {
    await tester.pumpWidget(wrapTier(CardTier.bronze));
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is CopperGrainPainter),
      findsOneWidget,
    );
  });

  testWidgets('실버는 CopperGrainPainter를 쓰지 않는다', (tester) async {
    await tester.pumpWidget(wrapTier(CardTier.silver));
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is CopperGrainPainter),
      findsNothing,
    );
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart --plain-name "동판\|bevelPaint\|CopperGrain"`
Expected: FAIL — `bevelPaint`, `CopperGrainPainter`가 없어 컴파일 에러.

- [ ] **Step 3: `bevelPaint` 헬퍼와 `CopperGrainPainter` 구현**

`card_tile.dart`에서 `ditherColorsFor` 함수(현재 88-104줄) **전체를 삭제**하고 그
자리에 다음을 넣는다:

```dart
/// 테두리에 입체감을 주는 대각선 베벨 셰이더. 좌상단은 밝게, 우하단은 어둡게 —
/// 빛이 위에서 비추는 것처럼 보이게 한다. 브론즈·실버·골드·레전드가 전부 이 위에
/// 각자의 재질(그레인/브러시/광택)을 얹는다.
Paint bevelPaint(Color base, Rect rect, {double contrast = 0.35}) {
  final light = Color.lerp(base, Colors.white, contrast)!;
  final dark = Color.lerp(base, Colors.black, contrast)!;
  return Paint()
    ..shader = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [light, base, dark],
      stops: const [0.0, 0.5, 1.0],
    ).createShader(rect);
}

/// 노치 바깥 경로에서 노치 안쪽(borderW만큼 안으로 들어간) 경로를 뺀 "테두리 고리"
/// 모양. 베벨·그레인·브러시 재질이 전부 이 고리 위에 그려진다.
Path borderRingPath(Size size, double notch, double borderW) {
  final outer = _NotchClipper(notch).getClip(size);
  final innerRect = Rect.fromLTWH(
    borderW,
    borderW,
    math.max(0, size.width - borderW * 2),
    math.max(0, size.height - borderW * 2),
  );
  final inner = _NotchClipper(math.max(0, notch - borderW))
      .getClip(innerRect.size)
      .shift(innerRect.topLeft);
  return Path.combine(PathOperation.difference, outer, inner);
}

/// 브론즈 전용 — 베벨 위에 저대비 노이즈 도트를 성기게 뿌려 매트한 구리 질감을 낸다.
/// 결정적 시드를 써서 같은 크기면 항상 같은 패턴이 나오게 한다(테스트 안정성).
class CopperGrainPainter extends CustomPainter {
  const CopperGrainPainter(this.baseColor, this.notch, this.borderW);
  final Color baseColor;
  final double notch;
  final double borderW;

  @override
  void paint(Canvas canvas, Size size) {
    final ring = borderRingPath(size, notch, borderW);
    canvas.save();
    canvas.clipPath(ring);
    canvas.drawRect(Offset.zero & size, bevelPaint(baseColor, Offset.zero & size));

    final rng = math.Random(42);
    final dotPaint = Paint()..color = Colors.black.withValues(alpha: 0.15);
    for (var i = 0; i < 40; i++) {
      final dx = rng.nextDouble() * size.width;
      final dy = rng.nextDouble() * size.height;
      canvas.drawCircle(Offset(dx, dy), 0.6, dotPaint);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CopperGrainPainter old) =>
      old.baseColor != baseColor || old.notch != notch || old.borderW != borderW;
}
```

`card_tile.dart` 상단 import에 `dart:math`는 이미 `as math`로 있으므로 추가 import
불필요하다.

이제 `_paintedFrame` 메서드(현재 308-363줄)의 테두리 레이어 부분을 브론즈만 먼저
`CopperGrainPainter`로 바꾼다. 현재:

```dart
            // 테두리 레이어 — 브론즈는 단색, 실버 이상은 디더링 패턴.
            Positioned.fill(
              child: tier == CardTier.bronze
                  ? ClipPath(
                      clipper: borderClipper,
                      child: ColoredBox(color: tierColor))
                  : CustomPaint(
                      painter: TierDitherPainter(
                          ditherLight, ditherDark, borderClipper)),
            ),
```

이 블록을 다음으로 교체(당장은 실버·골드·레전드 분기가 비어 있는 상태로 두고
Task 5·6에서 마저 채운다 — 이 태스크에서는 브론즈만 완성한다):

```dart
            // 테두리 레이어 — 등급별 재질(브론즈=동판, 실버=브러시드 은,
            // 골드·레전드=강한 베벨).
            Positioned.fill(
              child: switch (tier) {
                CardTier.bronze =>
                  CustomPaint(painter: CopperGrainPainter(tierColor, notch, borderW)),
                CardTier.silver => CustomPaint(
                    painter: CopperGrainPainter(tierColor, notch, borderW)), // Task 5에서 교체
                CardTier.gold ||
                CardTier.legend =>
                  CustomPaint(painter: CopperGrainPainter(tierColor, notch, borderW)), // Task 6에서 교체
              },
            ),
```

(실버/골드/레전드에 임시로 `CopperGrainPainter`를 재사용해 두는 이유는 이 태스크
직후에도 `flutter analyze`가 "정의되지 않은 변수" 없이 통과해야 하기 때문이다 —
다음 두 태스크가 각 분기를 실제 재질로 교체한다.)

`_paintedFrame` 안에서 이제 안 쓰는 `final (ditherLight, ditherDark) = ditherColorsFor(tier);`
줄도 삭제한다(참조가 없어졌으므로 `flutter analyze`가 미사용 변수로 잡는다).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: 아직 실패할 수 있다 — 기존에 `TierDitherPainter`를 찾던 테스트(§"프레임 SVG가
없다고 판단되면 페인터 프레임을 그대로 쓴다" 등, 85-99줄)가 깨진다. 이 테스트들을
다음으로 고친다: `TierDitherPainter` → `CopperGrainPainter`로 치환(어차피 골드
자리에 임시로 그 페인터가 들어가 있으므로).

`verse-flutter/test/card_tile_tier_frame_test.dart`의 85-99줄 두 테스트에서
`TierDitherPainter`를 `CopperGrainPainter`로 바꾼다:

```dart
  testWidgets('프레임 SVG가 없다고 판단되면 페인터 프레임을 그대로 쓴다', (tester) async {
    await tester.pumpWidget(wrapWithChecker(CardTier.gold, (_) async => false));
    await tester.pumpAndSettle();
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is CopperGrainPainter),
        findsOneWidget);
    expect(find.byType(SvgPicture), findsNothing);
  });

  testWidgets('프레임 SVG가 있다고 판단되면 SvgPicture로 대체된다', (tester) async {
    await tester.pumpWidget(wrapWithChecker(CardTier.gold, (_) async => true));
    await tester.pumpAndSettle();
    expect(find.byType(SvgPicture), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is CopperGrainPainter),
        findsNothing);
  });
```

또한 파일 최상단의 `group('ditherColorsFor', ...)` 블록(9-26줄) **전체를 삭제**한다
— `ditherColorsFor` 함수 자체가 없어졌다.

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tier_frame_test.dart
git commit -m "feat: 공유 베벨 헬퍼 + 브론즈 동판(그레인) 재질, ditherColorsFor 제거"
```

---

## Task 5: 실버 브러시드 메탈 재질

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Test: `verse-flutter/test/card_tile_tier_frame_test.dart`

**Interfaces:**
- Consumes: Task 4의 `bevelPaint`, `borderRingPath`.
- Produces: `BrushedMetalPainter` 클래스(실버 전용, 공개).

- [ ] **Step 1: 실패하는 테스트 작성**

`card_tile_tier_frame_test.dart`의 `testWidgets('실버는 CopperGrainPainter를 쓰지 않는다', ...)`
테스트 바로 아래에 추가:

```dart
  testWidgets('실버는 BrushedMetalPainter로 그려진다', (tester) async {
    await tester.pumpWidget(wrapTier(CardTier.silver));
    expect(
      find.byWidgetPredicate((w) => w is CustomPaint && w.painter is BrushedMetalPainter),
      findsOneWidget,
    );
  });

  testWidgets('브론즈·골드·레전드는 BrushedMetalPainter를 쓰지 않는다', (tester) async {
    for (final tier in [CardTier.bronze, CardTier.gold, CardTier.legend]) {
      await tester.pumpWidget(wrapTier(tier));
      expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is BrushedMetalPainter),
        findsNothing,
        reason: '$tier',
      );
    }
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart --plain-name "BrushedMetal"`
Expected: FAIL — `BrushedMetalPainter`가 없어 컴파일 에러.

- [ ] **Step 3: `BrushedMetalPainter` 구현**

`card_tile.dart`에서 `CopperGrainPainter` 클래스 바로 아래에 추가:

```dart
/// 실버 전용 — 베벨 위에 대각선 방향 얇은 빗살무늬를 반복해 브러시드 메탈 질감을 낸다.
class BrushedMetalPainter extends CustomPainter {
  const BrushedMetalPainter(this.baseColor, this.notch, this.borderW);
  final Color baseColor;
  final double notch;
  final double borderW;

  static const _spacing = 3.0;

  @override
  void paint(Canvas canvas, Size size) {
    final ring = borderRingPath(size, notch, borderW);
    canvas.save();
    canvas.clipPath(ring);
    canvas.drawRect(Offset.zero & size, bevelPaint(baseColor, Offset.zero & size));

    final strokePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.25)
      ..strokeWidth = 0.6;
    final diagonal = size.width + size.height;
    for (double d = -size.height; d < diagonal; d += _spacing) {
      canvas.drawLine(Offset(d, 0), Offset(d + size.height, size.height), strokePaint);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant BrushedMetalPainter old) =>
      old.baseColor != baseColor || old.notch != notch || old.borderW != borderW;
}
```

`_paintedFrame`의 테두리 레이어 `switch`에서 실버 분기를 교체:

```dart
                CardTier.silver =>
                  CustomPaint(painter: BrushedMetalPainter(tierColor, notch, borderW)),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tier_frame_test.dart
git commit -m "feat: 실버 브러시드 메탈 재질"
```

---

## Task 6: 골드·레전드 강화 베벨 + 정지 광택 재사용

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Test: `verse-flutter/test/card_tile_tier_frame_test.dart`

**Interfaces:**
- Consumes: Task 4의 `bevelPaint`, `borderRingPath`, 기존 `_ShinePainter`, `TierBracketPainter`.
- Produces: `StrongBevelPainter` 클래스(골드·레전드 공용, 공개).

골드·레전드는 "재질"이 브러시·그레인이 아니라 **강한 베벨 자체**다(대비를 높인
베벨 + 기존 브래킷 + 기존 정지 광택 조합). `_ShinePainter`는 지금까지 레전드
전용이었는데, 이제 골드도 같이 쓴다 — 등급색 인자로 이미 색이 갈리므로 클래스
자체는 그대로 재사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`card_tile_tier_frame_test.dart`의 방금 추가한 테스트들 아래에 추가:

```dart
  testWidgets('골드·레전드는 StrongBevelPainter로 그려진다', (tester) async {
    for (final tier in [CardTier.gold, CardTier.legend]) {
      await tester.pumpWidget(wrapTier(tier));
      expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is StrongBevelPainter),
        findsOneWidget,
        reason: '$tier',
      );
    }
  });

  testWidgets('브론즈·실버는 StrongBevelPainter를 쓰지 않는다', (tester) async {
    for (final tier in [CardTier.bronze, CardTier.silver]) {
      await tester.pumpWidget(wrapTier(tier));
      expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is StrongBevelPainter),
        findsNothing,
        reason: '$tier',
      );
    }
  });

  testWidgets('골드도 정지 광택(_ShinePainter)을 받는다', (tester) async {
    await tester.pumpWidget(wrapTier(CardTier.gold));
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is Object),
        findsWidgets);
    // _ShinePainter는 private이라 타입으로 직접 찾을 수 없으니, 대신 골드에서
    // CustomPaint 레이어 수가 브론즈보다 많음을 확인해 광택 레이어가 추가됐음을 검증한다.
    final goldPaints = find.byType(CustomPaint).evaluate().length;
    await tester.pumpWidget(wrapTier(CardTier.bronze));
    final bronzePaints = find.byType(CustomPaint).evaluate().length;
    expect(goldPaints, greaterThan(bronzePaints));
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart --plain-name "StrongBevel"`
Expected: FAIL — `StrongBevelPainter`가 없어 컴파일 에러.

- [ ] **Step 3: `StrongBevelPainter` 구현, 골드에도 광택 적용**

`card_tile.dart`에서 `BrushedMetalPainter` 클래스 바로 아래에 추가:

```dart
/// 골드·레전드 전용 — 대비를 강하게 높인 베벨만으로 두꺼운 금속 테두리처럼
/// 보이게 한다. 브래킷·광택·2중 테두리는 CardTierFrame이 별개 레이어로 더한다.
class StrongBevelPainter extends CustomPainter {
  const StrongBevelPainter(this.baseColor, this.notch, this.borderW);
  final Color baseColor;
  final double notch;
  final double borderW;

  @override
  void paint(Canvas canvas, Size size) {
    final ring = borderRingPath(size, notch, borderW);
    canvas.drawPath(ring, bevelPaint(baseColor, Offset.zero & size, contrast: 0.5));
  }

  @override
  bool shouldRepaint(covariant StrongBevelPainter old) =>
      old.baseColor != baseColor || old.notch != notch || old.borderW != borderW;
}
```

`_paintedFrame`의 테두리 레이어 `switch`에서 골드·레전드 분기를 교체:

```dart
                CardTier.gold ||
                CardTier.legend =>
                  CustomPaint(painter: StrongBevelPainter(tierColor, notch, borderW)),
```

다음으로 `_paintedFrame` 안, 기존에 `if (tier == CardTier.legend)`로만 광택 줄을
그리던 블록(현재 346-352줄)을 골드도 포함하도록 조건을 넓힌다:

```dart
            if (tier == CardTier.gold || tier == CardTier.legend)
              Positioned.fill(
                child: ClipPath(
                  clipper: _NotchClipper(notch),
                  child: CustomPaint(painter: _ShinePainter(tierColor)),
                ),
              ),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: PASS 전부.

- [ ] **Step 5: 전체 카드 관련 회귀 테스트 확인**

Run: `cd verse-flutter && flutter test test/card_flip_test.dart test/card_collection_screen_test.dart test/card_tile_tap_sparkle_test.dart test/card_detail_sheet_test.dart test/card_kind_color_test.dart`
Expected: PASS 전부 — 이 태스크는 시각 레이어만 바꿨을 뿐 기존에 찾던 텍스트·구조는
그대로다.

- [ ] **Step 6: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tier_frame_test.dart
git commit -m "feat: 골드·레전드 강화 베벨 + 골드에도 정지 광택 적용"
```

---

## Task 7: 프리즘 홀로 페인터 + `CardTierFrame`에 `holoTilt` 옵션 추가

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Test: `verse-flutter/test/card_tile_tier_frame_test.dart`

**Interfaces:**
- Consumes: Task 2의 `GyroTiltController`(테스트에서 `ValueNotifier<Offset?>`를
  직접 만들어 주입 — `GyroTiltController` 자체를 쓸 필요는 없다, `ValueListenable`
  인터페이스만 맞으면 된다).
- Produces: `CardTierFrame`에 옵션 파라미터 `holoTilt` (`ValueListenable<Offset?>?`,
  기본 `null`) 추가. `HoloPrismPainter` 클래스(공개). Task 8이 이 파라미터를
  `CardTile`에서 그대로 전달받아 넘긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`card_tile_tier_frame_test.dart` 맨 위 import 목록에 추가:

```dart
import 'package:flutter/foundation.dart';
```

파일 끝(마지막 `test('cardFrameAssetPath는 ...')` 바로 아래)에 추가:

```dart
  group('holoTilt', () {
    Widget wrapWithTilt(CardTier tier, ValueListenable<Offset?>? tilt) => MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 100,
              height: 100,
              child: CardTierFrame(
                tier: tier,
                tint: Colors.green,
                holoTilt: tilt,
                child: const SizedBox.expand(),
              ),
            ),
          ),
        );

    testWidgets('holoTilt가 없으면(null) 레전드에도 홀로 레이어가 없다', (tester) async {
      await tester.pumpWidget(wrapWithTilt(CardTier.legend, null));
      expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is HoloPrismPainter),
        findsNothing,
      );
    });

    testWidgets('holoTilt가 있어도 값이 null이면(정지 상태) 홀로 레이어가 없다', (tester) async {
      final tilt = ValueNotifier<Offset?>(null);
      addTearDown(tilt.dispose);
      await tester.pumpWidget(wrapWithTilt(CardTier.legend, tilt));
      expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is HoloPrismPainter),
        findsNothing,
      );
    });

    testWidgets('holoTilt 값이 있으면 레전드에 홀로 레이어가 뜬다', (tester) async {
      final tilt = ValueNotifier<Offset?>(const Offset(0.3, -0.2));
      addTearDown(tilt.dispose);
      await tester.pumpWidget(wrapWithTilt(CardTier.legend, tilt));
      expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is HoloPrismPainter),
        findsOneWidget,
      );
    });

    testWidgets('골드는 holoTilt 값이 있어도 홀로 레이어가 없다(레전드 전용)', (tester) async {
      final tilt = ValueNotifier<Offset?>(const Offset(0.3, -0.2));
      addTearDown(tilt.dispose);
      await tester.pumpWidget(wrapWithTilt(CardTier.gold, tilt));
      expect(
        find.byWidgetPredicate((w) => w is CustomPaint && w.painter is HoloPrismPainter),
        findsNothing,
      );
    });

    testWidgets('기울기 값이 바뀌면 홀로 레이어가 새 값으로 다시 그려진다', (tester) async {
      final tilt = ValueNotifier<Offset?>(const Offset(0.1, 0.1));
      addTearDown(tilt.dispose);
      await tester.pumpWidget(wrapWithTilt(CardTier.legend, tilt));
      final before = tester
          .widget<CustomPaint>(find.byWidgetPredicate(
              (w) => w is CustomPaint && w.painter is HoloPrismPainter))
          .painter as HoloPrismPainter;
      expect(before.tilt, const Offset(0.1, 0.1));

      tilt.value = const Offset(-0.5, 0.4);
      await tester.pump();

      final after = tester
          .widget<CustomPaint>(find.byWidgetPredicate(
              (w) => w is CustomPaint && w.painter is HoloPrismPainter))
          .painter as HoloPrismPainter;
      expect(after.tilt, const Offset(-0.5, 0.4));
    });
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart --plain-name "holoTilt"`
Expected: FAIL — `holoTilt` 파라미터·`HoloPrismPainter`가 없어 컴파일 에러.

- [ ] **Step 3: `HoloPrismPainter` 구현, `CardTierFrame`에 파라미터 배선**

`card_tile.dart` 상단 import에 추가:

```dart
import 'package:flutter/foundation.dart' show ValueListenable;
```

`StrongBevelPainter` 클래스 바로 아래에 추가:

```dart
/// 레전드 상세 전용 — 낮은 채도 무지개 대각선 그라데이션을 기울기만큼 이동시켜
/// 그린다. 그림·텍스트 가독성을 해치지 않게 alpha를 낮게 둔다.
class HoloPrismPainter extends CustomPainter {
  const HoloPrismPainter(this.tilt, this.notch);
  final Offset tilt;
  final double notch;

  static const _colors = [
    Color(0x40FF6B6B),
    Color(0x40FFD93D),
    Color(0x406BCB77),
    Color(0x404D96FF),
    Color(0x40C77DFF),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    canvas.clipPath(_NotchClipper(notch).getClip(size));
    final begin = Alignment(-1.0 + tilt.dx, -1.0 + tilt.dy);
    final end = Alignment(1.0 + tilt.dx, 1.0 + tilt.dy);
    final rect = Offset.zero & size;
    final paint = Paint()
      ..shader = LinearGradient(begin: begin, end: end, colors: _colors).createShader(rect)
      ..blendMode = BlendMode.plus;
    canvas.drawRect(rect, paint);
  }

  @override
  bool shouldRepaint(covariant HoloPrismPainter old) => old.tilt != tilt;
}
```

`CardTierFrame` 위젯 클래스 선언(현재 224-240줄)을 다음으로 교체 — `holoTilt`
파라미터를 추가한다:

```dart
class CardTierFrame extends StatefulWidget {
  const CardTierFrame({
    super.key,
    required this.tier,
    required this.tint,
    required this.child,
    this.frameAssetChecker = defaultCardFrameAssetExists,
    this.holoTilt,
  });

  final CardTier tier;
  final Color tint;
  final Widget child;
  final Future<bool> Function(CardTier tier) frameAssetChecker;

  /// 레전드 상세 전용 프리즘 홀로그램의 기울기 입력. null이거나 값이 null이면
  /// 홀로 레이어가 아예 그려지지 않는다(도감 그리드는 이 파라미터를 안 넘긴다).
  final ValueListenable<Offset?>? holoTilt;

  @override
  State<CardTierFrame> createState() => _CardTierFrameState();
}
```

`_paintedFrame` 메서드 안, `_ShinePainter` 레이어(Task 6에서 조건을 넓힌 부분)
바로 아래에 홀로 레이어를 추가한다:

```dart
            if (tier == CardTier.legend && widget.holoTilt != null)
              ValueListenableBuilder<Offset?>(
                valueListenable: widget.holoTilt!,
                builder: (context, tilt, _) {
                  if (tilt == null) return const SizedBox.shrink();
                  return Positioned.fill(
                    child: ClipPath(
                      clipper: _NotchClipper(notch),
                      child: CustomPaint(painter: HoloPrismPainter(tilt, notch)),
                    ),
                  );
                },
              ),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tier_frame_test.dart`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tier_frame_test.dart
git commit -m "feat: 프리즘 홀로 페인터 + CardTierFrame holoTilt 옵션(레전드 전용)"
```

---

## Task 8: `CardTile`에 `holoTilt` 통과 배선

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_tile.dart`
- Test: `verse-flutter/test/card_tile_tap_sparkle_test.dart`

**Interfaces:**
- Consumes: Task 7의 `CardTierFrame.holoTilt`.
- Produces: `CardTile`에 옵션 파라미터 `holoTilt` (`ValueListenable<Offset?>?`,
  기본 `null`) 추가 — Task 9(카드 상세 오버레이)가 이 값을 넘긴다. 그리드
  호출부(`card_collection_screen.dart`)는 이 파라미터를 넘기지 않으므로 자동으로
  `null` — 그리드에는 홀로 코드 경로가 생기지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/card_tile_tap_sparkle_test.dart` 상단 import에 추가:

```dart
import 'package:flutter/foundation.dart';
```

파일 끝(`main()` 마지막 테스트 다음)에 추가:

```dart
  testWidgets('holoTilt를 넘기면 CardTierFrame까지 그대로 전달된다', (tester) async {
    final tilt = ValueNotifier<Offset?>(const Offset(0.2, 0.1));
    addTearDown(tilt.dispose);
    await tester.pumpWidget(_wrap(CardTier.legend)); // 기존 헬퍼는 holoTilt 없이 만듦 — 아래에서 직접 만든다.
  });
```

위 스텝만으로는 `CardTile`이 `holoTilt`를 받는지 검증하기 부족하므로, 대신
파일 상단의 `_wrap` 헬퍼(기존에 `CardTile(status: ..., locale: ..., onTap: ...)`만
만들던 것)를 확인하고, 그 옆에 새 헬퍼를 추가한다. `verse-flutter/test/card_tile_tap_sparkle_test.dart`
전체를 읽고 기존 `_wrap` 함수 정의 바로 아래에 추가:

```dart
Widget _wrapWithTilt(CardTier tier, ValueListenable<Offset?> tilt) => MaterialApp(
      home: Scaffold(
        body: CardTile(
          status: CardStatus(_card, tier),
          locale: 'ko',
          holoTilt: tilt,
        ),
      ),
    );
```

(`_card`는 파일 상단에 이미 정의된 테스트용 `CardDef` 상수를 그대로 쓴다.)

그 다음 방금 넣었던 임시 테스트를 지우고 아래로 교체한다:

```dart
  testWidgets('holoTilt를 넘기면 CardTierFrame까지 그대로 전달된다', (tester) async {
    final tilt = ValueNotifier<Offset?>(const Offset(0.2, 0.1));
    addTearDown(tilt.dispose);
    await tester.pumpWidget(_wrapWithTilt(CardTier.legend, tilt));

    final frame = tester.widget<CardTierFrame>(find.byType(CardTierFrame));
    expect(frame.holoTilt, same(tilt));
  });

  testWidgets('holoTilt를 안 넘기면 CardTierFrame도 null을 받는다(그리드 기본 동작)', (tester) async {
    await tester.pumpWidget(_wrap(CardTier.legend, onTap: () {}));
    final frame = tester.widget<CardTierFrame>(find.byType(CardTierFrame));
    expect(frame.holoTilt, isNull);
  });
```

(두 번째 테스트가 기존 `_wrap` 헬퍼 시그니처와 맞는지 파일을 먼저 읽어 확인한다
— `_wrap(CardTier tier, {VoidCallback? onTap})` 형태라면 그대로 쓰고, 다르면
실제 시그니처에 맞춰 호출부를 조정한다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tap_sparkle_test.dart --plain-name "holoTilt"`
Expected: FAIL — `CardTile`에 `holoTilt` 파라미터가 없어 컴파일 에러.

- [ ] **Step 3: `CardTile`에 `holoTilt` 파라미터 추가**

`card_tile.dart`의 `CardTile` 위젯 클래스 선언(현재 411-421줄 부근, Task 3·4·6의
줄 이동으로 위치가 조금 달라졌을 수 있다 — `class CardTile extends StatefulWidget`을
찾는다)을 다음으로 교체:

```dart
class CardTile extends StatefulWidget {
  const CardTile({
    super.key,
    required this.status,
    required this.locale,
    this.onTap,
    this.holoTilt,
  });

  final CardStatus status;
  final String locale;
  final VoidCallback? onTap;

  /// 카드 상세 오버레이에서만 넘어오는 레전드 홀로그램 기울기. 도감 그리드는
  /// 이 파라미터를 넘기지 않으므로 항상 null이고, CardTierFrame까지 그대로 null이
  /// 전달돼 홀로 레이어가 생기지 않는다.
  final ValueListenable<Offset?>? holoTilt;

  @override
  State<CardTile> createState() => _CardTileState();
}
```

`card_tile.dart` 상단 import에 `ValueListenable`이 이미 Task 7에서
`package:flutter/foundation.dart`로 추가돼 있으므로 추가 작업 불필요하다(확인만
한다).

`_CardTileState.build`에서 `CardTierFrame(...)` 호출부(현재 470-494줄 부근)에
`holoTilt: widget.holoTilt,` 한 줄을 추가한다:

```dart
                  CardTierFrame(
                    tier: widget.status.tier,
                    tint: _tint,
                    holoTilt: widget.holoTilt,
                    child: Center(
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_tile_tap_sparkle_test.dart`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_tile.dart test/card_tile_tap_sparkle_test.dart
git commit -m "feat: CardTile에 holoTilt 통과 배선(그리드는 기본 null)"
```

---

## Task 9: 카드 상세 오버레이에 자이로 홀로그램 배선

**Files:**
- Modify: `verse-flutter/lib/features/cards/card_detail_sheet.dart`
- Test: `verse-flutter/test/card_detail_sheet_test.dart`

**Interfaces:**
- Consumes: Task 2의 `GyroTiltController`, Task 8의 `CardTile.holoTilt`.
- Produces: 없음(최종 배선).

`showCardDetail`의 `pageBuilder`가 지금은 상태 없는 클로저 하나로 돼 있다 —
`GyroTiltController`의 생성·해제(생명주기)를 가지려면 `StatefulWidget`이 필요하다.
`pageBuilder`가 반환하던 위젯 트리를 새 private `StatefulWidget`으로 옮긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/card_detail_sheet_test.dart` 상단 import에 추가:

```dart
import 'dart:async';

import 'package:sensors_plus/sensors_plus.dart';
import 'package:verse_flutter/features/cards/gyro_tilt_controller.dart';
```

파일 하단(마지막 `testWidgets` 다음)에 추가:

```dart
  testWidgets('레전드 카드 상세는 자이로 기울기에 반응하는 홀로 레이어를 받는다', (tester) async {
    final source = StreamController<AccelerometerEvent>();
    addTearDown(source.close);

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
                tiltStream: source.stream,
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    source.add(AccelerometerEvent(4.9, 0, 9.8, DateTime.now()));
    await tester.pump();

    final frame = tester.widget<CardTierFrame>(find.byType(CardTierFrame));
    expect(frame.holoTilt, isNotNull);
    expect(frame.holoTilt!.value, isNotNull);
  });

  testWidgets('브론즈 카드 상세는 holoTilt가 아예 null이다(레전드 전용)', (tester) async {
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () =>
                  showCardDetail(context, const CardStatus(_dove, CardTier.bronze), 'ko'),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    final frame = tester.widget<CardTierFrame>(find.byType(CardTierFrame));
    expect(frame.holoTilt, isNull);
  });

  testWidgets('상세를 닫으면 자이로 구독이 취소된다', (tester) async {
    final source = StreamController<AccelerometerEvent>.broadcast();
    addTearDown(source.close);

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
                tiltStream: source.stream,
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(source.hasListener, isTrue);

    await tester.tapAt(const Offset(10, 10)); // 배경 탭으로 닫기
    await tester.pumpAndSettle();

    expect(source.hasListener, isFalse);
  });

  testWidgets('접근성 동작 줄이기가 켜져 있으면 자이로를 구독하지 않는다', (tester) async {
    final source = StreamController<AccelerometerEvent>.broadcast();
    addTearDown(source.close);

    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showCardDetail(
                  context,
                  const CardStatus(_dove, CardTier.legend),
                  'ko',
                  tiltStream: source.stream,
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(source.hasListener, isFalse);
  });
```

`_dove`는 이 파일 상단에 이미 정의된 테스트용 `CardDef` 상수를 그대로 쓴다(먼저
파일을 읽어 실제 이름을 확인하고, 다르면 그 이름으로 맞춘다).

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd verse-flutter && flutter test test/card_detail_sheet_test.dart --plain-name "자이로\|holoTilt\|동작 줄이기"`
Expected: FAIL — `showCardDetail`에 `tiltStream` 파라미터가 없어 컴파일 에러.

- [ ] **Step 3: `showCardDetail`을 스테이트풀 위젯으로 재구성**

`verse-flutter/lib/features/cards/card_detail_sheet.dart` 전체를 다음으로 교체:

```dart
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../../core/cards/card_def.dart';
import '../../core/cards/card_status.dart';
import '../../core/cards/card_tier.dart';
import '../../l10n/app_localizations.dart';
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

class _CardDetailBodyState extends State<_CardDetailBody> {
  GyroTiltController? _tiltController;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // 레전드 카드에서만, 그리고 "동작 줄이기"가 꺼져 있을 때만 자이로를 구독한다.
    // didChangeDependencies에서 만드는 이유는 MediaQuery(접근성 설정)가 여기서만
    // 안전하게 조회 가능해서다 — 이미 만들어진 컨트롤러가 있으면 다시 만들지 않는다.
    if (_tiltController != null) return;
    if (widget.status.tier != CardTier.legend) return;
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    _tiltController = GyroTiltController(
      stream: widget.tiltStream,
      enabled: !reduceMotion,
    )..start();
  }

  @override
  void dispose() {
    _tiltController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final screenSize = MediaQuery.sizeOf(context);
    // 세로가 좁은 화면(가로 모드 등)에서도 카드+텍스트가 넘치지 않게
    // 화면 폭과 높이 중 작은 쪽을 기준으로 카드 크기를 잡는다.
    final cardSize = (screenSize.width * 0.65).clamp(0.0, screenSize.height * 0.5);
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
                            holoTilt: _tiltController,
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
                            color: cardTierColor(widget.status.tier),
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

`_tiltController`는 `GyroTiltController`가 `ValueNotifier<Offset?>`을 상속하므로
그 자체가 `ValueListenable<Offset?>`이다 — `CardTile.holoTilt`에 그대로 넘길 수
있다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/card_detail_sheet_test.dart`
Expected: PASS 전부.

- [ ] **Step 5: 전체 회귀 확인**

Run: `cd verse-flutter && flutter analyze && flutter test`
Expected: `flutter analyze`에 새 에러 없음. `flutter test`는 전체 스위트가 PASS.

- [ ] **Step 6: 커밋**

```bash
cd verse-flutter
git add lib/features/cards/card_detail_sheet.dart test/card_detail_sheet_test.dart
git commit -m "feat: 카드 상세 오버레이에 자이로 홀로그램 배선(레전드 전용, 접근성 존중)"
```

---

## Self-Review Notes (실행 전 참고)

- **스펙 §1~§4 커버리지**: 전 등급 그림창 테두리(§2)=Task 3, 등급별 재질 사다리(§3)=
  Task 4·5·6, 자이로 홀로(§4)=Task 2·7·8·9. 재사용 관계(§5)는 각 태스크 Interfaces에
  반영. 테스트(§6)는 각 태스크 Step에 대응. 범위 밖(§7) 항목(카드 그림 아트, 그리드
  자이로, GLSL 셰이더, 탭 반짝임 통합 튜닝, 다른 등급 자이로)은 어떤 태스크에도
  포함하지 않았다.
- **`ditherColorsFor`/`TierDitherPainter` 완전 제거**는 의도된 변경이다(Global
  Constraints에 명시) — Task 4에서 기존 테스트를 함께 고친다.
- **`_ShinePainter`를 골드까지 확장(Task 6)**한 것은 스펙 §3 표의 "골드 = 강한 베벨 +
  정지 광택 띠 + 코너 장식"을 그대로 구현한 것이다 — 새 클래스를 만들지 않고 기존
  클래스의 조건만 넓혀 재사용했다(스펙 §5 "재사용 관계" 원칙).
- **홀로그램이 그리드에 새지 않는 구조적 보장**: `CardTile.holoTilt`가 기본값 `null`
  이고, `card_collection_screen.dart`의 기존 `CardTile(...)` 호출부는 이 계획에서
  전혀 수정하지 않는다 — 그리드는 자동으로 `holoTilt: null`을 쓰게 되므로 Task 7의
  `if (tier == CardTier.legend && widget.holoTilt != null)` 조건에서 항상 걸러진다.
- **Task 9의 `didChangeDependencies`에서 컨트롤러 생성**은 `MediaQuery.of(context)`가
  `initState`에서는 아직 안전하지 않기 때문이다(위젯이 트리에 완전히 붙기 전).
  `_tiltController != null` 가드로 중복 생성을 막는다.

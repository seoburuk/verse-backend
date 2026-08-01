# 카드 수집 레전드·골드 이펙트 개선 설계 (2026-08-01)

카드 도감의 골드·레전드 티어는 정적 프레임·재질·자이로 홀로까지 이미 구현되어 있다
(`2026-07-31-card-tier-visual-upgrade-design.md`, `2026-07-31-card-frame-impact-design.md`).
이번 스펙은 그 위에 **상세 화면 이펙트**와 **획득·승급 연출**을 강화한다. 그리드 타일
자체는 건드리지 않는다.

- **대상**: `verse-flutter/` 앱 전용(도감). 오프라인 우선. 새 데이터·테이블·의존성 없음
  (`sensors_plus`는 이미 있음).
- **선행**: 위 두 스펙, 전부 구현 완료(마지막 커밋 `a40d582`).
- **아트**: 카드 그림(내용물)은 이번에도 범위 밖. 전부 `CustomPainter` 레이어.
- **우선순위**: 상세 화면 이펙트(§2, §3) 먼저, 획득·승급 연출(§4)이 다음.

---

## 1. 방향과 원칙

세 갈래를 더한다:

1. **레전드 홀로 심화**(§2) — `HoloPrismPainter`를 단일 레이어에서 다중 레이어로 확장.
2. **상세 등장 스윕**(§3) — 상세 시트를 열 때 골드·레전드 공통으로 광택 띠가 1회
   훑고 지나간다. 골드는 여기서 끝, 레전드는 스윕 종료 후 홀로가 이어받는다.
3. **승급 연출 강화**(§4) — 레전드 풀스크린 모달 재구성(등장·광선·파티클·문구 시퀀스),
   골드 인라인 승급에 반짝임+축소 파티클 추가.

**지키는 원칙** (기존 스펙 계승):

- 그리드(`CardTile`, `CardCollectionScreen`)는 **상시 애니메이션 없음** 원칙을 그대로
  유지한다. 이번 이펙트는 전부 상세 화면과 승급 순간에만 존재한다.
- 색·모양·개수 신호(노치 개수, 핍 개수, 좌표)는 건드리지 않는다. 이펙트는 그 위에
  얹는 장식이지 유일한 신호가 아니다(색약 대응 원칙 계승).
- **접근성**: `MediaQuery.of(context).disableAnimations`(동작 줄이기)가 켜져 있으면
  스윕·파티클·광선·승급 시퀀스는 재생하지 않고 정지 최종 상태로 즉시 안착한다.
  자이로는 기존 `GyroTiltController(enabled: false)` 경로를 그대로 쓴다.
- **가독성**: 홀로·스윕 레이어는 카드 그림/이름 위를 지나가므로 alpha 상한을 두고,
  글자 대비를 해치지 않는 선에서 멈춘다.
- **골드와 레전드의 격차 유지**: 골드는 상세 등장 스윕까지만 받고, 상시 홀로·파티클
  물량은 레전드 전용으로 남긴다. 등급 사다리가 계단식이라는 기존 원칙(§1의 다른
  스펙들)을 승급 연출에도 그대로 적용한다.

---

## 2. 레전드 홀로 심화 — `HoloPrismPainter` 확장

현재 `HoloPrismPainter`(`card_tile.dart`)는 한 겹짜리 대각선 무지개 그라데이션을
기울기만큼 평행이동시켜 그린다. alpha가 낮고 폭이 넓어 "은은한 물감"에 가깝다.
세 레이어로 확장한다.

**레이어 1 — 주 밴드(좁고 반복)**

`TileMode.mirror`로 바꾸고 그라데이션 구간을 카드 폭의 약 40%로 좁혀 대각선
무지개 띠가 3~4줄 보이게 한다. alpha `0x40 → 0x59`.

**레이어 2 — 역방향 밴드(간섭 무늬)**

레이어 1과 같은 방식이되 기울기를 **반대 부호**로 받고, 구간 폭을 다르게(약 55%)
잡는다. 두 밴드의 주기가 어긋나 겹치는 지점마다 밝은 마디가 생기고, 기기를
기울이면 그 마디가 카드를 가로질러 흐른다. alpha `0x38`, `BlendMode.plus`.

**레이어 3 — 글리터 점**

고정 시드 난수로 뽑은 40개 내외 좌표에 1~2px **정사각** 점(원 아님 — 픽셀 아트
톤 유지)을 찍는다. 좌표는 페인터 바깥의 `static final` 리스트로 한 번만 계산해
재사용한다. 기울기에 따라 움직이는 것은 좌표가 아니라 **밝기**다 — 기울기 방향으로
정해지는 하이라이트 축에 가까운 점일수록 밝고, 먼 점은 거의 안 보인다.

**기울기 감도**

기울기 오프셋 계산을 `holoOffset(Offset tilt) → Offset` 순수 함수로 분리한다.
게인 `1.6`을 곱하고 `-1.0~1.0`으로 클램프한다. 페인터 밖에 두어 단위 테스트로
직접 검증한다.

**가독성·성능 가드**

- 세 레이어 합산 alpha가 카드 이름·그림을 덮지 않도록 상한을 둔다. 지금처럼
  노치 클리핑(`_NotchClipper`) 안쪽에만 그린다.
- `shouldRepaint`는 `tilt`가 실제로 바뀔 때만 `true`. `GyroTiltController`의
  지수 이동평균(smoothing 0.15)이 이미 값을 완만하게 만들어 프레임당 비용은
  그라데이션 셰이더 2개 + 사각형 40개 수준.
- `tilt == null`(센서 없음/타임아웃/동작 줄이기)이면 기울기 0의 정지 상태로
  그린다 — 이 경우에도 세 레이어는 다 보이므로 센서 없는 기기에서도 카드는
  여전히 화려하다. 기존 구조가 이미 `null`을 정지로 다루므로 경로 변경 없음.

**테스트**: `holoOffset` 게인·클램프 순수 함수 테스트, `shouldRepaint` 동작
테스트, `tilt == null`일 때 위젯이 예외 없이 렌더되는 기존 패턴의 위젯 테스트.

---

## 3. 상세 등장 스윕 — 골드·레전드 공통

상세 시트(`card_detail_sheet.dart`)를 열 때 딱 한 번, 광택 띠가 카드를 훑고
지나가며 정지 상태로 안착하는 연출이다.

**트리거 지점**

`_CardDetailBody.initState`는 이미 레전드일 때만 `GyroTiltController`를 켠다.
같은 자리에서 티어가 골드 이상이면 위젯 로컬 `AnimationController`를 만들어
`forward()`를 한 번 재생한다(상태가 단순해 별도 컨트롤러 클래스는 두지 않는다).

**연출 내용 — `SweepPainter`(신규, 공유 파일 `card_effects.dart`)**

- 폭이 좁은 대각선 밝은 띠(흰색~해당 등급색, alpha 약 `0x80`) 하나가 카드 왼쪽
  바깥에서 오른쪽 바깥까지 `Duration 550ms`, `Curves.easeOutCubic`로 지나간다.
- 위치는 애니메이션 값 `t`(0→1)를 대각선 오프셋으로 매핑하는 순수 함수
  (`sweepOffset(double t)`)로 분리해 테스트 가능하게 한다.
- 노치 클리핑 안쪽에만 그려 카드 실루엣을 벗어나지 않는다.
- 재생 후 컨트롤러는 값 `1.0`에 멈추고, `t >= 1.0`이면 `SweepPainter`는 아무것도
  그리지 않는다 — 별도의 "숨김 처리" 분기 없이 자연히 사라진다.

**골드 vs 레전드 이어짐**

- **골드**: 스윕 재생 후 끝. 상시 이펙트 없음.
- **레전드**: 스윕 컨트롤러의 `AnimationStatus.completed` 콜백에서
  `bool _holoActive`를 `true`로 전환하고, 그 이후부터 `HoloPrismPainter`(§2)를
  렌더한다. 자이로 배선(`GyroTiltController`)은 기존 그대로이고, "언제부터
  보여줄지"만 바뀐다.

**접근성**

`disableAnimations`가 `true`면 `AnimationController.value = 1.0`으로 즉시
점프한다(재생 스킵). 레전드는 스킵과 동시에 `_holoActive = true`가 되어 홀로가
바로 보인다.

**테스트**: `sweepOffset` 순수 함수 테스트, `disableAnimations`일 때 즉시 완료
상태로 렌더되는 위젯 테스트, 레전드에서 스윕 완료 후 홀로가 활성화되는지 확인하는
위젯 테스트(가짜 `tiltStream` 주입 기존 패턴 재사용).

---

## 4. 승급 연출 강화

### 4-1. 레전드 풀스크린 모달(`LegendPromotionOverlay`) 재구성

현재는 검은 배경 + 카드 + 버튼이 즉시 다 나타난다. 아래 시퀀스로 바꾼다.

**타임라인**

1. `0ms` — 배경 페이드인(`150ms`) + 기존 `HapticFeedback.heavyImpact()` 유지.
2. `150ms~` — **배경 방사 광선**(`RadialRaysPainter`, 신규, `card_effects.dart`):
   카드 중심에서 뻗는 얇은 방사선 8~12개, alpha 낮게(등급색 보라 톤), 등장 후
   아주 느리게 회전(예: 20초 1회전) — 상시 회전이지만 느려서 산만하지 않다.
3. `200ms~700ms` — **카드 확대 등장**: `ScaleTransition` 0.6배→1.0배,
   `Curves.easeOutBack`(과도한 바운스는 픽셀 톤과 안 맞아 피한다).
4. 카드 등장과 동시에 §3의 스윕이 자동 재생되고, 끝나면 홀로가 활성화된다
   (상세 화면과 동일한 `_holoActive` 흐름 재사용).
5. 카드 등장 직후 — **파티클 1회**(`ParticleBurstPainter`, 신규, 공유): 카드
   중심에서 20~30개 작은 사각 파티클이 사방으로 튀며 페이드아웃(`600ms`,
   중력 없이 등속 확산).
6. 파티클과 함께 타이틀 텍스트가 `FadeTransition` + 약간 위로 슬라이드(`200ms`
   지연)로 등장.
7. 버튼은 시퀀스 종료 후 나타난다. **탭 스킵**: 재생 중 화면 아무 곳이나 탭하면
   즉시 최종 상태로 점프하고 버튼이 나타난다(여러 장 연속 승급 시 매번 기다리지
   않도록).

**여러 장 처리**: 기존처럼 `_dismissCurrent`에서 `_index` 증가 시 시퀀스를
`AnimationController.reset()` 후 처음부터 재생.

**접근성**: `disableAnimations`면 1~6을 스킵하고 최종 상태(카드 확대, 홀로 활성,
타이틀, 버튼)로 즉시 렌더.

### 4-2. 골드 인라인 승급(`CardFlip`)

`_isPromotion`이 `true`이고 `widget.status.tier == CardTier.gold`일 때만
(브론즈→실버 승급에는 적용하지 않음), `_transitioned = true`가 되는 순간:

- **반짝임 1회**: 그리드 탭 반짝임에 쓰는 `_TapSparklePainter`/`_ShinePainter`
  계열을 재사용해 `300ms` 컨트롤러로 1회 재생. 새 페인터를 만들지 않는다.
- **축소 파티클**: §4-1의 `ParticleBurstPainter`를 재사용하되 개수 파라미터를
  줄여(8~12개) 레전드보다 확실히 약하게 한다. 새 클래스 없이 파라미터 차등만 둔다.

**공유 구조**: `SweepPainter`, `ParticleBurstPainter`, `sweepOffset`, `holoOffset`은
신규 파일 `lib/features/cards/card_effects.dart`에 모아 `CardFlip`,
`LegendPromotionOverlay`, `CardDetailSheet`가 공통으로 import한다.

---

## 5. 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `lib/features/cards/card_effects.dart` (신규) | `SweepPainter`, `ParticleBurstPainter`, `RadialRaysPainter`, `sweepOffset`, `holoOffset` 순수 함수·페인터 모음 |
| `lib/features/cards/card_tile.dart` | `HoloPrismPainter`를 3레이어로 확장 (§2) |
| `lib/features/cards/card_detail_sheet.dart` | 골드 이상 상세 등장 스윕 배선, 레전드 `_holoActive` 전환 (§3) |
| `lib/features/cards/legend_promotion_overlay.dart` | 시퀀스 재구성: 광선·확대·스윕·파티클·문구·탭 스킵 (§4-1) |
| `lib/features/cards/card_flip.dart` | 골드 승급 전이에 반짝임+축소 파티클 추가 (§4-2) |

---

## 6. 테스트 요약

- `holoOffset`, `sweepOffset` 순수 함수 — 게인/클램프/매핑 단위 테스트
- `HoloPrismPainter.shouldRepaint` 동작 테스트
- 상세 시트: `disableAnimations` 시 즉시 완료 렌더, 레전드에서 스윕 완료 후
  홀로 활성화 (가짜 `tiltStream` 재사용)
- `LegendPromotionOverlay`: 탭 스킵 시 즉시 최종 상태, `disableAnimations` 시
  시퀀스 스킵, 여러 장 순차 재생 시 매번 리셋되는지
- `CardFlip`: 골드 승급에서만 반짝임+파티클이 트리거되고 브론즈→실버는 트리거
  안 되는지

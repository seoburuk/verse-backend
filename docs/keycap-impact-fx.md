# 키캡 타격감 효과 (Keycap Impact FX)

암송 화면에서 단어를 정확히 입력하거나 타일을 올바르게 배치할 때 타격감을 주는 사운드 + 시각 효과 시스템.

---

## 구현 파일

| 파일 | 역할 |
|------|------|
| `verse-web-next/lib/fx/sound.ts` | Web Audio 합성 (사운드 엔진) |
| `verse-web-next/components/memorize/useMemorize.ts` | 히트/미스 감지, combo/fx 상태 |
| `verse-web-next/components/memorize/TypeScaffold.tsx` | 단어 팝 애니메이션 트리거 |
| `verse-web-next/components/memorize/MemorizeView.tsx` | textarea 임팩트 + 콤보 뱃지 렌더 |
| `verse-web-next/app/globals.css` | 키프레임, 핑크 색 변수 |

---

## 사운드 (현재 구현: Web Audio 합성)

파일 없이 브라우저 내장 Web Audio API로 8-bit 레트로 사운드를 합성.

### 파라미터 요약

| 구분 | 파형 | 기본 주파수 | 길이 | Gain |
|------|------|-------------|------|------|
| 히트 (`playHit`) | `square` | 440 Hz | 60 ms | 0.25 → 지수 감쇠 |
| 미스 (`playMiss`) | `sawtooth` | 110 Hz | 100 ms | 0.20 → 지수 감쇠 |

### 콤보 피치 상승 공식

```
freq = 440 × 2^(min(combo, 12) / 12)
```
- combo 1 → 440 Hz (라4)
- combo 6 → ~622 Hz (+트리톤)
- combo 12+ → 880 Hz (한 옥타브 위, 상한)

### iOS/모바일 대응

`AudioContext`는 사용자 입력 이후 첫 호출 시 lazy 생성(`suspended` 상태이면 `resume()` 호출).

---

## 대안 사운드 옵션 (추후 전환 가이드)

### Option A: 실제 키보드 타건음 (오디오 파일)

기계식 키보드 샘플(.mp3/.wav)을 `/public/sounds/` 에 두고 `<audio>` 또는 `Howler.js`로 재생.

```ts
// Howler 예시 (npm i howler @types/howler)
import { Howl } from "howler";
const click = new Howl({ src: ["/sounds/key-click.mp3"], volume: 0.4 });
export const playHit = (_combo: number) => click.play();
```

- 장점: 가장 현실적인 타격감
- 단점: 오디오 파일 번들 필요, Flutter 이식 시 자산 별도 추가

### Option B: 타자기 소리 (단어 완성 시 '딩' 벨)

단어 완성 순간만 효과음, 평소 타자는 무음.

```ts
// 현재 sound.ts에서 playHit 수정
export function playHit(combo: number) {
  // 단어 완성 벨: 4화음 순서
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  const freq = notes[Math.min(combo - 1, notes.length - 1)];
  blip("sine", freq, 0.15, 0.3);
}
```

### Option C: 소리 없이 시각 효과만

`lib/fx/sound.ts`의 `playHit`/`playMiss`를 빈 함수로 교체 또는 사운드 설정 토글 추가(아래 참고).

### Option D: 사운드 ON/OFF 토글 (추후 구현 가이드)

`localStorage["kjv_sfx"] = "off"` 여부를 `sound.ts`에서 읽어 분기:

```ts
export function playHit(combo: number) {
  if (localStorage.getItem("kjv_sfx") === "off") return;
  blip("square", ...);
}
```

설정 화면(`/settings`)에 토글 버튼 추가.

---

## 시각 효과 (현재 구현)

### 색 팔레트

```css
/* 다크 (기본) */
--pink:      #ff4d9d;   /* 임팩트 플래시, 콤보 뱃지 */
--pink-soft: #f9a8d4;   /* 잔광 */

/* 라이트 */
--pink:      #db2777;
--pink-soft: #f472b6;
```

기존 그린(`#4ade80`) 다크 배경과 보색 대비로 선택. 임팩트 순간만 핑크가 등장, 단어가 정착하면 기존 그린으로 돌아옴.

### 단어 팝 (`hint-word.hit`)

```
정타 → scale 1.35 → 1, steps(3), 180ms
       char 색: --pink → --text
       border: --pink → --green
       text-shadow: --pink-soft 1프레임
```

### textarea 임팩트

| 이벤트 | 애니메이션 | 길이 |
|--------|-----------|------|
| 히트 | `box-shadow: 4px 4px 0 --pink` 펄스 | 250ms |
| 미스 | `translateX ±3px` 셰이크, steps(4) | 200ms |

> seq 홀짝(`fx-hit-a` / `fx-hit-b`)을 교대해서 같은 클래스가 연속으로 붙어도 애니메이션이 재시작됨.

### 콤보 뱃지

5콤보 이상일 때만 입력창 우상단에 `xN` 픽셀 뱃지 표시. 미스 시 즉시 사라짐.

---

## 대안 시각 옵션 (추후 추가 가이드)

### Option A: 파티클 폭발

단어 완성 위치에서 픽셀 파편이 튀는 효과. CSS만으로 구현 시:

```css
@keyframes particle {
  0%   { transform: translate(0,0) scale(1); opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
}
```

`TypeScaffold`에서 맞힌 단어 좌표를 계산해 `<span>` 8개를 `--dx`/`--dy` CSS 변수와 함께 DOM에 삽입 후 제거.

### Option B: 화면 전체 플래시

정답 시 `#fff3` 반투명 오버레이를 1프레임 깜박임.

```css
@keyframes screen-flash {
  0%   { opacity: 0.15; }
  100% { opacity: 0; }
}
```

`MemorizeView`에서 `fx?.kind === "hit"` 시 오버레이 `<div>` 렌더.

### Option C: 더 강한 셰이크 (오답 패널티 강조)

현재 ±3px 대신 ±6px, 6스텝, 300ms로 늘려서 오답에 무게감 추가.

```css
@keyframes input-shake-a {
  0%   { transform: translateX(-6px); }
  16%  { transform: translateX(6px); }
  33%  { transform: translateX(-4px); }
  50%  { transform: translateX(4px); }
  66%  { transform: translateX(-2px); }
  100% { transform: translateX(0); }
}
```

---

## Flutter 이식 가이드

Flutter 앱은 미구현이지만, 이식이 쉽도록 설계됨.

### 판정 이벤트 매핑

| Web (`HitFx.kind`) | Flutter 트리거 |
|-------------------|---------------|
| `"hit"` | `FlutterSoundPlayer.startPlayer()` 또는 oscillator 패키지 |
| `"miss"` | 낮은 buzz 재생 |

### 합성 파라미터 이식

Web Audio의 `square` 오실레이터는 Flutter의 `dart:ffi` + `AudioUnit` 또는 `flutter_oscillator` 패키지로 동일하게 구현 가능. 파라미터(주파수 공식, 길이, gain)는 `sound.ts` 상단 주석과 이 문서를 참고.

### 시각 효과

- 단어 팝: Flutter `AnimationController` + `Transform.scale`
- 셰이크: `AnimatedContainer` + `Offset` 트윈
- 콤보 뱃지: `AnimatedOpacity` + `Text`
- 색상: `--pink` → `Color(0xFFFF4D9D)` (다크), `Color(0xFFDB2777)` (라이트)

---

## 설계 원칙

- **오디오 파일 없음**: 자산 관리 없이 Web Audio 합성 → 앱 번들 크기 영향 없음
- **픽셀 감성 유지**: `steps()` + 정수 translate로 트위닝 없이 툭툭 끊김
- **사운드와 시각 분리**: `sound.ts`는 순수 함수, 컴포넌트에서 `fx` 상태로 시각을 독립 제어
- **재시작 보장**: `a`/`b` 클래스 교대로 동일 이벤트가 연속으로 와도 애니메이션이 매번 재실행됨

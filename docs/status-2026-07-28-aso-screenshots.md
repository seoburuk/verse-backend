# ASO 스크린샷 · 스토어 문안 작업 (2026-07-28)

## 배경

앱 스토어 등록/개선을 위해 실제 앱 화면 기반 스크린샷과 한국어·영어 스토어
문안(제목/부제/키워드/설명)을 준비했다.

## 산출물

### 1. 스크린샷 — `docs/store-assets/`

모두 **실제 앱 화면 캡처** 기반. Figma 목업이나 손그림 UI가 아니라, 로컬로
`verse-backend`(Go API) + postgres + `verse-web-next`를 띄워 Playwright로
정확한 디바이스 해상도로 캡처한 뒤, 픽셀 스타일 프레임 + 헤드라인 카피를
합성했다.

**최종 채택 세트 — `kjv-modes-*`** (한/영 × 6.5"/iPad = 16장)

| 슬라이드 | 내용 | 실제 화면 |
|---|---|---|
| 1 | 홈 화면 | `raw-home.png` / `raw-en-home.png` |
| 2 | 타일 배치(드래그) 모드 | `raw-mode-drag.png` / `raw-en-mode-drag.png` |
| 3 | 타이핑(빈칸 채우기) 모드 | `raw-mode-type.png` / `raw-en-mode-type.png` |
| 4 | 받아쓰기 모드 | `raw-mode-dictation.png` / `raw-en-mode-dictation.png` |

- 한국어: `screenshots-6.5/kjv-modes-6.5-{1..4}.png` (1242×2688),
  `screenshots-ipad/kjv-modes-ipad-{1..4}.png` (2048×2732)
- 영어: `screenshots-6.5/kjv-modes-en-6.5-{1..4}.png`,
  `screenshots-ipad/kjv-modes-ipad-en-{1..4}.png`
- 영어판은 UI 텍스트를 번역 합성한 게 아니라 웹앱의 실제 `/en` 라우트
  (next-intl)를 캡처한 진짜 영어 UI.
- 소스 HTML: `screenshots-6.5/screens-modes.html`,
  `screenshots-6.5/screens-modes-en.html`,
  `screenshots-ipad/screens-modes-ipad*.html`
  (raw 캡처 PNG를 `<img>`로 폰 프레임에 넣고 Playwright로 재렌더링)

**구버전(참고용) — `kjv-real-6.5-*`**

홈/구절목록/게임플레이/코스목록 구성. `kjv-modes-*`가 모드 3종(암송 방식의
핵심 차별점)을 더 잘 보여준다고 판단해 이 세트로 교체했다. 삭제하지 않고
남겨둠 — 필요시 재사용 가능.

### 2. 스토어 문안 — `docs/store-assets/aso-copy.md`

Apple App Store / Google Play × 한국어 / 영어, 총 4개 조합. 각각 **A안(현재
적용)**과 **B안(통독 기능 출시 후 적용)**으로 나눔.

- 글자수·바이트 전부 `python3` 로 실측 검증 (Apple 제목 30자, 부제 30자,
  키워드 100바이트; Google 제목 30자, 짧은 설명 80자 한도 준수)
- Apple: 제목+부제+키워드 필드만 색인, 필드 간 단어 중복 금지, 긴 설명은
  전환용 카피로만 작성
- Google: 긴 설명도 색인되므로 "성경 암송/성경 통독/KJV/bible memory" 등
  핵심어를 자연 밀도(~2%)로 배치
- 영어 키워드 전략은 "bible memory"(카테고리 키워드) + "KJV"(니치 키워드)
  조합, 웹 `/en` SEO 타겟 키워드와 정렬

## 중요 확인 사항 — 통독 기능은 미구현

작업 중 **"성경 타자 통독" 기능이 코드베이스에 없다**는 걸 확인했다:

- `docs/superpowers/specs/2026-07-27-typing-bible-reading-design.md` 에
  설계 스펙만 존재 (Phase A/B/C 구현 계획 포함)
- `verse-flutter/lib/features/`, `verse-web-next/app/` 어디에도
  `reading` 기능 없음
- `verse-flutter/lib/features/today/create_plan_screen.dart` 에도
  암송/통독 트랙 갈림길 없음

**결정:** 통독을 언급하는 스크린샷·문안(B안)은 실제 기능이 배포된 릴리스와
**동시에** 적용한다. 없는 기능을 스토어 메타데이터에 노출하면 Apple
가이드라인 2.3.1(정확성) 반려 사유가 되고, 이미 Guideline 4로 반려된 이력
(`docs/appstore-review-2026-07-24-guideline4-locale.md`)이 있어 더 보수적으로
접근했다.

또한 기존 "드래그 모드"는 이름과 달리 실제로는 탭 방식으로 구현되어
있음(`Draggable` 위젯 없음, `onTap` 기반) — 스크린샷 카피는 실제 동작에 맞춰
"탭해서 배치"로 작성했다.

## 로컬 개발 환경 노트

캡처를 위해 로컬 postgres + 백엔드를 기동했다 (작업 종료 시 정리 완료):

```
verse-backend/docker-compose.yml  → docker compose up -d db
make migrate && make load && make seed   # KJV 31,102절 + 코스 시드
go run ./cmd/api                          # 로컬 8080
```

Playwright(chromium-headless-shell)를 스크래치패드에 설치해 정확한 디바이스
픽셀 크기(iPhone 6.5": 1242×2688, iPad 12.9": 2048×2732)로 렌더링/캡처했다.

## 다음 단계 후보

- 통독 기능 실제 구현 (스펙 Phase A부터) → 구현 후 B안 문안/스크린샷 적용
- App Store Connect / Google Play Console에 실제 업로드
- 6.5" 외 5.5"(1242×2208) 등 추가 규격이 필요하면 동일 파이프라인으로 생성 가능

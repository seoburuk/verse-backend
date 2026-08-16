# ASO 스토어 문안 (2026-08-17 전면 재작성)

대상 빌드: `verse-flutter` 0.3.2+16
포지셔닝: **메인 = KJV 성경 암송, 서브 = 타자 통독**, 신규 훅 = **KJV 고어 사전**

> 이 문서는 2026-08-01 판을 대체한다. 그 사이 앱에 추가된 기능(고어 사전,
> 스트릭 프리즈/복구, 통독·받아쓰기 스트릭 인정, 오늘 목표 상한)을 반영하고
> 필드 문구를 전부 다시 뽑았다. 글자수·바이트는 모두 `python3` 실측.

## 기능 인벤토리 (문안 근거 — 전부 구현·배포됨)

| 기능 | 근거 |
|---|---|
| 암송 3모드 (타일 탭 / 타이핑 / 받아쓰기) | `memorize_screen.dart`, `app_ko.arb: memorizeModeDrag/Type/Dictation` |
| 타자 통독 | `features/reading/`, `app_ko.arb: createPlanTrackReading "통독 — 보고 따라 치기"` |
| 66권 픽셀 책장 | `cards/bookshelf_view.dart`, `cardsSegmentShelf "책장"` |
| **KJV 고어 사전 (단어 탭 → 뜻)** | `2026-08-08-archaic-dictionary-design.md`, `app_ko.arb: dictModernLabel/dictKoLabel`. 고어 300 + KJV 빈출 일반어 2,000. 암송 결과·받아쓰기·통독 절에서 접근 |
| 하트(목숨) 20분 회복 | `memorizeCoachLivesBody`, `splashTip1` |
| 스트릭 + ❄️ 프리즈 + 광고 복구 | `today_screen.dart:228` 프리즈 배지, `todayStreakRecoverCta "광고 보고 이어하기"` |
| 통독·받아쓰기도 스트릭 인정 | 커밋 `0504fde`, `714055f` |
| 픽셀 말씀 카드 (브론즈/실버/골드/레전드) | `cardsTierBronze…Legend`, `legend_promotion_overlay.dart` |
| 마스코트 Shaun | `app_ko.arb: mascotName "Shaun"` |
| 한국어/영어 UI | `app_ko.arb` / `app_en.arb` |

**서열 규칙:** 모든 필드에서 암송 → 통독 → 사전 순. 검색 수요는 "성경 암송"이
압도적이라 헤드 텀을 먼저 잡고, 통독·사전은 차별화(경쟁 암송 앱에 없음) 축으로
뒤에 붙인다. 통독을 앞세운 버전은 아래 **Custom Product Page**에서 따로 운영한다.

---

## Apple App Store (ko)

Apple 검색 색인 = 제목(30자) + 부제(30자) + 키워드 필드(100바이트). 긴 설명은
색인되지 않으므로 전환용으로만 쓴다. 같은 단어를 세 필드에 반복하면 낭비다
(1회만 색인).

| 필드 | 값 | 실측 |
|---|---|---|
| 제목 | `PIXBIBLE 픽스바이블: KJV 성경암송 통독` | 27/30자 |
| 부제 | `매일 한 절 타자 필사, 뜻풀이 영어 공부` | 23/30자 |
| 키워드 | `성경구절,성경읽기,말씀암송,큐티,묵상,암기,사전,성경공부,bible,verse` | 91/100바이트 |

- 제목에 **통독을 넣었다.** 이전 판은 통독을 부제에 뒀는데, 제목이 가장 강한
  색인 필드고 "성경 통독"은 그 자체로 헤드 텀이다. 브랜드 한글 표기
  `픽스바이블`은 국내 브랜드 검색 대응용으로 유지.
- 부제는 제목과 단어가 하나도 겹치지 않는다. `필사`(통독의 인접 검색어),
  `뜻풀이`(고어 사전), `영어 공부`(국내 KJV 앱의 핵심 구매 동기)를 새로 색인한다.
- 키워드 필드에는 제목·부제에 이미 있는 KJV/성경암송/통독/매일/한/절/타자/필사/
  영어/공부/뜻풀이 를 넣지 않았다.
- `사전`은 신규 키워드다 — 고어 사전이 경쟁 암송 앱에 없는 기능이라 "성경 사전"
  검색군에서 잡힐 여지가 있다.

### 프로모션 텍스트 (170자, 심사 없이 수시 변경 가능 · 색인 안 됨)

```
하루 한 절이면 충분해요. 타일을 맞추고, 빈칸을 채우고, 받아쓰며 KJV 말씀이
몸에 남습니다. 외우기 힘든 날엔 타자 통독으로 가볍게 🔥
```
(78/170자 — 시즌·이벤트마다 교체하기 좋게 짧게 뽑았다)

### 긴 설명 (전환용 — 색인 안 됨)

```
암기가 아니라 게임입니다.

PIXBIBLE은 KJV 영어 성경을 게임처럼 외우는 레트로 픽셀 앱입니다.
하루 한 절, 부담 없이 시작하세요.

◆ 세 가지 암송 모드 — 편한 방식으로
· 타일 탭 — 단어 조각을 순서대로 맞추는 퍼즐
· 타이핑 — 첫 글자 힌트와 밑줄을 보고 빈칸 채우기
· 받아쓰기 — 절을 보면서 통째로 따라 입력하기

◆ 모르는 단어는 탭 한 번
· thee, hath, saith… 17세기 KJV 고어를 그 자리에서 확인
· 고어 300개 + KJV 빈출 단어 2,000개, 현대 영어·한글 뜻 함께
· 검색하러 앱을 나갈 일이 없어요

◆ 외우기 힘든 날엔, 타자 통독
· 절을 보며 타자로 따라 치는 저강도 통독
· 채점도 하트도 없이, 몰입해서 읽고 쓰는 시간
· 66권 픽셀 책장 — 칠수록 책이 차오르고, 완독하면 꽂혀요

◆ 매일 이어지는 습관
· 스트릭 — 암송이든 통독이든, 하루 한 절이면 불꽃이 이어져요
· 프리즈 ❄️ — 하루쯤 쉬어도 연속 기록을 지켜줘요
· 하트 — 틀려도 20분마다 다시 채워지니 부담 없이
· 리마인더 — 잊지 않게 살짝 알려드려요

◆ 모으는 재미
· 절을 외울 때마다 픽셀 말씀 카드를 수집
· 브론즈 → 실버 → 골드 → 레전드로 등급 상승
· 66권 코스 — 기초·주기도문·워밍업 30개 주제부터
  구약 39권, 신약 27권 전체까지

◆ 영어 공부는 덤
· KJV 원문을 절 단위로 암송하며 영어 실력도 함께
· 한국어 UI로 편하게, 말씀은 영어 원문 그대로

무료로 시작하세요. 오늘의 한 절이 기다리고 있어요.
```

- 사전 섹션을 **암송 모드 바로 뒤, 통독 앞**에 뒀다. "KJV는 영어가 어려워서
  못 하겠다"가 국내 사용자의 1순위 이탈 사유인데 그 반론을 상단에서 없앤다.
- 통독은 여전히 "외우기 힘든 날엔" 프레이밍 — 보조 트랙임을 명시해서 메인
  포지셔닝을 흐리지 않는다.

---

## Google Play (ko)

Google은 제목(30자) + 짧은 설명(80자) + 긴 설명(4,000자)을 **전부** 색인한다.
긴 설명 키워드 밀도는 2~3%가 상한 — 스터핑은 감점. 제목에 이모지·최상급
(최고/1위/무료)·CTA 금지.

| 필드 | 값 | 실측 |
|---|---|---|
| 제목 | `PIXBIBLE - KJV 성경암송, 성경 타자 통독` | 29/30자 |
| 짧은 설명 | `게임처럼 외우는 KJV 성경 암송, 타자로 따라 치는 성경 통독. 모르는 단어는 탭하면 뜻까지.` | 53/80자 |

### 긴 설명 (색인됨)

```
암기가 아니라 게임입니다.

PIXBIBLE(픽스바이블)은 KJV 영어 성경을 게임처럼 외우는 성경 암송 앱입니다.
레트로 픽셀 화면에서 하루 한 절씩, 성경 말씀 암기가 습관이 됩니다.

■ 세 가지 성경 암송 모드
- 타일 탭: 단어 조각을 순서대로 맞추는 퍼즐식 말씀 암기
- 타이핑: 첫 글자 힌트를 보고 빈칸을 채우는 성경 타자 연습
- 받아쓰기: 절을 보면서 통째로 따라 입력하는 성경 타자 필사

■ KJV 고어 사전 — 모르는 단어는 탭 한 번
- thee, thou, hath, saith 같은 17세기 고어를 그 자리에서 확인
- 고어 300개와 KJV 빈출 단어 2,000개를 현대 영어·한글 뜻으로
- 영어 성경이 어려워 포기했다면, 사전을 켜 둔 채로 다시 시작하세요

■ 외우기 힘든 날엔 성경 타자 통독
- 절을 보며 타자로 따라 치는 성경 통독
- 채점 없이 몰입해서 읽고 쓰는 성경 필사 시간
- 66권 픽셀 책장에 완독한 책이 차곡차곡 꽂힙니다

■ 매일 이어지는 말씀 습관
- 스트릭: 성경 암송이든 통독이든 하루 한 절이면 연속 기록이 이어집니다
- 프리즈: 하루쯤 쉬어도 스트릭을 지켜 줍니다
- 하트: 틀려도 20분마다 회복되어 부담이 없습니다
- 리마인더 알림으로 매일 성경 읽기를 잊지 않게

■ 모으는 재미, 말씀 카드
- 성경구절을 암송할 때마다 픽셀 카드 수집
- 브론즈, 실버, 골드, 레전드로 카드 등급 상승
- 기초·주기도문·워밍업 30개 주제 코스
- 구약 39권, 신약 27권 — KJV 성경 전체 코스

■ 영어 공부는 덤
- KJV 영어 성경 원문을 절 단위로 암송하며 영어 실력까지
- 한국어 UI, 영어 원문 그대로 — 성경으로 하는 영어 공부

지금 무료로 시작하세요. 오늘의 한 절이 기다리고 있습니다.
```

---

## Apple App Store (en-US)

영어권 헤드 텀은 "bible memory" 검색군이고 경쟁 앱(Bible Memory, VerseLocker,
Scripture Typer)이 점유 중이다. 차별화 축은 **game + typing + built-in KJV
dictionary**. KJV는 영어권에서 그 자체로 강한 검색어(전통 교단·KJV-only 수요).

| 필드 | 값 | 실측 |
|---|---|---|
| 제목 | `PIXBIBLE: KJV Bible Memory` | 26/30자 |
| 부제 | `Type Through Scripture Daily` | 28/30자 |
| 키워드 | `scripture,typing,reading,study,streak,flashcard,christian,devotional,king james,dictionary,verse` | 96/100바이트 |

- 키워드에서 `memorize`를 뺐다 — 제목의 `Memory`와 어간이 같아 Apple 영어
  스테밍으로 중복 처리될 가능성이 크다. 그 자리에 `dictionary`(신규 기능)와
  `king james`(KJV 풀네임 구문 검색)를 넣었다.
- 제목·부제에 있는 kjv/bible/memory/type/scripture/daily 는 반복하지 않는다.

### Promotional Text (170자)

```
One verse a day is enough. Tap word tiles, fill the blanks, type it out.
Not up for memorizing? Type your way through the KJV instead.
```
(134/170자)

### 긴 설명 (전환용 — 색인 안 됨)

```
It's not memorization. It's a game.

PIXBIBLE helps you memorize the KJV Bible the way Duolingo teaches
languages — one verse a day, in a cozy retro pixel world.

◆ Three ways to learn — pick whatever feels easiest
· Word tiles — tap the pieces into order, like a puzzle
· Typing — fill in the blanks with first-letter hints
· Dictation — the verse stays on screen while you type it out

◆ Stuck on a word? Just tap it
· thee, thou, hath, saith — 17th-century English, explained in place
· 300 archaic words plus 2,000 common KJV words, with plain-English meanings
· No more leaving the app to look something up

◆ Not up for memorizing? Type through the Bible
· Read Scripture by typing it, verse by verse — no grading, no hearts
· Watch your pixel bookshelf fill up, book by book, all 66

◆ A habit that sticks
· Streaks — memorizing or typing, one verse a day keeps the flame alive
· Freeze ❄️ — take a day off without losing your streak
· Hearts — mistakes cost a heart, but they refill every 20 minutes
· Gentle daily reminders

◆ Collect as you go
· Earn a pixel verse card for every verse you master
· Cards level up: Bronze → Silver → Gold → Legend
· Courses from beginner favorites (John 3:16, Psalm 23)
  to all 66 books — 39 Old Testament, 27 New Testament

Start free. Today's verse is waiting.
```

---

## Google Play (en-US)

| 필드 | 값 | 실측 |
|---|---|---|
| 제목 | `PIXBIBLE - KJV Bible Memory` | 27/30자 |
| 짧은 설명 | `Memorize KJV verses like a game, type Scripture, tap any word for meaning.` | 74/80자 |

- 제목에서 `Bible`을 빼고 `Typing`을 넣는 트레이드는 하지 않는다. Google Play
  제목은 가장 강한 랭킹 시그널이고 `bible memory` / `bible app`이 헤드 텀이다.
  typing·dictionary는 색인되는 짧은 설명·긴 설명에서 충분히 커버된다.

### 긴 설명 (색인됨 — "bible memory / memorize bible verses / scripture memorization / typing / KJV dictionary" 자연 배치)

```
It's not memorization. It's a game.

PIXBIBLE is a Bible memory app that helps you memorize KJV Bible verses
the way a game teaches — one verse a day, in retro pixel style.

■ Three Bible memorization modes
- Word tiles: tap the pieces into order, like a puzzle
- Typing: fill in the blanks with first-letter hints
- Dictation: the verse stays on screen while you type it out

■ Built-in KJV dictionary
- Tap any word in a verse to see what it means
- thee, thou, hath, saith and 300 more archaic words, explained
- Plus 2,000 common KJV words — King James English, made readable

■ Not up for memorizing? Type through the Bible
- Read the Bible by typing it, verse by verse — relaxed, no grading
- Fill your pixel bookshelf: every chapter typed brings a book closer to done

■ A Scripture habit that sticks
- Streaks: memorizing or typing, one verse a day keeps your streak alive
- Freeze: take a day off without breaking your Bible memory streak
- Hearts refill every 20 minutes, so mistakes never end your day
- Daily reminders for consistent Scripture memorization

■ Collect pixel verse cards
- Earn a card for every Bible verse you memorize
- Cards level up through Bronze, Silver, Gold and Legend
- Courses from beginner favorites (John 3:16, Psalm 23, Genesis 1:1)
  to every book — 39 Old Testament, 27 New Testament, all 66

■ King James Version, word for word
- Memorize Scripture in the classic KJV text
- Verse-by-verse courses across the whole KJV Bible

Start free today. Your first verse is waiting.
```

---

## Custom Product Page — 통독 우선 (Apple 전용)

Apple CPP는 최대 70개까지 만들 수 있고 2025년 7월부터 **오가닉 검색에도 노출**된다
(평균 전환 +5.9%). 기본 페이지는 암송 우선 그대로 두고, 통독 축을 따로 판다.

**용도:** "성경 필사 / 성경 통독 / 성경 타자" 검색군 대응, 통독 소재 광고·
숏폼(`bible-shorts-ad`)의 랜딩. CPP는 제목·부제·키워드를 못 바꾸고 **프로모션
텍스트·설명·스크린샷·프리뷰만** 교체 가능하다는 점에 주의.

### CPP 프로모션 텍스트 (ko)

```
외울 자신이 없어도 괜찮아요. 절을 보며 타자로 따라 치기만 하면 됩니다.
채점도 하트도 없이, 66권 픽셀 책장이 한 칸씩 차오릅니다.
```

### CPP 설명 도입부 (ko) — 첫 3줄이 승부

```
읽기만 해도, 손으로 남습니다.

PIXBIBLE의 타자 통독은 절을 보며 그대로 따라 치는 저강도 성경 읽기입니다.
채점도 하트도 없어요. 창세기 1장부터 요한계시록까지, 친 만큼 66권 픽셀
책장이 차오릅니다. 모르는 단어는 탭하면 바로 뜻이 나오고요.
```
(이후 본문은 기본 페이지 긴 설명에서 통독·사전·책장 섹션을 앞으로 올리고
암송 3모드를 뒤로 내린 순서로 재배열)

## 기본 페이지 스크린샷 — 2026-08-17 재생성 (en-US 완료, ko 대기)

이전 세트(2026-08-01, `kjv-modes-*`)를 폐기하고 7장 구성으로 다시 만들었다.
**영어(en-US)만 완료 — 한국어(ko)는 동일 파이프라인으로 후속 작업 예정.**

| 슬라이드 | 내용 | 상태 |
|---|---|---|
| 1 | 오늘 화면 (스트릭 12일·프리즈·하트 실데이터) | 신규 |
| 2 | 타일 탭 모드 | 신규 |
| 3 | 타이핑 모드 | 신규 |
| 4 | 받아쓰기 모드 | 신규 |
| 5 | **KJV 고어 사전** (`yoke` 단어 탭 → 뜻풀이 카드) | **신규 추가** |
| 6 | 타자 통독 (창세기 4:1) | 신규 |
| 7 | 66권 픽셀 책장 (오바댜 완독 하이라이트) | 신규 |

파일: `screenshots-6.5/kjv-modes-en2-6.5-{1..7}.png`,
`screenshots-6.7/kjv-modes-en2-6.7-{1..7}.png`,
`screenshots-ipad/kjv-modes-en2-ipad-{1..7}.png` (21장).

### 이전 세트에서 바뀐 점

- **1번 슬라이드가 웹 랜딩페이지가 아니라 실제 Flutter 앱 화면**이다. 이전
  `kjv-modes-*` 세트의 1번은 `verse-web-next` 캡처였는데(체험해보기/시작하기
  버튼), 실제 앱과 다른 UI라 오해 소지가 있었다.
- **5번(고어 사전)이 신규**다. 8월 상순에 구현된 기능
  (`2026-08-08-archaic-dictionary-design.md`)이 이전 스크린샷 세트에는
  전혀 반영되지 않았었다.
- 6·7번(통독·책장)은 실데이터로 재촬영했다 — 스트릭 12일, 프리즈 1개,
  통독 진행 80/1533절, 오바댜서 완독 하이라이트. 빈 상태(0%)로 찍었던
  이전 세트보다 기능이 실제로 살아있다는 인상을 준다.

### 사전 스크린샷에서 한국어 뜻풀이를 잘라낸 이유

`verse_words_card.dart`는 로케일과 무관하게 **"Modern English" + "Korean"
두 줄을 항상 같이 보여준다** — 이 앱의 주 타깃이 "영어 KJV를 읽고 싶은
한국어 사용자"라서, 영어 UI 모드에서도 한국어 뜻풀이를 끄지 않는 게 의도된
동작이다. 하지만 en-US 스토어 리스팅은 영어권 사용자가 보는 화면이라, 스크린샷에
한글이 나오면 "이거 한국 앱이야?"라는 혼란을 준다. 앱 코드를 고치는 건
스코프 밖이라, **raw 스크린샷을 Korean 줄이 시작되기 전 높이에서 크롭**해서
프레임에 영어 뜻풀이("Modern English: yoke / a wooden frame joining oxen for
plowing…")만 담기게 했다 (`raw-en-dictionary-noko.png`).

### 남은 작업

- **한국어(ko) 세트**: 같은 파이프라인(iOS 시뮬레이터 영어→한국어 로케일
  전환, 동일 시드 데이터)으로 7장 재촬영 필요. 사전 카드는 ko 세트에서는
  한국어 줄을 잘라낼 필요가 없다(오히려 그게 주 정보).
- **iPad 화면은 iPhone 캡처를 그대로 cover-fit**한 것이다(2026-08-01 세트도
  동일한 방식이었음) — 진짜 iPad 레이아웃이 아니다. 필요하면 iPad 시뮬레이터로
  네이티브 캡처를 별도로 떠야 한다.
- App Store Connect / Google Play Console 업로드는 아직 안 함.

### CPP 스크린샷 순서

Apple 검색 결과에서는 **첫 3장만 보이고 90%가 그 뒤로 스크롤하지 않는다.**
기본 페이지가 암송 3모드로 첫 3장을 쓰기 때문에 통독은 구조적으로 노출 밖이다
— 그래서 CPP가 필요하다.

| 순서 | 기본 페이지 | CPP (통독 우선) |
|---|---|---|
| 1 | 홈 / 오늘 | **타자 통독** |
| 2 | 타일 탭 | **66권 픽셀 책장** |
| 3 | 타이핑 | **고어 사전** |
| 4 | 받아쓰기 | 홈 / 오늘 |
| 5 | 고어 사전 | 타일 탭 |
| 6 | 타자 통독 | 타이핑 |
| 7 | 66권 픽셀 책장 | 받아쓰기 |

Apple은 2025년 6월부터 **스크린샷 캡션도 색인**한다 → 캡션에 "타자 통독",
"66권 완독", "고어 사전" 같은 실검색어를 그대로 넣는다.
Google Play는 스크린샷 최대 8장이라 7장 구성이 그대로 들어간다.

---

## 근거 요약

- Apple: 제목 + 부제 + 키워드 100바이트만 색인, 필드 간 단어 중복 금지, 긴 설명은
  전환용. 스크린샷 캡션은 2025-06부터 색인.
- Google: 긴 설명까지 색인 → "성경 암송 / 성경 통독 / 성경 필사 / KJV / 말씀 암기"를
  본문에 자연 반복(현재 밀도 약 2%).
- 웹 SEO 타겟 키워드(`docs/seo-strategy.md`)와 정렬: "성경 암송 앱", "KJV 암송",
  "성경구절 외우기".
- 영어권: "bible memory app", "memorize bible verses", "scripture memorization",
  "KJV bible" — 웹 `/en` 페이지와 같은 키워드군으로 맞춰 스토어·웹 검색이 서로
  보강하게 한다.
- 모든 글자수·바이트는 `python3` 실측 (Apple 제목 30자/부제 30자/키워드 100바이트,
  Google 제목 30자/짧은 설명 80자/긴 설명 4,000자 준수).

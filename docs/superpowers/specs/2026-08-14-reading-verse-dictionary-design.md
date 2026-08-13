# 통독 절 완료 사전 (Reading Verse Dictionary) 설계

## 배경

KJV 고어 사전(계층 A 328개 + 계층 B 1,996개 = 2,324항목)은 이미 구현돼 있다.
스펙 `2026-08-08-archaic-dictionary-design.md`, 브랜치 `feature/archaic-dictionary`.

현재 사전에 닿는 경로는 **암송 결과 화면 하나뿐**이다. 결과 화면의 구절 카드
(`VerseWordsCard`)에서 등재 단어에 점선 밑줄이 그려지고, 탭하면 뜻 바텀시트가 뜬다.

통독(reading)에는 사전이 붙어 있지 않다. 통독은 절 원문을 보며 글자 단위로 따라 치는
루프이고, `_completeVerse`가 절 완료 즉시 다음 절 커서로 갈아끼운다 — **멈춤이 0초다.**
타이핑 중인 텍스트는 입력 대상이라 탭할 수도 없다. 그래서 사전을 보여줄 자리가 없었다.

이 스펙은 통독에 절 단위 사전 접점을 만든다.

## 목표

통독에서 절을 하나 다 치면 그 절을 밑줄 카드로 보여주고, 단어를 탭해 뜻을 볼 수 있게
한다. 사전이 필요 없는 사용자는 이 멈춤을 끌 수 있다.

## 비목표

- 사전 데이터 변경 — 에셋(`assets/dictionary/archaic_kjv.json`)은 손대지 않는다
- 단어 선별 로직 — 등재된 단어는 전부 밑줄이 그려진다(암송 결과 화면과 동일 규칙).
  절당 몇 개만 고르는 로직은 넣지 않는다
- 암송(받아쓰기) 화면 변경 — 이미 결과 화면에 `VerseWordsCard`가 붙어 있다
- 장 완료 화면 변경 — 절마다 볼 수 있으면 장 끝에서 또 보여줄 이유가 없다

## 설계

### 1. 통독 절 완료 정지

`ReadingState`에 `verseDone: bool` 추가 (기본 false).

`_completeVerse`는 현재 진행 기록·시도 적재 후 다음 절 커서로 바로 전진한다. 사전 토글이
켜져 있으면 여기서 **전진하지 않고** `verseDone: true`로 멈춘다. 커서는 방금 친 절의 완료
상태 그대로 둔다(장 경계 처리가 이미 쓰는 방식과 동일).

실제 전진은 새 메서드 `next()`가 맡는다 — `verseIndex`를 올리고 다음 절 커서로 갈아끼우고
`verseDone`을 false로 되돌린다. 장 경계면 기존대로 `chapterDone: true`.

토글이 꺼져 있으면 `verseDone`에 아예 들어가지 않는다. **기존 동작이 한 글자도 안 바뀐다.**

### 2. 절 완료 화면

`state.verseDone`이면 `_ReadingBody`가 `TypingVerseView` 대신 아래를 그린다:

- `VerseWordsCard(words: 방금 친 절의 단어들, matchMask: 전부 true, showMistakes: false)`
  — 통독은 글자 단위 차단이라 틀린 채로 완료될 수 없다. 항상 전부 맞은 상태다
- 하단 "넘어가기" 버튼 → `next()` 호출
- 카드 구석에 "그만 보기" 링크 → 토글을 끄고 즉시 `next()`, 스낵바로 되돌리는 법 안내

타이핑 뷰가 언마운트되므로 키보드가 자연히 내려가고 카드 탭이 먹는다. `next()`로 다시
마운트되면 `TypingVerseView`가 기존대로 포커스를 잡는다.

진행바·콤보 뱃지·"여기까지" 버튼은 이 상태에서도 그대로 유지한다 — 절 완료는 통독 중의
한 상태이지 별도 화면이 아니다.

### 3. VerseWordsCard 이동

현재 `lib/features/memorize/memorize_screen.dart` 안에 정의돼 있다. 통독도 쓰므로
`lib/shared/widgets/verse_words_card.dart`로 옮긴다. `TypingVerseView`가 통독·암송
공용이 되면서 같은 이유로 이미 shared에 나와 있다 — 그 선례를 따른다.

위젯 자체는 변경하지 않는다. 생성자 시그니처
(`words`/`matchMask`/`showMistakes`)도 그대로다. `memorize_screen.dart`의
`_MissedWordsCard` 래퍼는 import만 바꾼다.

### 4. 설정 토글

`soundOnProvider`/`hapticsOnProvider` 선례를 그대로 따른다.

- `AppSettingsRepository`에 `readingDictionaryOnKey = 'reading_dictionary_on'`
  (`'1'`(기본) | `'0'`)
- `lib/app/providers.dart`에 `ReadingDictionaryOnNotifier extends Notifier<bool>` +
  `readingDictionaryOnProvider`. `build() => true`, `load()`/`set(bool)`은 소리 토글과
  같은 형태. 앱 부팅 시 `load()`를 기존 로드 지점(providers.dart L193 부근)에 추가
- 설정 화면 소리/진동 옆에 `Switch` 한 줄

**기본값은 켜짐.** 기본이 꺼짐이면 설정에 들어가 본 사용자만 사전을 발견한다. 거슬리는
사용자는 절 완료 카드의 "그만 보기" 또는 설정에서 끈다.

라벨은 실제 동작을 그대로 말한다 — 이 토글은 사전의 존재가 아니라 통독이 절마다 멈추는지를
제어한다(사전은 끄든 켜든 암송 결과 화면에 남는다):

- ko: `"절마다 사전 보기"` / 부제 `"통독에서 절을 다 치면 멈추고 단어 뜻을 봐요"`
- en: `"Dictionary after each verse"` / `"Pause after each verse in reading to look up words"`

### 5. 광고 타이밍

`_evaluateAd`는 현재 `_completeVerse`에서 호출된다 — 이제 그 순간이 사전 카드가 뜨는
순간이다. 그대로 두면 전면 광고가 카드를 덮는다.

토글이 켜져 있으면 `_evaluateAd` 호출을 `next()`로 옮긴다(넘어갈 때 뜬다). 꺼져 있으면
지금처럼 `_completeVerse`에서 호출한다. 어느 쪽이든 **절 경계에서만 뜬다는 기존 불변식은
유지된다** — 타이핑 도중에는 절대 뜨지 않는다.

## 데이터 흐름

```
글자 입력 → advanceCursor → isComplete
  → _completeVerse: markTyped + _enqueueAttempt
      ├ 토글 켜짐 → verseDone: true (정지)
      │     화면: VerseWordsCard → 단어 탭 → 바텀시트
      │     "넘어가기" → next() → _evaluateAd → 다음 절 / chapterDone
      │     "그만 보기" → 토글 off + next()
      └ 토글 꺼짐 → _evaluateAd → 다음 절 / chapterDone (기존과 동일)
```

## 에러 처리

- 사전 로드 실패 시 `archaicDictionaryProvider`가 빈 사전을 준다. 카드는 밑줄 없이
  절 텍스트만 보여준다 — 통독은 계속 진행된다(기존 `ArchaicDictionary` 정책 그대로)
- 설정 읽기 실패 시 기본값 켜짐으로 동작한다

## 테스트

**컨트롤러** (`test/reading_controller_test.dart` 확장)
- 토글 켜짐: 절을 다 치면 `verseDone: true`이고 `verseIndex`가 안 올라간다
- 토글 켜짐: `next()`를 부르면 `verseIndex`가 오르고 `verseDone`이 false로 돌아간다
- 토글 켜짐: 마지막 절에서 `next()`를 부르면 `chapterDone: true`
- 토글 꺼짐: 절을 다 치면 `verseDone`에 안 들어가고 즉시 다음 절로 전진한다(무회귀)
- 토글 켜짐: 광고 요청이 `_completeVerse`가 아니라 `next()`에서 올라온다

**화면** (`test/reading_verse_dictionary_test.dart` 신설)
- `verseDone` 상태에서 `VerseWordsCard`와 "넘어가기" 버튼이 보인다
- "넘어가기"를 누르면 타이핑 뷰가 돌아온다
- "그만 보기"를 누르면 토글이 꺼지고 다음 절로 넘어간다

**기존 무회귀**
- `test/memorize_result_dictionary_test.dart` — `VerseWordsCard` 이동 후에도 통과
- `test/archaic_dictionary_test.dart`, `test/archaic_dictionary_data_test.dart`

## 변경 파일

- Move: `lib/features/memorize/memorize_screen.dart` → `lib/shared/widgets/verse_words_card.dart` (`VerseWordsCard`만)
- Modify: `lib/features/memorize/memorize_screen.dart` (import)
- Modify: `lib/features/reading/reading_controller.dart` (`verseDone`, `next()`, 광고 위치)
- Modify: `lib/features/reading/reading_screen.dart` (절 완료 분기)
- Modify: `lib/core/settings/app_settings_repository.dart` (키 추가)
- Modify: `lib/app/providers.dart` (notifier + provider + 부팅 로드)
- Modify: `lib/features/settings/settings_screen.dart` (스위치 한 줄)
- Modify: `lib/l10n/app_en.arb`, `lib/l10n/app_ko.arb`
- Test: `test/reading_controller_test.dart`(확장), `test/reading_verse_dictionary_test.dart`(신설)

## 트레이드오프

통독은 지금 장 하나를 논스톱으로 흘려 치는 루프다. 이 변경으로 절마다 버튼이 하나
생긴다. 콤보는 유지되지만 리듬은 확실히 느려진다. "사전을 보여주려면 멈춰야 한다"의
필연적 대가이고, 토글이 그 대가를 거부할 수단이다.

검토했으나 채택하지 않은 대안: 카드를 띄우되 키보드를 유지해 **다음 절 첫 글자를 치면
자동 전진**하는 방식. 사전을 안 쓰는 사용자는 멈춤을 아예 못 느끼고 설정도 필요 없다는
장점이 있으나, 카드를 띄운 채 타이핑 포커스를 살려야 하고 절 전환이 튀지 않게 다듬는
부담이 커서 이번 범위에서는 뺐다. 토글 사용률이 높게 나오면 재고할 여지가 있다.

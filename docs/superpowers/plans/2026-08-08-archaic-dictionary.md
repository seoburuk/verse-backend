# KJV 고어 사전 (암송 결과 화면) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 암송 결과 화면에서 구절의 고어 단어를 탭하면 뜻(현대영어/영영/한글) 바텀시트를 보여준다.

**Architecture:** KJV 본문 어휘(고어 ~300개 + 빈도 상위 일반 내용어 ~2,000개)를 정적 에셋 JSON 하나로 번들하고, `ArchaicDictionary`가 메모리 Map으로 로드·조회한다. 두 계층 모두 **AI가 KJV 용례를 알고 직접 3필드를 생성**하고(외부 사전 데이터 조회 방식은 시도 후 폐기 — 아래 경위 참고), 계층 A는 사람이 전수 검수, 계층 B는 배치별 검증 + 전체 표본 검수를 거친다. 런타임 스키마는 동일(`modern`/`en`/`ko`). 기존 `_MissedWordsCard`(결과 화면 구절 카드)를 초록 결과에도 노출하고 각 단어를 탭 가능하게 만든다.

**경위(계획 실행 중 변경됨):** 최초 계획은 계층 B를 kengdic(영한사전)+Princeton WordNet 자동 병합으로 채우는 것이었다. 실제 구현 결과 (1) kengdic과 KJV 어휘의 교집합이 4,014개뿐인 규모 상한과, (2) 더 심각하게 **KJV 특유의 17세기 의미를 반영하지 못하는 품질 문제**(`charity`→"동포애", KJV에서는 "사랑"; `en`/`ko`가 서로 다른 뜻을 가리키는 경우도 다수)가 확인되어 그 접근을 폐기했다. 자세한 내용은 스펙의 "개정 이력" 절 참고.

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
- 사전 수집 범위는 KJV 본문에 실제 등장하는 단어로 한정한다 — 본문에 없는 단어는
  후보로도 만들지 않는다
- 계층 A(고어 300개)와 계층 B(일반 어휘 2,000개) 모두 **AI가 KJV 용례를 알고 직접
  세 필드를 작성**한다 — 외부 사전/WordNet 등을 조회해서 값을 가져오지 않는다.
  KJV에서 뜻이 달라지는 단어(charity, meat, conversation, room, carriage 등)가
  많고, 외부 데이터는 이걸 반영하지 못한다는 게 이미 한 번 확인된 사실이다
- 계층 A는 사람이 전수 검수, 계층 B는 배치별 검증 + 전체 표본 검수(150개 이상)
- kengdic/WordNet 관련 작업(라이선스 고지 포함)은 모두 폐기됐다 — 재도입하지 않는다

## File Structure

- Create: `scripts/extract_general_vocabulary_candidates.py` — 계층 B 후보(고유명사·불용어·계층 A 제외한 KJV 내용어) 추출 (앱 빌드와 무관)
- Create: `scripts/extract_archaic_candidates.py` — 고어 후보 선별 (앱 빌드와 무관)
- Create: `assets/dictionary/archaic_kjv.json` — 사전 데이터 (진실의 원천, 계층 A+B 통합)
- Create: `lib/core/dictionary/archaic_dictionary.dart` — 로드 + 조회
- Modify: `lib/app/providers.dart` — provider 등록
- Modify: `pubspec.yaml` — 에셋 등록
- Modify: `lib/features/memorize/memorize_screen.dart` — 카드 초록 노출 + 탭 + 바텀시트
- Modify: `lib/l10n/app_en.arb`, `lib/l10n/app_ko.arb`
- Test: `test/archaic_dictionary_test.dart`, `test/archaic_dictionary_data_test.dart`, `test/memorize_result_dictionary_test.dart`

---

### Task 1: 계층 A — 고어 후보 추출 스크립트 + 300항목 생성

**Files:**
- Create: `scripts/extract_archaic_candidates.py`
- Create: `scripts/data/tier_a_archaic.json` — 계층 A 스테이징 산출물 (최종 에셋 아님)

**Interfaces:**
- Produces: `scripts/data/tier_a_archaic.json` — `{ "<소문자 표제어>": { "modern": str, "en": str, "ko": str } }`.
  Task 2가 이 파일을 계층 B 결과와 병합해 최종 `assets/dictionary/archaic_kjv.json`을 만든다.
  스키마는 최종 에셋과 동일하다.

- [ ] **Step 1: KJV 전문 확보**

프로젝트 구텐베르크 PD 텍스트를 스크래치패드에 받는다 (KJV 전문, 퍼블릭 도메인):

```bash
curl -sL https://www.gutenberg.org/cache/epub/10/pg10.txt -o /tmp/kjv_pd.txt
wc -l /tmp/kjv_pd.txt
```

Expected: 10만 줄 내외 텍스트. (다운로드 불가 시 백엔드 `bible_verses` 테이블 export로 대체 — 어느 쪽이든 빈도 순위만 쓰므로 결과 차이는 무시 가능. Task 2도 같은 텍스트를 재사용하므로 `/tmp/kjv_pd.txt` 경로를 그대로 유지한다.)

- [ ] **Step 2: 빈도 추출 스크립트 작성**

`scripts/extract_archaic_candidates.py`:

```python
#!/usr/bin/env python3
"""KJV 전문에서 토큰 빈도를 뽑아 고어 후보를 빈도순으로 출력한다.

일회성 스크립트 — 산출물인 scripts/data/tier_a_archaic.json이 진실의 원천이며
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

- [ ] **Step 4: 300개 항목 3필드 생성 → `scripts/data/tier_a_archaic.json`**

`scripts/data/` 디렉터리를 만들고, 선별한 각 표제어에 대해 아래 스키마로 JSON을 작성한다 (구현자가 AI 지식으로 직접 작성하되, KJV 용례 기준 의미로):

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
d = json.load(open('scripts/data/tier_a_archaic.json'))
assert all(k == k.lower() for k in d), 'lowercase keys'
assert all(v['modern'] and v['en'] and v['ko'] for v in d.values()), 'all fields'
print(len(d), 'entries OK')
"
```

Expected: `~300 entries OK`

> **사람 검수 게이트:** 이 300줄은 배포 전 사람이 전수 검수한다(스펙의 계층 A 정책).
> 검수는 Task 2(계층 B, 완전히 독립된 파이프라인)와 병렬로 진행할 수 있다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/extract_archaic_candidates.py scripts/data/tier_a_archaic.json
git commit -m "feat: KJV 고어 사전 데이터(계층 A) 300항목 + 추출 스크립트"
```

---

### Task 2: 계층 B — KJV 일반 어휘 후보 추출 + AI 배치 생성 → 최종 에셋

> **폐기된 이전 접근:** kengdic+WordNet 자동 병합을 실제로 구현해 검증했으나, 규모(교집합
> 4,014개뿐)와 품질(KJV 특유의 뜻을 반영 못함 — 예: `charity`가 "동포애"로 나왔지만 KJV
> 고린도전서 13장에서는 "사랑") 양쪽에서 실패해 폐기했다. 커밋 이력에 그 시도(`40c0a17`)가
> 남아있을 수 있으나 `git reset --hard`로 되돌려졌다 — 재사용하지 않는다. 아래는 그 대신
> 계층 A와 같은 방식(AI가 KJV 용례를 직접 알고 생성)으로 다시 설계한 것이다.

**이 태스크는 일반 구현자 1명이 처음부터 끝까지 처리하는 태스크가 아니다.** 후보 추출은
기계적 스크립트 작업이라 구현자 1명에게 맡기지만, 2,000개 항목 생성은 **컨트롤러(플랜을
실행하는 세션)가 약 150개씩 14개 배치로 나눠 배치마다 별도 서브에이전트를 순차 디스패치**한다
(각 배치는 독립적인 워드 목록과 출력 파일을 가지므로 충돌 없음). 이렇게 나누는 이유: 한
서브에이전트가 2,000개를 한 번에 쓰면 뒤로 갈수록 품질이 떨어질 위험이 있고, Task 1에서
300개를 한 서브에이전트가 처리하는 데 이미 6분 가까이 걸렸다(선형 추정 시 2,000개는
40분 이상 — 배치가 없으면 컨텍스트 피로와 시간 모두 문제가 된다).

**Files:**
- Create: `scripts/extract_general_vocabulary_candidates.py`
- Create: `scripts/data/tier_b_candidates.tsv` — 배치 생성 입력(선정된 2,000개 단어 목록)
- Create: `scripts/data/tier_b_batch_NN.json` (NN = 01~14) — 배치별 생성 결과, 스테이징
- Create: `assets/dictionary/archaic_kjv.json` — 계층 A + B 통합, 최종 산출물

**Interfaces:**
- Consumes: Task 1의 `scripts/data/tier_a_archaic.json`, `/tmp/kjv_pd.txt`(Task 1이 받아둔 KJV 전문 —
  없으면 Task 1 브리핑의 curl 명령으로 재확보)
- Produces: `assets/dictionary/archaic_kjv.json` — 이후 모든 Task가 의존하는 최종 스키마
  `{ "<소문자 표제어>": { "modern": str, "en": str, "ko": str } }`

#### Part A — 후보 추출 (구현자 서브에이전트 1명에게 위임)

- [ ] **Step 1: 후보 추출 스크립트 작성 + 실행**

`scripts/extract_general_vocabulary_candidates.py`:

```python
#!/usr/bin/env python3
"""KJV 전문에서 계층 B(일반 어휘) 후보를 빈도순으로 뽑아 상위 2,000개를 출력한다.

제외 대상:
- 계층 A(고어)에 이미 있는 표제어
- 성경 인명·지명 등 고유명사 (KJV 본문에서 항상 대문자로 시작하는 토큰으로 근사 판별)
- 영어 기능어(불용어) — 뜻이 아니라 문법 역할이라 사전 항목으로 부적합

일회성 스크립트 — 산출물인 scripts/data/tier_b_candidates.tsv가 다음 단계(배치 생성)의
입력이며, 이 스크립트 자체는 앱 빌드/런타임과 무관하다.

사용법: python3 scripts/extract_general_vocabulary_candidates.py \
    /tmp/kjv_pd.txt scripts/data/tier_a_archaic.json > scripts/data/tier_b_candidates.tsv
"""
import json
import re
import sys
from collections import Counter

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "so", "as", "of", "to",
    "in", "on", "at", "by", "for", "with", "from", "into", "upon", "unto",
    "is", "are", "was", "were", "be", "been", "being", "am",
    "he", "she", "it", "they", "we", "i", "you", "him", "her", "them", "us",
    "his", "her", "hers", "its", "their", "our", "my", "your",
    "this", "that", "these", "those", "there", "here",
    "not", "no", "yes", "all", "any", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "only", "own", "same", "than", "too",
    "very", "can", "will", "just", "shall", "should", "would", "could", "may",
    "might", "must", "do", "does", "did", "done", "have", "has", "had",
    "up", "down", "out", "off", "over", "under", "again", "further",
    "when", "where", "why", "how", "which", "who", "whom", "what",
}


def is_capitalized_in_text(word: str, text: str) -> bool:
    """이 단어가 본문에서 항상(또는 거의 항상) 대문자로 시작하는지 — 고유명사 근사 판별.
    본문에 10회 이상 등장하는데 90% 이상 대문자로 시작하면 고유명사로 간주."""
    pattern = re.compile(r"\b" + re.escape(word) + r"\b", re.IGNORECASE)
    occurrences = pattern.findall(text)
    if len(occurrences) < 10:
        return False
    capitalized = sum(1 for o in occurrences if o[0].isupper())
    return capitalized / len(occurrences) >= 0.9


def main(text_path: str, tier_a_path: str) -> None:
    raw_text = open(text_path, encoding="utf-8").read()
    tier_a = set(json.load(open(tier_a_path, encoding="utf-8")))

    tokens = re.findall(r"[A-Za-z]+", raw_text)
    freq = Counter(t.lower() for t in tokens)

    candidates = []
    checked_for_proper_noun: dict[str, bool] = {}
    for word, n in freq.most_common():
        if len(word) < 3:
            continue
        if word in tier_a or word in STOPWORDS:
            continue
        if word not in checked_for_proper_noun:
            checked_for_proper_noun[word] = is_capitalized_in_text(word, raw_text)
        if checked_for_proper_noun[word]:
            continue
        candidates.append((word, n))
        if len(candidates) >= 2000:
            break

    for word, n in candidates:
        print(f"{word}\t{n}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

```bash
python3 scripts/extract_general_vocabulary_candidates.py \
    /tmp/kjv_pd.txt scripts/data/tier_a_archaic.json > scripts/data/tier_b_candidates.tsv
wc -l scripts/data/tier_b_candidates.tsv
head -20 scripts/data/tier_b_candidates.tsv
tail -20 scripts/data/tier_b_candidates.tsv
```

Expected: 정확히 2,000줄(또는 KJV 어휘가 부족해 2,000개를 못 채우면 그보다 적은 수 — 이 경우도
정상이니 그대로 진행). 상위권에 shepherd, flock, harvest 같은 흔한 내용어가, 인명·지명(예:
Abraham, Jerusalem)은 필터링되어 보이지 않아야 한다. `head`/`tail`을 보고 고유명사나 불용어가
섞여 있으면 필터 로직을 조정한다.

- [ ] **Step 2: 커밋**

```bash
git add scripts/extract_general_vocabulary_candidates.py scripts/data/tier_b_candidates.tsv
git commit -m "feat: 계층 B 일반 어휘 후보 2000개 추출 스크립트"
```

> 이 시점부터는 컨트롤러가 Part B(배치 생성)를 직접 오케스트레이션한다 — 이 태스크의
> 나머지는 구현자 서브에이전트 1명에게 통째로 위임하지 않는다.

#### Part B — 배치 생성 (컨트롤러가 직접 오케스트레이션)

- [ ] **Step 3: 배치 분할**

컨트롤러가 `scripts/data/tier_b_candidates.tsv`를 순서대로 150줄씩 잘라 14개 배치로 나눈다
(2,000줄이면 마지막 배치는 100줄). 각 배치의 단어 목록을 다음 서브에이전트 디스패치에 그대로
전달할 수 있도록 준비한다(파일로 잘라도 되고, 디스패치 프롬프트에 목록을 직접 넣어도 된다 —
150개 단어 목록은 프롬프트에 넣기에 적당한 크기다).

- [ ] **Step 4: 배치별 생성 서브에이전트 순차 디스패치 (14회 반복)**

배치 `NN`(01부터 14까지)마다 아래 내용으로 서브에이전트를 디스패치한다. **순차로 디스패치한다
(병렬 금지)** — 동시에 여러 구현자를 띄우면 안 된다는 게 이 스킬의 일반 규칙이다.

디스패치 프롬프트 골격:
> 작업 디렉터리: (워크트리 경로)
> 이 저장소는 KJV 성경 암송 앱입니다. 아래는 KJV 본문에 실제 등장하는 영어 단어
> 150개 목록입니다: (배치 NN의 단어 목록 붙여넣기)
>
> 각 단어에 대해 **KJV(흠정역, 1611년 초판 기준 현대 철자) 본문에서 실제로 쓰이는 뜻**으로
> 세 필드를 작성하세요 — 일반 현대 영어 사전 뜻이 아니라 KJV 문맥 기준입니다. 예를 들어
> "charity"는 현대 뜻(자선)이 아니라 KJV(고린도전서 13장)에서의 뜻인 "사랑"으로,
> "meat"는 "고기"가 아니라 "음식 전반"으로, "conversation"은 "대화"가 아니라 "행실·삶의
> 방식"으로 씁니다. 한 단어가 KJV 안에서도 문맥마다 뜻이 갈리면 가장 대표적인/빈도 높은
> 뜻 하나를 고르세요(여러 뜻을 다 나열하지 않습니다).
>
> 필드:
> - `modern`: 현대 영어 대응어/동의어 (짧게)
> - `en`: 한 문장 영영 정의 (KJV 문맥 기준)
> - `ko`: 한 문장 한글 설명 (KJV 문맥 기준)
>
> 세 필드 모두 필수, 플레이스홀더 금지. 결과를
> `scripts/data/tier_b_batch_NN.json`(NN을 실제 배치 번호로)에
> `{"단어": {"modern": ..., "en": ..., "ko": ...}}` 형태로 150개 전부 작성하세요.
> 파일만 작성하고 커밋은 하지 마세요(컨트롤러가 전체 배치를 모은 뒤 한 번에 커밋합니다).
> 끝나면 작성한 항목 수와 파일 경로만 짧게 보고하세요.

이 배치 태스크는 계층 A(Task 1)보다 단순하다(빈도 추출·선별 없이 주어진 단어 목록에 뜻만
채우면 됨) — 모델은 빠르고 저렴한 등급(`sonnet`)이면 충분하다. 배치 하나가 끝나면 결과
파일이 실제로 150개(또는 마지막 배치는 남은 개수)를 채웠는지, 플레이스홀더가 없는지 빠르게
확인한 뒤 다음 배치를 디스패치한다:

```bash
python3 -c "
import json
d = json.load(open('scripts/data/tier_b_batch_01.json'))
assert len(d) >= 100, f'항목 수 부족: {len(d)}'
assert all(v.get('modern') and v.get('en') and v.get('ko') for v in d.values()), '빈 필드 있음'
print(len(d), 'OK')
"
```

이 확인에서 실패하면(항목 부족, 빈 필드) 같은 배치를 다시 디스패치한다 — 다음 배치로
넘어가지 않는다.

- [ ] **Step 5: 배치 병합**

14개 배치 파일이 모두 준비되면 병합한다:

```bash
python3 -c "
import glob, json
merged = json.load(open('scripts/data/tier_a_archaic.json'))
tier_a_count = len(merged)
tier_b_count = 0
for path in sorted(glob.glob('scripts/data/tier_b_batch_*.json')):
    batch = json.load(open(path))
    for word, entry in batch.items():
        word = word.lower()
        if word in merged:
            continue  # 배치 간 중복 또는 계층 A와 겹침 — 먼저 채워진 쪽 유지
        merged[word] = entry
        tier_b_count += 1
import os
os.makedirs('assets/dictionary', exist_ok=True)
json.dump(merged, open('assets/dictionary/archaic_kjv.json', 'w', encoding='utf-8'),
           ensure_ascii=False, indent=2, sort_keys=True)
print(f'tier A: {tier_a_count}, tier B: {tier_b_count}, 최종: {len(merged)}')
"
```

- [ ] **Step 6: 무결성 검증**

```bash
python3 -c "
import json
d = json.load(open('assets/dictionary/archaic_kjv.json'))
assert all(k == k.lower() for k in d), 'lowercase keys'
assert all(v['modern'] and v['en'] and v['ko'] for v in d.values()), 'all fields'
print(len(d), 'entries OK')
"
```

Expected: `~2300 entries OK` 근처(계층 A 300 + 계층 B 최대 2000, 배치 간 중복 등으로 약간 적을 수 있음).
2,000 미만이면 배치 중 일부가 누락됐다는 뜻이니 어느 배치가 비었는지 확인한다.

- [ ] **Step 7: 전체 표본 검수**

```bash
python3 -c "
import json, random
d = json.load(open('assets/dictionary/archaic_kjv.json'))
tier_a = set(json.load(open('scripts/data/tier_a_archaic.json')))
tier_b_words = [w for w in d if w not in tier_a]
random.seed(42)
sample = random.sample(tier_b_words, min(150, len(tier_b_words)))
for w in sample:
    print(w, '|', d[w])
"
```

이 150개를 컨트롤러가 직접 눈으로 훑어(또는 다음 태스크 리뷰어에게 위임) KJV 문맥에 맞는
뜻인지 확인한다. `charity`→사랑, `meat`→음식, `conversation`→행실처럼 KJV 특유의 뜻이 실제로
반영됐는지 표본에 포함되면 반드시 확인한다. 문제가 발견되면 해당 배치만 다시 디스패치해
고친다 — 전체를 다시 만들지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add scripts/data/tier_b_batch_*.json assets/dictionary/archaic_kjv.json
git commit -m "feat: KJV 일반 어휘 사전(계층 B) AI 배치 생성 + 최종 에셋"
```

---

### Task 3: 에셋 등록 + 데이터 무결성 테스트

**Files:**
- Modify: `pubspec.yaml` (flutter.assets 목록)
- Test: `test/archaic_dictionary_data_test.dart`

**Interfaces:**
- Consumes: Task 2의 `assets/dictionary/archaic_kjv.json`
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

  // 계층 B(배치 생성) 중 일부 배치가 조용히 누락되는 회귀를 잡는다 —
  // 계층 A 300 + 계층 B 최대 2000이 스펙 기대치.
  test('archaic_kjv.json: 항목 수가 최소 기대치 이상이다', () {
    final raw = File('assets/dictionary/archaic_kjv.json').readAsStringSync();
    final map = jsonDecode(raw) as Map<String, dynamic>;
    expect(map.length, greaterThanOrEqualTo(2000),
        reason: '계층 B 배치 생성이 실패했거나 산출물이 비정상적으로 작다');
  });
}
```

- [ ] **Step 2: 테스트 실행 → 통과 확인**

```bash
flutter test test/archaic_dictionary_data_test.dart
```

Expected: PASS (Task 1+2 데이터가 올바르면 바로 통과. 실패하면 데이터를 고친다 — 테스트를 고치지 않는다.)

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

### Task 4: ArchaicDictionary 로더/조회 + provider

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

### Task 5: 결과 화면 — 카드 초록 노출 + 단어 탭 + 바텀시트

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

### Task 6: 실기기/시뮬레이터 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 시뮬레이터에서 암송 1회 진행**

앱을 시뮬레이터에서 실행해 확인:
1. 일부러 틀리게 제출 → 노랑/빨강 결과에서 카드가 기존처럼 보이고, `unto`·`hath` 류 단어에 점선 밑줄이 보인다
2. 점선 단어 탭 → 바텀시트에 표제어/현대영어/영영/한글이 뜬다
3. 완벽 정답 제출 → 초록 결과에도 카드가 뜨고 제목이 중립 문구다
4. **계층 B(일반 어휘) 단어 확인**: 고어가 아닌 평범한 단어(예: `shepherd`, `flock`,
   `harvest`)가 포함된 구절로 암송해, 그런 단어에도 점선 밑줄과 탭 반응이 있는지 확인한다.
   `charity`, `meat`, `conversation`처럼 KJV에서 뜻이 달라지는 단어가 있으면 탭해서
   KJV 문맥에 맞는 뜻(사랑/음식/행실)이 나오는지 확인한다
5. 미등재 단어 탭 → 아무 일도 없다

- [ ] **Step 2: 스크린샷 확보 후 완료 보고**

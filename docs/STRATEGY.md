# 픽셀바이블 성공 전략

> 작성일: 2026-07-02. 포지셔닝 확정: **캐주얼 게임** (교회/홈스쿨 도구 아님), 목표: **실제 수익 창출 사업**.
> 기술 현황은 [PIXELBIBLE_SPEC.md](PIXELBIBLE_SPEC.md) 참고.

---

## 1. 객관적 성공가능성 평가

### 불리한 점 (솔직하게)

- **니치 안의 니치**: "한국어 사용자 × 영어 KJV × 암송". KJV는 1611년 고어체(thee/thou/hath)라 "영어공부" 소구력도 제한적이다.
- 캐주얼 게이머에게 성경 암송 자체는 끌림(pull)이 약하다 → 실질 타겟은 "이미 신앙이 있고 게임을 좋아하는 층"으로 좁혀진다.
- 솔로 개발 앱의 기본 성공률은 낮다. 유료 전환율 벤치마크는 업계 최상위인 Duolingo도 [~3% 수준](https://appadvertising-reviews.com/duolingo-monetisation/)이다.

### 유리한 점

- **실질 경쟁 공백**: [Bible Memory](https://biblememory.com/)(월 $9.99), Verses(연 $4.99~) 등 기존 앱은 전부 "진지한 학습 도구"다. 듀오링고식 게임화 + 픽셀 감성의 성경암송 앱은 사실상 없다. ([2026년 비교 리뷰](https://www.biblememorygoal.com/memory-methods/best-bible-memory-apps/) 기준 확인)
- **시장 자체는 거대**: YouVersion은 [누적 10억 설치, DAU 1,200만](https://sherwood.news/business/bible-billion-dollar-ip/). 가톨릭 기도앱 Hallow는 슈퍼볼 광고를 집행하는 수준으로 성장 — "신앙 × 잘 만든 소비자 앱" 조합이 통한다는 증거.
- **기술 기반 완성**: 채점 엔진(LCS), 목숨, 스트릭, 진도 추적이 이미 구현 완료. 남은 것은 재미와 배포다.

### 현실적 목표

"대박"이 아니라 **니치 지배 → 점진 확장**이 정직한 경로다.

| 시점 | 목표 | 근거 |
|---|---|---|
| 출시 +3개월 | D7 리텐션 20% | 리텐션 없이는 유입이 전부 낭비 |
| 출시 +6개월 | MAU 3천, 첫 광고 매출 | 보상형 광고 도입 시점 |
| 출시 +12개월 | MAU 1만, 유료전환 2~3% | ≈ 월 수십만~수백만 원 |

### 핵심 전략 제언: 개역한글판 추가

KJV를 선택한 실제 이유는 **퍼블릭 도메인(저작권 무료)**이다. 같은 논리로 한국어 성경 중 **개역한글판(1961)**도 저작권 만료 상태로 알려져 있다(⚠️ 상용화 전 법적 확인 필요 — 대한성서공회 입장 및 판본별 차이 검토). 확인되면:

- **영어 부담 없는 "한국어 암송 모드"**가 열려 한국 캐주얼 시장이 몇 배로 넓어진다.
- KJV는 "영어 도전 모드"로 재포지셔닝 — 한국어로 익힌 절을 영어로 재도전하는 자연스러운 난이도 사다리가 생긴다.
- 개역개정·NIV·쉬운성경은 저작권이 살아 있어 불가.

---

## 2. 재미요소 개선안 (오락 최우선)

우선순위 순:

1. **수집(Collection) 메타** — 암송 성공한 절 = 픽셀 카드 획득. 한 장(chapter) 완성 시 스테인드글라스/픽셀 일러스트가 완성된다. 게임의 "도감" 심리. 기존 `progress` 테이블 데이터로 바로 구현 가능.
2. **도트 다윗 캐릭터 = 마스코트 + 리액션** — 정답 시 춤, 오답 시 시무룩. 듀오링고 부엉이의 역할. 쇼츠/릴스 마케팅 자산과 겸용된다.
3. **오늘의 절(Daily Verse) + 공유 카드** — Wordle 모델. 하루 1절, 결과를 🟩🟨🟥 그리드 이미지로 공유. 바이럴 루프의 핵심.
4. **스트릭 강화** — 스트릭 프리즈(광고 시청으로 획득), 위험 시 푸시 알림. [Trophy 데이터](https://trophy.so/blog/duolingo-gamification-case-study) 기준 프리즈 유무로 스트릭 지속 기간이 48% 차이(17.2일 vs 11.6일).
5. **주간 리그/친구 대결** — XP 리더보드. Duolingo 리텐션의 핵심 장치지만 서버 작업이 커서 후순위.
6. **Juice** — 효과음, 타일 배치 애니메이션, 콤보 연출. 픽셀 게임 감성의 완성. 작지만 체감 큰 투자.

---

## 3. 수익화 (Duolingo 모델 이식)

Duolingo는 [유료 사용자 3% 미만으로도 지속 가능한 수익](https://appadvertising-reviews.com/duolingo-monetisation/)을 만든다. 같은 구조를 이식한다:

- **보상형 광고 (1차)**: 목숨 회복(기존 lives 시스템에 훅), 스트릭 프리즈 획득. "광고가 도움이 되는 순간"에만 노출 — 스트릭이 끊길 위기에 광고로 지키게 하는 것이 대표 패턴. 배너/전면 광고는 신앙 앱 특성상 반감이 커서 지양.
- **구독 (2차, 월 ₩3,900 / 연 ₩29,000 수준)**: 광고 제거 + 목숨 무한 + 단어사전(`word_glossary` 완성 후) + 오프라인.
- **일회성 IAP**: 캐릭터 스킨/픽셀 테마 — 수집 메타와 연결해 감정적 투자를 만든다.
- **도입 순서**: 광고 먼저(유저가 적어도 수익 0보다 큼) → MAU 5천+ 시점에 구독 도입.

---

## 4. 마케팅

1. **쇼츠/릴스 = 주력 채널**: 도트 다윗 춤 + "이 절 영어로 외워보기" 챌린지 포맷. 픽셀아트는 알고리즘 친화적 비주얼이고 제작비가 0에 가깝다.
2. **공유 루프 내장**: Daily Verse 결과 카드(§2-3)가 유입 엔진. 마케팅 예산 대신 제품에 바이럴을 심는다.
3. **ASO**: "성경 암송", "영어 성경", "bible memory game" 키워드. 경쟁이 약해 상위 노출이 현실적이다.
4. **커뮤니티 시딩**: 기독 대학부/청년부 인스타, 신앙 유튜버 소규모 협찬. 톤은 "교회 공식 도구"가 아니라 **"게임 추천"**으로.
5. **지표 우선 원칙**: 마케팅 확대 전에 D1/D7 리텐션 확보(D7 20%+). 리텐션 없는 유입은 낭비다.

---

## 출처

- [Best Bible Memory Apps 2026 비교](https://www.biblememorygoal.com/memory-methods/best-bible-memory-apps/) / [remem.me 비교](https://www.remem.me/best-bible-memory-apps/)
- [The Bible Memory App 가격](https://biblememory.com/)
- [YouVersion — Bible is a billion-dollar IP (Sherwood)](https://sherwood.news/business/bible-billion-dollar-ip/)
- [YouVersion 심리학 분석 (Nir Eyal)](https://www.nirandfar.com/the-app-of-god-getting-100-million-downloads-is-more-psychology-than-miracles/)
- [Duolingo 수익 모델 분석](https://appadvertising-reviews.com/duolingo-monetisation/) / [AppMakers 분석](https://appmakersla.com/blog/popular-apps/how-duolingo-makes-money/)
- [Duolingo 게임화 케이스 스터디 (Trophy)](https://trophy.so/blog/duolingo-gamification-case-study)
- [Duolingo 스트릭 시스템 분석 (Medium)](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)

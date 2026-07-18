# 코스 해설 콘텐츠 로드맵

개혁주의(Reformed) 관점의 코스/권 해설을 코스 페이지에 임베드해 SEO(고유 콘텐츠 확보)와 광고 승인, 학습 동기를 확보한다. 파이프라인은 이미 구축됨: `verse-backend/scripts/seed_courses/commentary/{slug}.ko.md` / `{slug}.en.md` → `seed_commentary.go`가 `courses.commentary`/`commentary_en`에 멱등 적재 → 프론트 코스 페이지가 토글로 SSR 렌더.

각 해설 구조(고정): ① 권/코스 소개 ② 개혁주의 관점 핵심 메시지 ③ 추천 암송 구절(유명 구절 전부, 원문 인용 + 고유 해설) ④ 암송하면 좋은 이유. ko/en 두 벌.

## 진행 현황

### 완료
- `book-01-genesis` (창세기)
- `book-43-john` (요한복음)
- `messiah-prophecy` (메시아 예언 주제 코스)

### 지금 작성 (이번 배치)
- `book-05-deuteronomy` (신명기) — **쉐마(신 6:4-9)** 중심
- `book-40-matthew` (마태복음)
- `book-41-mark` (마가복음)
- `book-42-luke` (누가복음)
- 바울서신: `book-45-romans`(로마서), `book-46-1-corinthians`, `book-47-2-corinthians`, `book-48-galatians`, `book-49-ephesians`, `book-50-philippians`, `book-51-colossians`, `book-52-1-thessalonians`, `book-53-2-thessalonians`, `book-54-1-timothy`, `book-55-2-timothy`, `book-56-titus`, `book-57-philemon`

## 추후 작업

### 1. 기초·메시아 예언 재작성/보강
- `warmup`(기초) 주제 코스 해설 신규 작성
- `messiah-prophecy` 해설 재검토·보강 (예언→성취 매핑 정확도, 개혁주의 언약신학 심화)

### 2. 섹터(주제 코스) 해설 전체
- warmup 외 주제 코스(주기도문 등 카테고리)별 해설
- 섹션(장) 단위 해설은 하지 않음 — 섹션 URL은 SEO 색인에서 제외했으므로 권/코스 단위에 집중

### 3. 전체 권 해설 (66권)
- 이번 배치 외 나머지 구약·신약 전 권 해설 순차 작성
- 우선순위: 검색량·암송 빈도 높은 권부터 (시편, 로마서(완료), 잠언, 이사야 등)

### 4. 품질·검증
- 현재는 신학적 사람 검수 게이트 생략 상태 — 전량 적재 후 개혁주의 신학 관점 정확성 일괄 재검토
- 적재 후 Search Console 재크롤 요청 + AdMob/AdSense 재심사

## 운영 메모
- 새 해설 추가 = `.md` 파일만 추가 후 `go run ./scripts/seed_courses` 재실행(멱등). 코드 변경 불필요.
- 마크다운 지원 범위: `#`/`##` 제목, 문단, `>` 인용, `**볼드**`. 그 외 문법(`###`, 리스트)은 렌더러 미지원이므로 사용 금지.

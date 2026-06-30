#!/usr/bin/env python3
"""
build_verses_csv.py
KJV 66권 JSON(data/kjv/*.json) -> data/verses.csv (book,chapter,verse,text).

설계 결정:
  - DB 드라이버(psycopg) 미사용. CSV 로 빌드 후 psql \\copy 로 적재.
    이유: 의존성 최소화 + \\copy 의 대량 적재 성능 + 중간 산출물(CSV) 디버깅 용이.
  - book 은 1..66 정수로 매핑 (스키마 book SMALLINT 와 일치). 정답지의 단일 표준.
  - 적재 전에 이 스크립트가 자체적으로 31,102 를 검증한다. "넣고 나서 틀린 걸
    발견"하는 게 아니라 "넣기 전에 막는다" — fail fast.
"""
import json
import csv
import sys
from pathlib import Path

# KJV 표준 66권 정경 순서. 인덱스+1 = book 번호.
BOOK_ORDER = [
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth",
    "1Samuel","2Samuel","1Kings","2Kings","1Chronicles","2Chronicles","Ezra","Nehemiah",
    "Esther","Job","Psalms","Proverbs","Ecclesiastes","SongofSolomon","Isaiah","Jeremiah",
    "Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah",
    "Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
    "Matthew","Mark","Luke","John","Acts","Romans","1Corinthians","2Corinthians",
    "Galatians","Ephesians","Philippians","Colossians","1Thessalonians","2Thessalonians",
    "1Timothy","2Timothy","Titus","Philemon","Hebrews","James","1Peter","2Peter",
    "1John","2John","3John","Jude","Revelation",
]

EXPECTED_TOTAL = 31102
EXPECTED_OT    = 23145   # book 1..39
EXPECTED_NT    = 7957    # book 40..66
EXPECTED_CHAP  = 1189

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / "data" / "kjv"
OUT  = ROOT / "data" / "verses.csv"


def main() -> int:
    rows = []
    total = ot = nt = chapters = 0

    for idx, book_name in enumerate(BOOK_ORDER, start=1):
        path = SRC / f"{book_name}.json"
        if not path.exists():
            print(f"[FATAL] missing book file: {path}", file=sys.stderr)
            return 1
        data = json.loads(path.read_text(encoding="utf-8"))
        for ch in data["chapters"]:
            chapters += 1
            chapter_no = int(ch["chapter"])
            for v in ch["verses"]:
                verse_no = int(v["verse"])
                text = v["text"]
                rows.append((idx, chapter_no, verse_no, text))
                total += 1
                if idx <= 39:
                    ot += 1
                else:
                    nt += 1

    # ── 적재 전 검증: 틀리면 CSV 를 쓰지 않고 즉시 실패 ──
    ok = True
    def check(label, got, exp):
        nonlocal ok
        status = "OK" if got == exp else "MISMATCH"
        if got != exp:
            ok = False
        print(f"  {label:12s}: {got:6d}  (expect {exp})  -> {status}")

    print("=== pre-load verification ===")
    check("total",    total,    EXPECTED_TOTAL)
    check("OT",       ot,       EXPECTED_OT)
    check("NT",       nt,       EXPECTED_NT)
    check("chapters", chapters, EXPECTED_CHAP)

    if not ok:
        print("[FATAL] count mismatch — refusing to write CSV.", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["book", "chapter", "verse", "text"])
        w.writerows(rows)

    print(f"=== wrote {len(rows)} rows -> {OUT} ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())

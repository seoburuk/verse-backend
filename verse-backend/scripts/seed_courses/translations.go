package main

import "fmt"

// translations.go — 코스 콘텐츠(제목/섹션/주제) 한글→영어 번역 데이터.
// 영어모드(/en)에서 코스 제목·섹션·주제를 영어로 노출하기 위해 시드가 *_en 컬럼을 채운다.
// 매핑에 없으면 "" → NULL 저장 → 프론트가 한글로 폴백한다.

// themeEn — 워밍업/주제 코스 라벨 및 코스 제목(한글) → 영어.
// 이 라벨들은 코스 title, 섹션 title, 아이템 topic으로 재사용된다.
var themeEn = map[string]string{
	"기초":     "Foundations",
	"말씀":     "The Word",
	"기도":     "Prayer",
	"성령":     "The Holy Spirit",
	"회개":     "Repentance",
	"마귀":     "The Devil",
	"찬송":     "Praise",
	"전도":     "Evangelism",
	"축복":     "Blessing",
	"감사":     "Thanksgiving",
	"치료":     "Healing",
	"십자가":    "The Cross",
	"부활":     "Resurrection",
	"믿음":     "Faith",
	"소망":     "Hope",
	"사랑":     "Love",
	"하나님":    "God",
	"예수님":    "Jesus",
	"구원":     "Salvation",
	"은혜":     "Grace",
	"능력":     "Power",
	"겸손":     "Humility",
	"순종":     "Obedience",
	"평안":     "Peace",
	"성실":     "Diligence",
	"인내":     "Patience",
	"천국":     "Heaven",
	"충성":     "Faithfulness",
	"거룩":     "Holiness",
	"증거":     "Testimony",
	"절제":     "Self-Control",
	"워밍업 섹터": "Warm-up Sector",
	"구약에 나온 메시아에 대한 예언 성취": "Messianic Prophecies Fulfilled in the Old Testament",
}

// bookKoEn — 66권 한글→영어(books 슬라이스에서 파생) + 메시아 섹션 제목용 별칭.
func bookKoEn() map[string]string {
	m := map[string]string{
		"아가서": "Song of Solomon", // 메시아 섹션은 "아가서", books 슬라이스는 "아가"
	}
	for _, b := range books {
		m[b.ko] = b.en
	}
	return m
}

// chapterTitleEn — 책 코스 섹션("3장") 영어 제목.
func chapterTitleEn(ch int16) string { return fmt.Sprintf("Chapter %d", ch) }

// nz — 빈 문자열이면 nil(=SQL NULL)을, 아니면 문자열을 반환한다.
// 미번역 항목을 NULL로 저장해 프론트 폴백이 동작하게 한다.
func nz(s string) any {
	if s == "" {
		return nil
	}
	return s
}

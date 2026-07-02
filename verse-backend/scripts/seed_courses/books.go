package main

import "strings"

// bookInfo — 66권 책 정보(순서 고정, bible_verses.book 번호와 1:1).
type bookInfo struct {
	num int16
	ko  string
	en  string
}

// books — 표준 KJV 66권 순서. en은 bible_verses 적재 시 사용한 영문 표기와 동일하게 유지.
var books = []bookInfo{
	{1, "창세기", "Genesis"},
	{2, "출애굽기", "Exodus"},
	{3, "레위기", "Leviticus"},
	{4, "민수기", "Numbers"},
	{5, "신명기", "Deuteronomy"},
	{6, "여호수아", "Joshua"},
	{7, "사사기", "Judges"},
	{8, "룻기", "Ruth"},
	{9, "사무엘상", "1 Samuel"},
	{10, "사무엘하", "2 Samuel"},
	{11, "열왕기상", "1 Kings"},
	{12, "열왕기하", "2 Kings"},
	{13, "역대상", "1 Chronicles"},
	{14, "역대하", "2 Chronicles"},
	{15, "에스라", "Ezra"},
	{16, "느헤미야", "Nehemiah"},
	{17, "에스더", "Esther"},
	{18, "욥기", "Job"},
	{19, "시편", "Psalms"},
	{20, "잠언", "Proverbs"},
	{21, "전도서", "Ecclesiastes"},
	{22, "아가", "Song of Solomon"},
	{23, "이사야", "Isaiah"},
	{24, "예레미야", "Jeremiah"},
	{25, "예레미야애가", "Lamentations"},
	{26, "에스겔", "Ezekiel"},
	{27, "다니엘", "Daniel"},
	{28, "호세아", "Hosea"},
	{29, "요엘", "Joel"},
	{30, "아모스", "Amos"},
	{31, "오바댜", "Obadiah"},
	{32, "요나", "Jonah"},
	{33, "미가", "Micah"},
	{34, "나훔", "Nahum"},
	{35, "하박국", "Habakkuk"},
	{36, "스바냐", "Zephaniah"},
	{37, "학개", "Haggai"},
	{38, "스가랴", "Zechariah"},
	{39, "말라기", "Malachi"},
	{40, "마태복음", "Matthew"},
	{41, "마가복음", "Mark"},
	{42, "누가복음", "Luke"},
	{43, "요한복음", "John"},
	{44, "사도행전", "Acts"},
	{45, "로마서", "Romans"},
	{46, "고린도전서", "1 Corinthians"},
	{47, "고린도후서", "2 Corinthians"},
	{48, "갈라디아서", "Galatians"},
	{49, "에베소서", "Ephesians"},
	{50, "빌립보서", "Philippians"},
	{51, "골로새서", "Colossians"},
	{52, "데살로니가전서", "1 Thessalonians"},
	{53, "데살로니가후서", "2 Thessalonians"},
	{54, "디모데전서", "1 Timothy"},
	{55, "디모데후서", "2 Timothy"},
	{56, "디도서", "Titus"},
	{57, "빌레몬서", "Philemon"},
	{58, "히브리서", "Hebrews"},
	{59, "야고보서", "James"},
	{60, "베드로전서", "1 Peter"},
	{61, "베드로후서", "2 Peter"},
	{62, "요한일서", "1 John"},
	{63, "요한이서", "2 John"},
	{64, "요한삼서", "3 John"},
	{65, "유다서", "Jude"},
	{66, "요한계시록", "Revelation"},
}

// bookSlug — "1 Samuel" → "1-samuel" 같은 slug 조각.
func bookSlug(en string) string {
	lower := strings.ToLower(en)
	return strings.ReplaceAll(lower, " ", "-")
}

// category — 1-39권 구약, 40-66권 신약.
func (b bookInfo) category() string {
	if b.num <= 39 {
		return "ot"
	}
	return "nt"
}

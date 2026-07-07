export const BOOKS = [
  "", "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
  "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
  "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
];

export const BOOKS_KO = [
  "", "창세기", "출애굽기", "레위기", "민수기", "신명기",
  "여호수아", "사사기", "룻기", "사무엘상", "사무엘하", "열왕기상", "열왕기하",
  "역대상", "역대하", "에스라", "느헤미야", "에스더", "욥기",
  "시편", "잠언", "전도서", "아가", "이사야",
  "예레미야", "예레미야애가", "에스겔", "다니엘", "호세아", "요엘", "아모스",
  "오바댜", "요나", "미가", "나훔", "하박국", "스바냐", "학개",
  "스가랴", "말라기", "마태복음", "마가복음", "누가복음", "요한복음", "사도행전",
  "로마서", "고린도전서", "고린도후서", "갈라디아서", "에베소서",
  "빌립보서", "골로새서", "데살로니가전서", "데살로니가후서",
  "디모데전서", "디모데후서", "디도서", "빌레몬서", "히브리서", "야고보서",
  "베드로전서", "베드로후서", "요한일서", "요한이서", "요한삼서", "유다서", "요한계시록",
];

export function bookName(book: number, locale: string): string {
  const arr = locale === "en" ? BOOKS : BOOKS_KO;
  return arr[book] ?? String(book);
}

export function bookRef(book: number, chapter: number, verse: number): string {
  return `${BOOKS[book] ?? book} ${chapter}:${verse}`;
}

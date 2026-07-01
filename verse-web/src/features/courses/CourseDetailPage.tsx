import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCourse, type CourseDetail } from "../../api/courses";
import { getProgress } from "../../api/progress";

function bookRef(book: number, chapter: number, verse: number): string {
  const books = [
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
  return `${books[book] ?? book} ${chapter}:${verse}`;
}

export function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [cleared, setCleared] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    Promise.all([getCourse(slug), getProgress()])
      .then(([c, p]) => {
        setCourse(c);
        setCleared(new Set(p.items.filter((it) => it.cleared).map((it) => it.course_item_id)));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => navigate("/courses")}>← 코스 목록</button>
        <h2 className="title">{course?.title ?? "..."}</h2>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}
        {course?.sections
          ? (
            <div className="item-list">
              {course.sections.map((section) => (
                <button
                  key={section.section_id}
                  className="item-card"
                  onClick={() => navigate(`/sections/${section.section_id}`, { state: { courseSlug: slug } })}
                >
                  <span className="item-topic">{section.title}</span>
                  <span className="item-ref">{section.items.length}구절</span>
                </button>
              ))}
            </div>
          )
          : (
            <div className="item-list">
              {course?.items?.map((item, index) => (
                <button
                  key={item.course_item_id}
                  className="item-card"
                  onClick={() =>
                    navigate(`/memorize/${item.course_item_id}`, {
                      state: { items: course.items, index, courseSlug: slug },
                    })
                  }
                >
                  <span className="item-topic">
                    {cleared.has(item.course_item_id) && <span className="item-cleared">✓ </span>}
                    {item.topic}
                  </span>
                  <span className="item-ref">{bookRef(item.book, item.chapter, item.verse)}</span>
                </button>
              ))}
            </div>
          )
        }
      </main>
    </div>
  );
}

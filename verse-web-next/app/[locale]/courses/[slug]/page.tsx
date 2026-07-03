import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseServer, listCoursesServer } from "../../../lib/api/server";
import { bookRef } from "../../../lib/bookRef";
import CourseDetailPersonal from "../../../components/courses/CourseDetailPersonal";

export async function generateStaticParams() {
  try {
    const courses = await listCoursesServer();
    return courses.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const course = await getCourseServer(slug);
    const totalVerses =
      (course.items?.length ?? 0) +
      (course.sections?.reduce((n, s) => n + s.items.length, 0) ?? 0);
    return {
      title: course.title,
      description: `${course.title} — KJV 성경 ${totalVerses}구절 암송 코스. 절별로 암기하며 말씀을 마음에 새기세요.`,
      openGraph: {
        title: `${course.title} | PIX BIBLE`,
        description: `KJV 성경 ${totalVerses}구절 암송 코스.`,
      },
    };
  } catch {
    return { title: "코스 상세" };
  }
}

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let course;
  try {
    course = await getCourseServer(slug);
  } catch {
    notFound();
  }

  const totalVerses =
    (course.items?.length ?? 0) +
    (course.sections?.reduce((n, s) => n + s.items.length, 0) ?? 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: course.title,
    numberOfItems: totalVerses,
    itemListElement: course.sections
      ? course.sections.map((s, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: s.title,
        }))
      : (course.items ?? []).slice(0, 20).map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.topic,
          description: item.text,
        })),
  };

  return (
    <div className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="page-header">
        <Link href="/courses" className="btn-link">← 코스 목록</Link>
        <h1 className="title">{course.title}</h1>
        <CourseDetailPersonal />
      </header>
      <main className="content">
        {course.sections ? (
          <div className="item-list">
            {course.sections.map((section) => (
              <Link
                key={section.section_id}
                href={`/courses/${slug}/sections/${section.section_id}`}
                className="item-card"
              >
                <span className="item-topic">{section.title}</span>
                <span className="item-ref">{section.items.length}구절</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="item-list">
            {(course.items ?? []).map((item, index) => (
              <Link
                key={item.course_item_id}
                href={`/courses/${slug}/memorize/${item.course_item_id}?i=${index}`}
                className="item-card"
              >
                <span className="item-topic">{item.topic}</span>
                <span className="item-ref">{bookRef(item.book, item.chapter, item.verse)}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

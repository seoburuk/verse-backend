import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMemorize } from "./useMemorize";
import { DragTiles } from "./DragTiles";
import type { CourseItem } from "../../api/courses";

interface LocationState {
  items?: CourseItem[];
  index?: number;
  courseSlug?: string;
}

const gradeLabel: Record<string, string> = {
  green: "🟢 완벽해요!",
  yellow: "🟡 조금 더!",
  red: "🔴 다시 해보세요",
  none: "",
};

export function MemorizePage() {
  useParams<{ itemId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as LocationState;
  const items = state.items;
  const index = state.index ?? 0;
  const courseSlug = state.courseSlug;
  const item = items?.[index];

  if (!items || !item) {
    return (
      <div className="page-center">
        <div className="card">
          <p className="error-msg">절 정보가 없습니다.</p>
          <button className="btn-primary" onClick={() => navigate("/courses")}>
            코스로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <MemorizeContent
      key={item.course_item_id}
      items={items}
      index={index}
      courseSlug={courseSlug}
    />
  );
}

function MemorizeContent({
  items,
  index,
  courseSlug,
}: {
  items: CourseItem[];
  index: number;
  courseSlug?: string;
}) {
  const navigate = useNavigate();
  const item = items[index];
  const isLast = index >= items.length - 1;
  const {
    phase, mode, tiles, placed, typed, liveGrade, submitting, serverGrade, mismatch,
    setMode, tapTile, setTyped, startRecall, submit, reset,
  } = useMemorize(item.course_item_id, item.text);

  return (
    <div className="page memorize-page">
      <header className="page-header">
        <button
          className="btn-link"
          onClick={() =>
            courseSlug ? navigate(`/courses/${courseSlug}`) : navigate("/courses")
          }
        >
          ← 뒤로
        </button>
        <div className="lesson-progress">
          <span style={{ width: `${(index / items.length) * 100}%` }} />
        </div>
        <span className="item-ref">{item.topic}</span>
      </header>

      <main className="memorize-main">
        {phase === "study" && (
          <div className="study-phase">
            <div className="verse-box">
              <p className="verse-text">{item.text}</p>
            </div>
            <div className="mode-toggle">
              <button
                className={mode === "drag" ? "mode-btn mode-active" : "mode-btn"}
                onClick={() => setMode("drag")}
              >
                타일 탭
              </button>
              <button
                className={mode === "type" ? "mode-btn mode-active" : "mode-btn"}
                onClick={() => setMode("type")}
              >
                직접 입력
              </button>
            </div>
            <button className="btn-primary" onClick={startRecall}>
              암송 시작
            </button>
          </div>
        )}

        {phase === "recall" && (
          <div className="recall-phase">
            <div className="verse-box verse-hidden">
              <p className="muted">
                {mode === "drag"
                  ? "절을 기억해서 아래에 배치하세요"
                  : "절을 기억해서 직접 입력하세요"}
              </p>
            </div>
            {mode === "drag" ? (
              <DragTiles
                placed={placed}
                pool={tiles}
                liveGrade={liveGrade}
                onTap={tapTile}
              />
            ) : (
              <textarea
                className={`type-input grade-border-${liveGrade}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="절을 입력하세요"
                rows={4}
                autoFocus
              />
            )}
            <button
              className="btn-primary"
              onClick={submit}
              disabled={
                submitting ||
                (mode === "drag" ? placed.length === 0 : typed.trim() === "")
              }
            >
              {submitting ? "제출 중..." : "제출"}
            </button>
          </div>
        )}

        {phase === "result" && (
          <div className="result-phase">
            <div className={`result-badge grade-${serverGrade}`}>
              {gradeLabel[serverGrade ?? "none"]}
            </div>
            {isLast && serverGrade === "green" && (
              <p className="course-complete">🎉 코스 완료!</p>
            )}
            {mismatch && (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                서버 채점으로 확정됐어요
              </p>
            )}
            <div className="verse-box">
              <p className="verse-text">{item.text}</p>
            </div>
            <div className="result-actions">
              {serverGrade === "green" ? (
                <>
                  <button className="btn-secondary" onClick={reset}>
                    다시 시도
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (isLast) {
                        navigate(courseSlug ? `/courses/${courseSlug}` : "/courses");
                      } else {
                        const next = items[index + 1];
                        navigate(`/memorize/${next.course_item_id}`, {
                          state: { items, index: index + 1, courseSlug },
                        });
                      }
                    }}
                  >
                    {isLast ? "코스로 돌아가기" : "다음으로"}
                  </button>
                </>
              ) : (
                <button className="btn-primary" onClick={reset}>
                  다시하기
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

# verse-web

Pixel KJV 앱의 React 웹 클라이언트. 백엔드(verse-backend)의 REST API를 소비한다.

## 시작하기

```bash
npm install
npm run dev       # http://localhost:5173
                  # /v1/* 요청은 Vite 프록시 → localhost:8080
```

백엔드가 먼저 동작하고 있어야 한다. 루트 [`README.md`](../README.md) 참고.

## 기술 스택

- React 18 + TypeScript (strict) + Vite 5
- react-router-dom v6
- 상태 관리: React Context (AuthContext)
- HTTP: 네이티브 `fetch` 래퍼 (`src/api/client.ts`)
- 스타일: 순수 CSS (`src/styles/global.css`)

## 디렉토리

```
src/
├── api/
│   ├── client.ts        JWT 자동 주입, 에러 표준화, 401 → /login 리다이렉트
│   ├── auth.ts          POST /v1/auth/login|signup
│   ├── courses.ts       GET /v1/courses, /v1/courses/{slug}
│   └── attempts.ts      POST /v1/attempts
├── grading/
│   ├── normalize.ts     ★ 입력 정규화 — 백엔드 Normalize와 동일
│   └── grade.ts         ★ LCS 채점 — 백엔드 GradeRecall과 동일
├── store/
│   ├── AuthContext.tsx  로그인 상태 (token + user) + localStorage 보존
│   └── authStore.ts     localStorage 키 상수
├── hooks/
│   └── useAuth.ts       AuthContext 접근 훅
├── features/
│   ├── auth/
│   │   └── LoginPage.tsx          로그인 / 회원가입 폼
│   ├── courses/
│   │   ├── CourseListPage.tsx     코스 목록
│   │   └── CourseDetailPage.tsx   절 목록 (코스 상세)
│   └── memorize/
│       ├── MemorizePage.tsx       암송 챌린지 루프 화면
│       ├── useMemorize.ts         게임 상태 훅 (학습→암송→결과)
│       └── DragTiles.tsx          단어 타일 UI (탭 배치 방식)
├── components/
│   ├── pixel/  PixelButton, PixelPanel  (후속 테마용 셸)
│   └── lamb/   Lamb 마스코트 (후속)
├── styles/
│   └── global.css       다크 테마, 색 등급 변수, 레이아웃
└── App.tsx              라우팅 + RequireAuth 가드
```

## 라우팅

| 경로 | 화면 | 인증 필요 |
|------|------|----------|
| `/login` | 로그인·회원가입 | — |
| `/courses` | 코스 목록 | ✅ |
| `/courses/:slug` | 코스 상세 + 절 목록 | ✅ |
| `/memorize/:itemId` | 암송 챌린지 | ✅ |
| `*` | 인증 상태에 따라 `/courses` 또는 `/login` 리다이렉트 | — |

비로그인 상태로 보호 경로 접근 시 `/login`으로 리다이렉트.

## 암송 게임 루프 (`useMemorize`)

```
[학습] 절 원문 표시
    ↓ "암송 시작" 버튼
[암송] 타일 탭 → 답안열 배치 / 답안열 탭 → 풀로 복귀
       배치할 때마다 liveGrade 실시간 갱신 (green/yellow/red)
    ↓ "제출" 버튼
POST /v1/attempts {course_item_id, mode:"drag", client_grade, tokens}
    ↓
[결과] server_grade 표시 (불일치 시 서버 값 우선)
       다시 시도 | 다음으로
```

타일 풀 = 정답 토큰 셔플 + distractor 0~2개.

## ★ 채점 규칙 미러링

`src/grading/normalize.ts`, `src/grading/grade.ts`는 백엔드 `internal/service/grading.go`와 **동일한 로직**을 구현한다. 어긋나면 클라이언트 채점과 서버 채점이 불일치해 사용자 신뢰가 깨진다.

한쪽을 변경하면 반드시 양쪽 동기화. 명세 근거: [`verse-backend/docs/adr/0002-client-grade-server-verify.md`](../verse-backend/docs/adr/0002-client-grade-server-verify.md)

## 빌드

```bash
npm run build     # tsc (strict) + vite build → dist/
```

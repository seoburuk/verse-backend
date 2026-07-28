# Google Play "데이터 보안(Data safety)" 설문 작성 내역

> 대상: Play Console → PIXBIBLE(com.pixbible.verse) → 정책 및 프로그램 → 앱 콘텐츠 → 데이터 보안
> 작성일: 2026-07-17. **아직 "저장" 버튼을 누르지 않은 임시 상태** — 아래 값을 검토 후 Play Console에서 직접 저장(게시)할 것.

## 1단계 — 데이터 수집 및 보안

- 필수 사용자 데이터 유형 수집/공유: **예**
- 전송 시 암호화: **예** (HTTPS만 사용)
- 계정 생성 방법: **"사용자 이름, 비밀번호, 기타 인증"** + **"OAuth"** 체크
  (자체 회원가입 `/auth/signup`+`/auth/login`, 비밀번호 재설정, Google/Apple 로그인 모두 지원 — `verse-backend/internal/handler/router.go` 참고)
- 계정 삭제 URL: `https://pixbible.cloud/account-deletion`
- "계정 삭제 없이 일부 데이터만 삭제 요청 가능?" (선택): **아니요**
  (근거: [account-deletion/page.tsx](../verse-web-next/app/[locale]/account-deletion/page.tsx) 4번 항목 — 부분 삭제 기능 미제공, 전체 계정 삭제만 지원)

## 3단계 — 데이터 유형별 상세

### 개인 정보 — 이름
- 수집됨 (공유 안 함)
- 임시 처리 아님(영구 저장)
- 필수(중지 불가)
- 목적: 앱 기능
- 근거: `verse-backend/internal/service/auth_service.go` — `displayName`을 회원가입/구글 로그인 시 저장

### 개인 정보 — 이메일 주소
- 수집됨 (공유 안 함)
- 임시 처리 아님
- 필수
- 목적: 앱 기능, 개발자 커뮤니케이션 (비밀번호 재설정 메일 등)

### 개인 정보 — 사용자 ID
- 수집됨 (공유 안 함)
- 임시 처리 아님
- 필수
- 목적: 앱 기능
- 근거: `users` 테이블 고유 ID, `google_sub`. 로그인 후 access_token으로 식별.

### 기기 또는 기타 ID (광고 ID)
- 수집됨 + **공유됨** (AdMob/Google 광고 네트워크)
- 임시 처리 아님
- **사용자가 수집 여부 선택 가능** (Android 설정에서 광고 ID 재설정/제한 가능)
- 수집 목적: 앱 기능, 광고 또는 마케팅
- 공유 목적: 광고 또는 마케팅
- 전제: **사용자가 "이번 출시 버전에 AdMob 광고 포함"이라고 확인함.**
  단, `verse-flutter/lib/core/ads/ads_service.dart`의 광고 유닛 ID가 아직 Google 테스트 ID인지 확인 필요
  ([privacy-and-ads.md](privacy-and-ads.md) "출시 전 AdMob 테스트 ID → 실제 ID 교체" 항목과 연동).

## 4~5단계

- "데이터 취급 및 처리" 단계는 추가 질문 없이 자동 통과.
- 5단계 미리보기에서 아래 내용 확인됨:
  - 공유되는 데이터: 기기 또는 기타 ID (광고 목적)
  - 계정 삭제 링크: `https://pixbible.cloud/account-deletion`
  - "개발자가 데이터 삭제 요청 방법을 제공하지 않음" 표시 (부분 삭제 미지원과 일치 — 정상)
  - 전송 중 데이터 암호화됨 표시
  - 개인정보처리방침: `https://www.pixbible.cloud/en/privacy`

## 남은 작업

- [ ] Play Console에서 위 내용 재확인 후 "저장" 클릭 (아직 미저장 — Google 검토용으로 전송 안 됨)
- [ ] AdMob 실제 광고 유닛 ID로 교체 여부 확인 후 광고 관련 답변이 여전히 맞는지 재검토
- [ ] iOS App Store Connect의 "App Privacy" 라벨도 동일 기준으로 별도 작성 필요 ([appstore-security-privacy-checklist.md](../verse-flutter/docs/appstore-security-privacy-checklist.md) 참고)

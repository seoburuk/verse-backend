# SEO 수정 배포 절차 (NCP 프로덕션)

배경: 프로덕션 canonical/사이트맵/robots가 플레이스홀더 도메인 `pixbible.example`을
가리키고 있어 검색엔진 색인이 사실상 차단된 상태였다. 코드에서 폴백을
`https://www.pixbible.cloud`로 교정했으므로 **재빌드·재시작만 해도 해결**되지만,
아래 절차대로 환경변수와 nginx까지 정리하는 것을 권장한다.

## 1. 앱 재배포

```bash
ssh <NCP 서버>
cd <verse-web-next 경로>
git pull

# 환경변수 명시 (폴백이 있어 없어도 동작하지만 명시 권장)
# .env.local 또는 실행 환경에:
echo 'NEXT_PUBLIC_SITE_URL=https://www.pixbible.cloud' >> .env.local

npm run build
# 기존 npm start 프로세스 재시작 (reference_ncp_deploy 절차 참고)
```

## 2. nginx에 X-Forwarded-Proto 추가

next-intl이 hreflang Link 헤더를 `http://`로 생성하는 문제 교정.
`/etc/nginx/sites-available/pixbible.cloud`의 `location /` 블록에 추가:

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

```bash
nginx -t && systemctl reload nginx
```

## 3. 배포 검증

```bash
curl -s https://www.pixbible.cloud/ | grep -o '<link rel="canonical"[^>]*>'
#   → href="https://www.pixbible.cloud" 이어야 함 (pixbible.example이면 실패)
curl -s https://www.pixbible.cloud/robots.txt | grep Sitemap
#   → https://www.pixbible.cloud/sitemap.xml
curl -s https://www.pixbible.cloud/sitemap.xml | grep -c pixbible.cloud   # 0이 아니어야 함
curl -sI https://www.pixbible.cloud/ | grep -i '^link'                    # hreflang이 https 인지
curl -s https://www.pixbible.cloud/courses/lords-prayer | grep -o 'sections/[0-9]*' | head -1
#   위에서 나온 섹션 URL을 열어 구절 전문이 HTML에 있는지:
# curl -s https://www.pixbible.cloud/courses/lords-prayer/sections/<id> | grep "Our Father"
```

## 4. 검색엔진 재크롤 요청 (중요 — 이걸 해야 반영이 빨라짐)

1. **Google Search Console** (소유확인 메타태그 이미 적용됨)
   - Sitemaps → `https://www.pixbible.cloud/sitemap.xml` 제출
   - URL 검사 → 홈·/courses·주요 코스 URL 각각 "색인 생성 요청"
2. **네이버 서치어드바이저** (소유확인 메타태그 이미 적용됨)
   - 요청 → 사이트맵 제출 → `https://www.pixbible.cloud/sitemap.xml`
   - 웹 페이지 수집 요청으로 주요 URL 등록

색인 반영은 보통 며칠~2주. Search Console 커버리지 리포트에서
"색인 생성됨" 페이지 수가 늘어나는지 1~2주 간격으로 확인할 것.

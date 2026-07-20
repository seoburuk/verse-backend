# 구독(광고 제거) 구현 계획

작성일: 2026-07-19
배경: 웹(verse-web-next)과 Flutter 앱(verse-flutter)을 동시에 구독 대상으로 붙일 계획. 첫 유료 기능은 광고 제거.

## 방향 결정

- **RevenueCat만 사용, Superwall은 도입하지 않는다.** Superwall은 페이월 UI A/B테스트 도구로, 광고 제거라는 단일 이진(binary) 기능에는 오버엔지니어링. 전환율이 실제 병목이 될 때 재검토.
- **웹/앱 클라이언트가 RevenueCat SDK를 직접 신뢰하지 않는다.** 대신 RevenueCat → verse-backend webhook → `users` 테이블 플래그를 진실의 원천으로 삼는다. 웹 결제(Stripe 기반 RevenueCat Web Billing)와 앱 인앱결제(StoreKit/Play Billing)가 완전히 다른 파이프라인이라, 각 플랫폼이 각자 SDK로 구독 여부를 판단하면 싱크 버그(한쪽에서 결제했는데 다른 쪽엔 반영 안 됨)가 반드시 발생한다.

## 아키텍처

```
[Flutter 앱] ──purchases_flutter SDK──┐
                                        ├──> RevenueCat ──webhook──> [verse-backend]
[웹] ──RevenueCat Web Billing(Stripe)──┘                                   │
                                                                       users.is_ad_free
                                                                              │
[Flutter 앱] ──GET /me──────────────────────────────────────────────────────┤
[웹] ──GET /me──────────────────────────────────────────────────────────────┘
```

- `app_user_id`는 RevenueCat 고객 식별자를 기존 로그인 시스템의 user id로 고정한다. 구글/애플 로그인으로 이미 계정이 통합돼 있으므로, 웹에서 결제하든 앱에서 결제하든 같은 RevenueCat 고객으로 묶인다.
- 엔타이틀먼트는 처음부터 `premium` 같은 단일 boolean 성격으로 설계한다. 지금은 기능이 광고 제거 하나뿐이지만, 나중에 스킨·무제한 목숨 등이 추가돼도 같은 플래그를 재사용할 수 있게 한다.
- 상품(월간/연간/프로모션) 확장은 RevenueCat 대시보드에서만 조정하고, 백엔드 스키마·API 계약은 바뀌지 않는 것을 목표로 한다.

## 작업 순서

### 1. RevenueCat 프로젝트 설정
- [ ] RevenueCat 프로젝트 생성
- [ ] iOS 앱 연결 (App Store Connect 인앱결제 상품 등록 선행 필요)
- [ ] Android 앱 연결 (Play Console 구독 상품 등록 선행 필요)
- [ ] Web 앱 연결 (RevenueCat Web Billing, 내부적으로 Stripe)
- [ ] 엔타이틀먼트 `premium` 정의, 각 플랫폼 상품을 여기에 매핑

### 2. 백엔드 (verse-backend)
- [ ] `users` 테이블에 `is_ad_free` (또는 `is_premium`) 컬럼 마이그레이션 추가
- [ ] RevenueCat webhook 수신 엔드포인트 구현 (구독 시작/갱신/취소/만료 이벤트 처리)
- [ ] webhook payload의 `app_user_id`로 자사 user id 매칭 후 플래그 갱신
- [ ] webhook 인증(서명 검증) 처리
- [ ] 기존 `/me` 류 API 응답에 `is_ad_free` 필드 추가

### 3. Flutter 앱
- [ ] `purchases_flutter` SDK 연동
- [ ] 로그인 시점에 RevenueCat `app_user_id`를 자사 user id로 설정(`logIn`)
- [ ] 구매 플로우 UI(구독 옵션 화면, 구매 버튼)
- [ ] `/me` 응답의 `is_ad_free`를 보고 광고 표시 여부 분기

### 4. 웹 (verse-web-next)
- [ ] RevenueCat Web Billing 연동 (Stripe 결제 플로우)
- [ ] 로그인 시점에 동일하게 `app_user_id` 설정
- [ ] 구매 플로우 UI
- [ ] `/me` 응답의 `is_ad_free`로 광고 표시 여부 분기

### 5. 검증
- [ ] 웹에서 구독 → 앱에서 광고 사라짐 확인
- [ ] 앱에서 구독 → 웹에서 광고 사라짐 확인
- [ ] 구독 취소/만료 시 양쪽 다 반영되는지 확인 (webhook 지연 고려)

## 비범위 (이번 계획에서 제외)

- Superwall 등 페이월 UI A/B테스트 도구 도입
- 광고 제거 외 추가 유료 기능(스킨, 무제한 목숨, 프리미엄 코스 등) — 기능이 정해지면 별도 계획으로 다룸
- 프로모션 코드, 무료 체험 기간 등 세부 가격 정책

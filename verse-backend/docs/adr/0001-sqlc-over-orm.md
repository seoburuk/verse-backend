# ADR 0001: ORM 대신 sqlc

## 상태
채택

## 맥락
Go에서 DB 접근 방식 선택. 후보: GORM(ORM), database/sql 직접, sqlc.

## 결정
sqlc 채택. db/queries에 SQL을 직접 작성하고 타입 안전 Go를 생성.

## 근거
- ORM은 쿼리를 숨긴다 → 실제 SQL을 안 보게 되고 N+1 등 성능 함정이 가려진다.
- sqlc는 SQL을 1급으로 다루며 컴파일 타임에 검증한다 → "DB를 이해한다" 시그널.
- 학습 가치: SQL 실력이 직접 드러난다.

## 트레이드오프
- 동적 쿼리(조건부 WHERE)는 sqlc가 약하다. 필요 시 일부만 손쓰기.

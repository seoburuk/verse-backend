// recover.go — panic 복구 미들웨어. 핸들러에서 panic이 나도 프로세스가 죽지 않고
// 500을 반환하게 한다. net/http 기본 동작에 의존하지 않고 명시적으로 처리.
package middleware

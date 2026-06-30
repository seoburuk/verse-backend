# 멀티스테이지 빌드: 빌드 환경과 실행 환경을 분리해 최종 이미지를 작게.
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN go build -o /bin/api ./cmd/api

FROM alpine:latest
COPY --from=build /bin/api /bin/api
EXPOSE 8080
ENTRYPOINT ["/bin/api"]

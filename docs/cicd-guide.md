# CI/CD 학습 문서 — PIX BIBLE 사례로 이해하기

작성일: 2026-07-04

이 문서는 일반적인 CI/CD 개념 설명 + 이 프로젝트에서 실제로 겪은 수동 배포 경험을 연결해서, "왜 CI/CD가 필요한가"를 체감하도록 정리한 학습 자료다.

---

## 1. CI/CD가 뭔가

| 용어 | 뜻 | 이 프로젝트에서 |
|------|-----|----------------|
| **CI** (Continuous Integration) | 코드를 merge/push할 때마다 자동으로 빌드·테스트해서 "이 코드가 최소한 깨지지 않았다"를 검증 | `.github/workflows/ci.yml` — push/PR마다 Go 테스트 + Vitest 실행 |
| **CD** (Continuous Delivery) | 테스트 통과한 코드를 언제든 배포 가능한 상태(아티팩트/이미지)로 자동 준비 | **없음** — 이번에 사람이 수동으로 함 |
| **CD** (Continuous Deployment) | Delivery에서 한 단계 더 나아가, 통과하면 **자동으로 운영 서버까지 반영** | **없음** |

세 개를 묶어 "CI/CD 파이프라인"이라 부르고, 코드가 git에 들어간 순간부터 사용자가 실제로 그 변경을 쓸 수 있게 되기까지의 전체 자동화된 길을 뜻한다.

---

## 2. 우리가 방금 한 "수동 CD"의 전체 과정

암송 화면 이펙트 기능을 만들고 나서 실제로 사이트에 반영하기까지 거친 단계:

```
1. 로컬에서 코드 수정
2. git commit + push (main)                    ← 여기까지가 CI 영역, 실제로 여기서 테스트 자동 실행됨
3. 사람이 SSH로 서버 접속                        ← 이하 전부 수동(=CD 부재)
4. 서버에서 git pull
5. cd verse-web-next && npm run build           (155개 페이지 재생성, 수 분 소요)
6. 기존 next start 프로세스를 찾아서 kill
7. nohup으로 새 프로세스 재실행
8. curl로 새 CSS 번들에 새 클래스가 들어갔는지 확인
```

이 과정에서 실제로 발생한 문제들 — 전부 "CD가 없어서" 생긴 비용이다.

### 문제 1: 인증 수단이 사람 손에 의존
- 처음엔 비밀번호를 대화로 주고받아야 했음 → 자동화 스크립트에 평문 비밀번호를 넣으려다 보안 정책에 막힘
- SSH 키를 새로 만들고, `ssh-copy-id`, passphrase 유무 확인까지 왕복 대화가 여러 번 필요했음
- **CI/CD였다면**: 배포 자격증명은 GitHub Actions의 **Secrets**(`SSH_PRIVATE_KEY` 등)에 미리 등록해두고, 파이프라인이 실행될 때만 메모리에 로드되어 로그에도 안 남는다. 사람이 매번 비밀번호를 입력할 필요가 없다.

### 문제 2: 배포 스텝을 사람이 순서대로 기억해야 함
- pull → build → kill → restart → 확인, 이 순서를 안 틀리고 매번 손으로 실행
- 실제로 `pkill -f 'next start'`를 돌렸다가 SSH 세션 자체가 끊기는 사고가 있었음 (의도한 프로세스 wrapper만 죽었어야 했는데, 세션과 얽혀 있었음)
- **CI/CD였다면**: 이 순서는 딱 한 번 스크립트로 작성해두면 항상 똑같이, 사람 실수 없이 반복 실행된다.

### 문제 3: 다운타임 발생
- 프로세스를 죽인 시점부터 새 프로세스가 포트를 열 때까지 사이트가 응답하지 않는 구간이 있었음 (수 초~수십 초)
- **CI/CD(제대로 된)였다면**: 새 버전을 먼저 띄우고 헬스체크 통과 후에 트래픽을 넘기는 **무중단 배포**(blue-green, rolling)를 쓴다.

### 문제 4: 프로세스 관리가 안 됨 (`nohup`)
- 지금은 `nohup npm start &`로 띄워놓은 것뿐이라, 서버가 재부팅되거나 프로세스가 죽으면 **아무도 자동으로 다시 안 살림**
- 로그도 `nohup.out`에 계속 쌓이기만 하고 로테이션이 없음
- **개선 방향**: `systemd` 서비스나 `pm2` 같은 프로세스 매니저로 등록 → 크래시 시 자동 재시작, 부팅 시 자동 시작, 로그 관리까지 됨

### 문제 5: 롤백 수단이 없음
- 만약 배포한 코드에 버그가 있으면? 지금 구조에선 사람이 다시 SSH 들어가서 `git checkout <이전 커밋>` → 재빌드 → 재시작을 또 손으로 해야 함
- **CI/CD였다면**: 실패 감지 시 이전 아티팩트로 자동/원클릭 롤백이 가능하도록 설계한다 (예: 이전 빌드 결과물을 N개 보관).

---

## 3. 지금 이 저장소의 CI는 정확히 뭘 하고 있나

`.github/workflows/ci.yml` 실제 내용:

```yaml
on:
  push:
    branches: [main, light-theme-fix]
  pull_request:
    branches: [main]

jobs:
  backend:   # verse-backend에서 go test ./...
  frontend:  # verse-web에서 npm test (Vitest)
```

**중요한 빈틈**: `frontend` job이 `verse-web`(구 프론트) 디렉터리를 테스트하고 있고, 실제로 배포되는 `verse-web-next`는 CI 대상이 아니다. 즉 지금 우리가 계속 작업 중인 프론트엔드는 **push해도 아무 자동 검증이 안 되는 상태**다. 이건 이 프로젝트가 다음 CI/CD 개선에서 가장 먼저 고쳐야 할 부분이다.

---

## 4. 이 프로젝트에 맞는 CD 파이프라인 설계 (제안)

인프라가 단일 VPS(nginx도 없이 Next.js가 직접 3000번 포트 서빙, Go API가 8080번)이므로 Kubernetes 같은 무거운 도구는 과함. 실용적인 목표:

```
main에 push
  → GitHub Actions 트리거
  → (1) 테스트 (기존 ci.yml 역할, verse-web-next 포함하도록 수정)
  → (2) 테스트 통과 시에만 SSH로 서버 접속
  → (3) 서버에서 git pull, npm ci, npm run build
  → (4) systemd 서비스 재시작 (restart, 자동 헬스체크 포함)
  → (5) 실패 시 워크플로 자체가 빨간불 → 알림
```

### 핵심 GitHub Actions 개념

| 개념 | 설명 |
|------|------|
| **Workflow** | `.github/workflows/*.yml` 파일 하나 = 하나의 자동화 정의 |
| **Job** | 워크플로 안의 독립 실행 단위 (병렬 실행 가능, 예: backend/frontend) |
| **Step** | Job 안의 순차 실행 명령 |
| **Runner** | 실제로 코드를 실행하는 컴퓨터 (GitHub 호스팅 `ubuntu-latest` 등) |
| **Secrets** | `Settings → Secrets and variables → Actions`에 등록, 워크플로에서 `${{ secrets.NAME }}`으로만 참조 가능, 로그에 노출 안 됨 |
| **Artifact** | Job 간에 전달할 빌드 산출물 (예: build job에서 만든 `.next`를 deploy job에서 사용) |

### 예시 워크플로 (개념 스케치, 실제 도입 시 다듬어야 함)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    # 기존 ci.yml 확장 — verse-web-next도 포함
    ...

  deploy:
    needs: test              # 테스트 통과해야만 배포 job 실행
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: root
          key: ${{ secrets.DEPLOY_SSH_KEY }}     # passphrase 없는 전용 키
          script: |
            cd /root/verse-backend
            git pull origin main
            cd verse-web-next
            npm ci
            npm run build
            systemctl restart verse-web-next     # nohup 대신 systemd
```

### 서버 쪽 개선: systemd로 전환

지금은 `nohup npm start &`라서 재부팅/크래시에 취약하다. systemd unit 파일 예시:

```ini
# /etc/systemd/system/verse-web-next.service
[Unit]
Description=PIX BIBLE frontend
After=network.target

[Service]
WorkingDirectory=/root/verse-backend/verse-web-next
ExecStart=/usr/bin/npm start
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target
```

이렇게 등록하면:
- `systemctl restart verse-web-next` 한 줄로 안전하게 재시작 (SSH 세션과 얽혀서 죽는 사고 방지)
- 크래시 시 자동 재시작(`Restart=on-failure`)
- 서버 재부팅 시 자동 기동
- `journalctl -u verse-web-next`로 로그 조회 (nohup.out처럼 무한정 쌓이지 않음)

---

## 5. 배포 자격증명을 안전하게 다루는 법 (이번에 겪은 것)

이번 세션에서 실제로 겪은 순서:
1. 비밀번호를 대화창에 직접 입력 → 자동화 도구가 "평문 비밀번호 노출" 위험으로 차단
2. 패스프레이즈 있는 기존 키 시도 → 자동화 불가 (사람이 매번 입력해야 함)
3. **패스프레이즈 없는 전용 배포 키**를 새로 만들어 `authorized_keys`에 등록 → 이후 자동화 가능

이게 실무에서도 정확히 쓰는 패턴이다:

- 배포 전용 키는 **패스프레이즈 없이** 만들되, 그 키로는 **딱 배포에 필요한 권한만** 주는 게 이상적 (예: 특정 명령만 실행 가능하도록 `authorized_keys`에 `command=` 옵션 지정, 또는 배포 전용 계정 분리)
- 그 개인키는 GitHub Secrets에만 저장하고 로컬 디스크에는 오래 두지 않는 것이 좋음
- 절대 하면 안 되는 것: 비밀번호나 개인키를 커밋, 로그, 채팅 텍스트에 평문으로 남기기 — 이번에 자동화 도구가 여러 번 막았던 것도 이 원칙 때문

---

## 6. 용어 정리 (한눈에)

| 용어 | 한 줄 설명 |
|------|-----------|
| Pipeline | CI/CD 전체 자동화 흐름 |
| Zero-downtime deploy | 배포 중에도 서비스가 끊기지 않는 방식 (새 버전을 띄우고 헬스체크 후 트래픽 전환) |
| Rollback | 문제 생긴 배포를 이전 정상 버전으로 되돌리는 것 |
| Health check | "이 서버 인스턴스가 정상 응답하는가"를 자동으로 확인하는 절차 (예: `/health` 엔드포인트 200 확인) |
| Idempotency | 같은 배포 스크립트를 여러 번 실행해도 결과가 같아야 한다는 원칙 (재실행해도 안전) |
| Blue-Green 배포 | 구버전(Blue)과 신버전(Green)을 동시에 띄워두고 트래픽만 전환 — 롤백이 트래픽 스위치 한 번으로 즉시 가능 |
| Canary 배포 | 신버전을 일부 트래픽에만 먼저 노출해서 문제 조기 발견 |
| Secrets management | 비밀번호/키를 코드와 분리해서 안전하게 주입하는 체계 |

---

## 7. 이 프로젝트에 바로 적용하면 좋을 순서 (우선순위)

1. **`ci.yml`이 `verse-web-next`를 테스트하도록 수정** — 지금 실제 배포되는 코드가 CI 사각지대라 가장 시급
2. **서버 프로세스를 systemd로 전환** — `nohup` 제거, 재시작/재부팅 안정성 확보
3. **배포 전용 SSH 키를 GitHub Secrets에 등록하고 `appleboy/ssh-action`으로 자동 배포 워크플로 추가**
4. (선택) 배포 후 `curl`로 헬스체크 → 실패 시 워크플로 실패 처리
5. (선택, 트래픽이 늘면) nginx를 앞단에 두고 blue-green으로 무중단 전환

---

## 8. 설계 원칙

- **작게 시작**: 이 프로젝트 규모에 Kubernetes/Docker Swarm은 과함. GitHub Actions + SSH + systemd 조합으로 충분
- **비밀은 항상 분리**: 코드·로그·채팅 어디에도 평문 자격증명이 남지 않게
- **사람이 하던 일을 그대로 스크립트로 옮기는 것부터 시작**: 이번에 손으로 한 pull→build→restart 순서가 곧 첫 배포 스크립트의 초안이다
- **테스트가 배포의 문지기**: 테스트 실패 시 배포 job이 아예 실행되지 않도록 `needs:`로 의존관계를 건다

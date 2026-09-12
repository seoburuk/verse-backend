FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG INTERNAL_API_URL=http://localhost:8080
ENV INTERNAL_API_URL=$INTERNAL_API_URL
RUN npm run build

# next.config.js에 output:"standalone"을 두지 않는다 — 실제 배포는 `npm start`로
# 띄우는데(docs/cicd-guide.md) standalone 출력은 `next start`와 함께 쓸 수 없다.
# 따라서 빌드 결과를 그대로 들고 가서 같은 방식으로 실행한다.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/messages ./messages
EXPOSE 3000
CMD ["npm", "start"]

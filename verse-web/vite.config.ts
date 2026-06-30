// Vite 설정. CRA 대신 Vite를 쓰는 이유: 빠른 HMR, 가벼운 설정, 활발한 유지보수.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 개발 중 /v1 요청을 Go 백엔드로 프록시 → CORS 설정 없이 로컬 연동
      "/v1": "http://localhost:8080",
    },
  },
});

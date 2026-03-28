import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Order matters! Longer prefixes must come first to avoid
      // /api-deep-agents matching /api-deep-agents-showcase requests.

      // Deep Agents Showcase (port 3004) — MUST be before /api-deep-agents
      "/api-deep-agents-showcase": {
        target: "http://localhost:3004",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-deep-agents-showcase/, "/api"),
      },
      // LangChain createAgent backend (port 3002)
      "/api-langchain-agents": {
        target: "http://localhost:3002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-langchain-agents/, "/api"),
      },
      // Deep Agents backend (port 3003)
      "/api-deep-agents": {
        target: "http://localhost:3003",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-deep-agents/, "/api"),
      },
      // LangGraph.js backend (port 3001)
      "/api-langgraph": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-langgraph/, "/api"),
      },
    },
  },
});

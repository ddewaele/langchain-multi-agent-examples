import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // LangGraph.js backend (port 3001)
      "/api-langgraph": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-langgraph/, "/api"),
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
    },
  },
});

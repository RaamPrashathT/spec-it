import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The production build (ui/dist) is what the Node server serves; the React source is not shipped.
// `npm run dev` here proxies API, file and WebSocket calls to a running `spec-it-app` (default port 4317).
const target = process.env.SPECIT_SERVER ?? "http://127.0.0.1:4317"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900, // one local bundle; no network cost
  },
  server: {
    proxy: {
      "/api": target,
      "/files": target,
      "/ws": { target: target.replace(/^http/, "ws"), ws: true },
    },
  },
})

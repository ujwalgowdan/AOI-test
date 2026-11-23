import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";

const BACKEND = process.env.VITE_BACKEND_URL ?? "http://localhost:8000";

// Set VITE_DEV_HTTPS=0 to disable the self-signed cert (e.g. when running
// behind a reverse proxy that terminates TLS for you).
const HTTPS = process.env.VITE_DEV_HTTPS !== "0";

export default defineConfig({
  // basicSsl generates a self-signed cert and serves the dev server over
  // HTTPS so remote browsers (e.g. http://192.168.1.10:5173) can call
  // getUserMedia — Chromium and Firefox refuse camera access on a
  // non-loopback, non-secure origin. Localhost is always exempt.
  plugins: [react(), ...(HTTPS ? [basicSsl()] : [])],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Force filesystem polling when running inside a Docker container.
    // Native fs events from a Windows host don't propagate through the
    // WSL2 bind mount, so chokidar misses file changes and the served
    // bundle goes stale. Polling costs a couple % CPU and is the only
    // reliable way to pick up host edits on Docker Desktop / Windows.
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/ws":  { target: BACKEND, changeOrigin: true, ws: true },
      "/healthz": { target: BACKEND, changeOrigin: true },
    },
  },
});

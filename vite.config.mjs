// The React app lives in web/ and builds into public/app, which server.js
// already serves as static files: no routing change on the server.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, "web"),
  base: "/app/",
  plugins: [react()],
  resolve: {
    // The session adapter in public/session/ imports LiveKit from esm.sh. In
    // the app it comes from the pinned npm package instead: a session start
    // does not depend on someone else's CDN, and a new LiveKit release does
    // not reach the app without us ("@2" on esm.sh is always the latest 2.x).
    alias: [{ find: "https://esm.sh/livekit-client@2", replacement: "livekit-client" }],
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
  build: {
    outDir: path.resolve(__dirname, "public/app"),
    emptyOutDir: true,
  },
});

// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "/sql-visual/",
  optimizeDeps: { exclude: ["sql.js"] },
  server: { headers: { "Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Embedder-Policy":"require-corp" } },
});

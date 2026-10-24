import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_TOY_ENABLED": JSON.stringify(
      mode === "toy" ? "true" : (process.env.VITE_TOY_ENABLED ?? "false"),
    ),
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/socket": { target: "ws://127.0.0.1:8787", ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/three/")) return "three";
        },
      },
    },
  },
}));

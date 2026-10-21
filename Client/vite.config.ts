import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

// Dynamically read services.json from project root if available
let servicesConfig: Record<string, string> = {};
let clientPort = 8005;

try {
  const servicesPath = path.resolve(__dirname, "../services.json");
  if (fs.existsSync(servicesPath)) {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    servicesConfig = JSON.parse(raw);
    if (servicesConfig.client) {
      const parsed = new URL(servicesConfig.client);
      if (parsed.port) clientPort = Number(parsed.port);
    }
  }
} catch {
  // fallback to defaults
}

if (process.env.PORT) clientPort = Number(process.env.PORT);
if (process.env.VITE_PORT) clientPort = Number(process.env.VITE_PORT);

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  define: {
    __SERVICES_CONFIG__: JSON.stringify(servicesConfig),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: clientPort,
    strictPort: true,
    host: host || false,
    fs: {
      allow: [".."],
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: clientPort + 1,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

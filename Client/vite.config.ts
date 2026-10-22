import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

let servicesConfig: Record<string, string> = {};
let clientPort: number | undefined;
let clientHost: string | undefined = process.env.TAURI_DEV_HOST || process.env.HOST;

try {
  const servicesPath = path.resolve(__dirname, "../services.json");
  if (fs.existsSync(servicesPath)) {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    servicesConfig = JSON.parse(raw);
    if (servicesConfig.client) {
      const parsed = new URL(servicesConfig.client);
      if (parsed.port) clientPort = Number(parsed.port);
      if (parsed.hostname && !clientHost) clientHost = parsed.hostname;
    }
  }
} catch {}

if (process.env.PORT) clientPort = Number(process.env.PORT);
if (process.env.VITE_PORT) clientPort = Number(process.env.VITE_PORT);

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
  clearScreen: false,
  server: {
    port: clientPort,
    strictPort: !!clientPort,
    host: clientHost || false,
    fs: {
      allow: [".."],
    },
    hmr: clientHost
      ? {
          protocol: "ws",
          host: clientHost,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));


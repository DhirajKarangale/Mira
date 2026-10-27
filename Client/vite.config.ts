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

function localTranscribePlugin() {
  const rootDir = path.resolve(__dirname, "..");
  const clientTranscribePath = path.resolve(__dirname, "src/utils/transcribe.json");
  const rootTranscribePath = path.resolve(rootDir, "utils/transcribe.json");
  const operatorTranscribePath = path.resolve(rootDir, "Operator/utils/transcribe.json");

  function saveRecord(record: { text: string; time?: string }) {
    if (!record.text || !record.text.trim()) return;
    const item = {
      text: record.text.trim(),
      time: record.time || new Date().toISOString(),
    };

    const targetPaths = [clientTranscribePath, rootTranscribePath, operatorTranscribePath];
    for (const targetPath of targetPaths) {
      try {
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        let list: any[] = [];
        if (fs.existsSync(targetPath)) {
          try {
            const content = fs.readFileSync(targetPath, "utf-8");
            list = JSON.parse(content);
            if (!Array.isArray(list)) list = [];
          } catch {
            list = [];
          }
        }
        const isDuplicate = list.some(
          (existing) => existing.text === item.text && existing.time === item.time
        );
        if (!isDuplicate) {
          list.push(item);
          fs.writeFileSync(targetPath, JSON.stringify(list, null, 2), "utf-8");
        }
      } catch (e) {
        console.error(`[Vite Transcribe Plugin] Error writing to ${targetPath}:`, e);
      }
    }
  }

  const clientKeysPath = path.resolve(__dirname, "src/utils/elevenlabs_keys.json");
  const rootKeysPath = path.resolve(rootDir, "utils/elevenlabs_keys.json");

  function removeKeyFromDisk(keyToRemove: string) {
    if (!keyToRemove || !keyToRemove.trim()) return [];
    const trimmed = keyToRemove.trim();
    const targetPaths = [clientKeysPath, rootKeysPath];
    let remaining: string[] = [];

    for (const targetPath of targetPaths) {
      try {
        if (fs.existsSync(targetPath)) {
          const parsed = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((k: string) => typeof k === "string" && k.trim() !== trimmed);
            fs.writeFileSync(targetPath, JSON.stringify(filtered, null, 2), "utf-8");
            remaining = filtered;
          }
        }
      } catch (e) {
        console.error(`[Vite Key Plugin] Error removing key from ${targetPath}:`, e);
      }
    }
    return remaining;
  }

  return {
    name: "local-transcribe-plugin",
    handleHotUpdate({ file }: { file: string }) {
      if (file.includes("transcribe.json") || file.includes("elevenlabs_keys.json")) {
        // Suppress HMR and browser reloads when transcribe.json or keys are written
        return [];
      }
    },
    configureServer(server: any) {
      server.middlewares.use("/api/remove-elevenlabs-key", (req: any, res: any) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk: any) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              const key = data.key;
              const remaining = removeKeyFromDisk(key);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ status: "success", removed: key, remainingCount: remaining.length, remaining }));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ status: "error", message: err.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end();
        }
      });

      server.middlewares.use("/api/get-elevenlabs-keys", (_req: any, res: any) => {
        res.setHeader("Content-Type", "application/json");
        try {
          if (fs.existsSync(clientKeysPath)) {
            const parsed = JSON.parse(fs.readFileSync(clientKeysPath, "utf-8"));
            if (Array.isArray(parsed)) {
              return res.end(JSON.stringify(parsed));
            }
          }
        } catch {}
        res.end("[]");
      });

      server.middlewares.use("/api/save-transcribe", (req: any, res: any) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk: any) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              saveRecord(data);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ status: "success", saved: data }));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ status: "error", message: err.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end();
        }
      });

      server.middlewares.use("/api/get-transcribe", (_req: any, res: any) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");

        try {
          let list: any[] = [];
          const readList = (p: string) => {
            if (fs.existsSync(p)) {
              try {
                const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
                if (Array.isArray(parsed)) return parsed;
              } catch {}
            }
            return [];
          };

          const clientList = readList(clientTranscribePath);
          const rootList = readList(rootTranscribePath);

          // Use the file with more records or merge them
          if (clientList.length >= rootList.length && clientList.length > 0) {
            list = clientList;
          } else if (rootList.length > 0) {
            list = rootList;
            // Sync to clientTranscribePath as well
            try {
              fs.writeFileSync(clientTranscribePath, JSON.stringify(rootList, null, 2), "utf-8");
            } catch {}
          }

          res.end(JSON.stringify(list));
        } catch {
          res.end("[]");
        }
      });
    },
  };
}

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), localTranscribePlugin()],
  define: {
    __SERVICES_CONFIG__: JSON.stringify(servicesConfig),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ["react-markdown", "remark-gfm"],
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
      ignored: [
        "**/src-tauri/**",
        "**/src/utils/transcribe.json",
        "**/utils/transcribe.json",
        "**/*transcribe.json*",
        "**/transcribe.json",
        "**/*keys.json*",
        /transcribe\.json$/,
        /keys\.json$/,
      ],
    },
  },
}));


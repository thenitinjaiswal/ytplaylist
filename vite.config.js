import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { transformSync } from "rolldown/experimental";

function jsxInJsPrePlugin() {
  return {
    name: "jsx-in-js-pre",
    enforce: "pre",
    transform(code, id) {
      const [filepath] = id.split("?");
      if (filepath.endsWith(".js") && (code.includes("<") || code.includes(">"))) {
        try {
          const result = transformSync(filepath, code, {
            lang: "jsx",
            jsx: {
              runtime: "automatic",
            },
          });
          if (result && result.code) {
            return {
              code: result.code,
              map: result.map || null,
            };
          }
        } catch (e) {
          return null;
        }
      }
    },
  };
}

function fixTanstackServerPlugin() {
  return {
    name: "fix-tanstack-server",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, "/");
      if (
        normalizedId.includes("@tanstack/start-server-core") &&
        (normalizedId.endsWith("createStartHandler.js") || normalizedId.endsWith("createStartHandler.ts"))
      ) {
        return code
          .replace(
            /createCsrfMiddleware\(\s*\{[\s\S]*?\}\s*\)/g,
            "null"
          )
          .replace(
            /\[defaultCsrfMiddleware\]/g,
            "[]"
          );
      }
    },
  };
}

function patchCompiledNitro(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patchCompiledNitro(fullPath);
    } else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) {
      let content = fs.readFileSync(fullPath, "utf-8");
      let changed = false;
      // Fix Rolldown bug: missing ssr_exports definition in SSR entry chunk
      if (
        content.includes("ssr_exports as a") &&
        !content.includes("var ssr_exports") &&
        !content.includes("const ssr_exports") &&
        !content.includes("let ssr_exports")
      ) {
        content =
          "var ssr_exports = typeof server_default !== 'undefined' ? { default: server_default } : {};\n" +
          content;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, "utf-8");
      }
    }
  }

  // Also ensure a dist folder exists with static assets as fallback for Vercel's Vite preset
  try {
    const staticDir = path.resolve(process.cwd(), ".vercel/output/static");
    const distDir = path.resolve(process.cwd(), "dist");
    if (fs.existsSync(staticDir)) {
      fs.cpSync(staticDir, distDir, { recursive: true, force: true });
    }
  } catch {}
}

export default defineConfig({
  react: {
    include: /\.(jsx|js|tsx|ts)$/,
  },
  plugins: [jsxInJsPrePlugin(), fixTanstackServerPlugin()],
  tanstackStart: {},
  nitro: {
    preset: process.env.VERCEL ? "vercel" : undefined,
    hooks: {
      compiled(nitro) {
        patchCompiledNitro(nitro.options.output.dir);
        // Also ensure .vercel/output is patched if output.dir is different
        if (process.env.VERCEL) {
          patchCompiledNitro(path.resolve(process.cwd(), ".vercel/output"));
        }
      },
    },
  },
  vite: {
    optimizeDeps: {
      rolldownOptions: {
        moduleTypes: {
          ".js": "jsx",
        },
        plugins: [jsxInJsPrePlugin()],
      },
    },
  },
});

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

export default defineConfig({
  react: {
    include: /\.(jsx|js|tsx|ts)$/,
  },
  plugins: [jsxInJsPrePlugin()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.js (our SSR error wrapper).
    server: { entry: "server" },
  },
  nitro: {
    preset: process.env.VERCEL ? "vercel" : undefined,
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

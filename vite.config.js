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
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
    rolldownOptions: {
      moduleTypes: {
        ".js": "jsx",
      },
    },
  },
  plugins: [jsxInJsPrePlugin()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.js (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

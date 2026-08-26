import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import ts from "typescript";

function jsJsxPlugin() {
  return {
    name: "js-jsx-plugin",
    enforce: "pre",
    transform(code, id) {
      const cleanId = id.split("?")[0];
      if (
        cleanId.endsWith(".js") &&
        !cleanId.includes("node_modules") &&
        (code.includes("<") || code.includes("/>"))
      ) {
        const res = ts.transpileModule(code, {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ESNext,
          },
        });
        return {
          code: res.outputText,
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  react: {
    include: /\.(jsx|js|tsx|ts)$/,
  },
  vite: {
    plugins: [jsJsxPlugin()],
    esbuild: {
      loader: "jsx",
      include: /src\/.*\.js$/,
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          ".js": "jsx",
        },
      },
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});

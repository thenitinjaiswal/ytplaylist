/**
 * Central language configuration.
 *
 * Adding a language means adding one entry here — no execution logic is
 * hardcoded anywhere else in the app. The sandbox provider receives generated
 * `compile` / `run` shell scripts built from this config.
 */

export interface StarterFile {
  path: string;
  content: string;
}

export interface LanguageConfig {
  id: string;
  label: string;
  /** Small glyph used in the language selector. */
  icon: string;
  /** Monaco language id */
  monaco: string;
  extension: string;
  /** Entry file, relative to the workspace root. */
  entryFile: string;
  /** Files created the first time a lesson workspace is opened. */
  starterFiles: StarterFile[];
  /** Toolchain directories prepended to PATH inside the sandbox. */
  toolchainPath: string[];
  /** Extra env exported inside the sandbox before compile/run. */
  env: Record<string, string>;
  /** Builds the compile stage (empty = interpreted language). */
  compile: (ctx: BuildContext) => string[];
  /** Builds the run stage. */
  run: (ctx: BuildContext) => string[];
  /** Command that prints the real toolchain version. */
  versionCommand: string;
  /** Shown until the real runtime version has been read from the sandbox. */
  versionLabel: string;
  timeoutMs: number;
  memoryLimitBytes: number;
  /** Runs in a browser preview instead of the sandbox. */
  preview?: boolean;
  enabled: boolean;
  /** Optional per-language notes surfaced in the UI. */
  note?: string;
}

export interface BuildContext {
  /** Entry file path, already validated. */
  entry: string;
  /** All workspace file paths, already validated. */
  paths: string[];
  /** Entry basename without extension (Java main class, C++ binary). */
  entryBase: string;
}

/** C++ standard — bump to c++20 here when the toolchain allows it. */
export const CXX_STANDARD = "c++17";

const JDK = "/usr/local/jdk17/bin";
const PY = "/usr/local/python-3.8.1/bin";
const GCC = "/usr/local/gcc-9.2.0/bin";

const README = (title: string) =>
  `# ${title}\n\nWorkspace created in the CodeStudy IDE.\nFiles here are real project files — they can be downloaded as a ZIP or pushed to GitHub.\n`;

function sourcesWithExt(paths: string[], ext: string): string[] {
  return paths.filter((p) => p.toLowerCase().endsWith(ext));
}

export const LANGUAGES: LanguageConfig[] = [
  {
    id: "java",
    label: "Java",
    icon: "☕",
    monaco: "java",
    extension: "java",
    entryFile: "src/Main.java",
    starterFiles: [
      {
        path: "src/Main.java",
        content: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, CodeStudy!");
    }
}
`,
      },
      {
        path: "src/Calculator.java",
        content: `public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }
}
`,
      },
      { path: "README.md", content: README("Java workspace") },
    ],
    toolchainPath: [JDK],
    env: {},
    compile: ({ paths }) => [`javac -d out ${quoteAll(sourcesWithExt(paths, ".java"))}`],
    run: ({ entryBase }) => [`java -cp out ${shellQuote(entryBase)}`],
    versionCommand: "javac -version",
    versionLabel: "Java 17",
    timeoutMs: 10_000,
    memoryLimitBytes: 512 * 1024 * 1024,
    enabled: true,
  },
  {
    id: "python",
    label: "Python",
    icon: "🐍",
    monaco: "python",
    extension: "py",
    entryFile: "main.py",
    starterFiles: [
      {
        path: "main.py",
        content: `from utils import shout


def greet(name):
    return f"Hello, {name}!"


print(greet("CodeStudy"))
print(shout("multiple files work too"))
`,
      },
      {
        path: "utils.py",
        content: `def shout(text):
    return text.upper()
`,
      },
      { path: "README.md", content: README("Python workspace") },
    ],
    toolchainPath: [PY],
    env: { PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1" },
    compile: () => [],
    run: ({ entry }) => [`python3 ${shellQuote(entry)}`],
    versionCommand: "python3 --version",
    versionLabel: "Python 3",
    timeoutMs: 10_000,
    memoryLimitBytes: 256 * 1024 * 1024,
    enabled: true,
  },
  {
    id: "cpp",
    label: "C++",
    icon: "⚙️",
    monaco: "cpp",
    extension: "cpp",
    entryFile: "src/main.cpp",
    starterFiles: [
      {
        path: "src/main.cpp",
        content: `#include <iostream>
#include "../include/utils.h"

using namespace std;

int main() {
    cout << "Hello, CodeStudy!" << endl;
    cout << "twice(21) = " << twice(21) << endl;
    return 0;
}
`,
      },
      {
        path: "src/utils.cpp",
        content: `#include "../include/utils.h"

int twice(int value) {
    return value * 2;
}
`,
      },
      {
        path: "include/utils.h",
        content: `#pragma once

int twice(int value);
`,
      },
      { path: "README.md", content: README("C++ workspace") },
    ],
    toolchainPath: [GCC],
    env: { LD_LIBRARY_PATH: "/usr/local/gcc-9.2.0/lib64" },
    compile: ({ paths, entryBase }) => [
      `g++ -std=${CXX_STANDARD} -O2 -Iinclude ${quoteAll(sourcesWithExt(paths, ".cpp"))} -o ${shellQuote(entryBase)}`,
    ],
    run: ({ entryBase }) => [`./${entryBase}`],
    versionCommand: "g++ --version | head -1",
    versionLabel: `GCC (${CXX_STANDARD})`,
    timeoutMs: 10_000,
    memoryLimitBytes: 512 * 1024 * 1024,
    enabled: true,
  },
  {
    id: "javascript",
    label: "JavaScript",
    icon: "🟨",
    monaco: "javascript",
    extension: "js",
    entryFile: "index.js",
    starterFiles: [
      {
        path: "index.js",
        content: `function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("CodeStudy"));
`,
      },
      { path: "README.md", content: README("JavaScript workspace") },
    ],
    toolchainPath: ["/usr/local/node-12.14.0/bin"],
    env: {},
    compile: () => [],
    run: ({ entry }) => [`node ${shellQuote(entry)}`],
    versionCommand: "node --version",
    versionLabel: "Node.js",
    timeoutMs: 10_000,
    memoryLimitBytes: 256 * 1024 * 1024,
    enabled: true,
  },
  {
    id: "html",
    label: "HTML / CSS / JS",
    icon: "🌐",
    monaco: "html",
    extension: "html",
    entryFile: "index.html",
    starterFiles: [
      {
        path: "index.html",
        content: `<!doctype html>
<html>
  <head>
    <style>
      body { font-family: system-ui; padding: 24px; }
    </style>
  </head>
  <body>
    <h1 id="title">Hello CodeStudy</h1>
    <script>
      document.getElementById("title").textContent += " 👋";
    </script>
  </body>
</html>
`,
      },
    ],
    toolchainPath: [],
    env: {},
    compile: () => [],
    run: () => [],
    versionCommand: "",
    versionLabel: "Browser preview",
    preview: true,
    timeoutMs: 0,
    memoryLimitBytes: 0,
    enabled: true,
    note: "Rendered in the browser preview tab instead of the sandbox.",
  },
];

export const ENABLED_LANGUAGES = LANGUAGES.filter((l) => l.enabled);
/** Languages that execute in the sandbox (order matters for the selector). */
export const RUNNABLE_LANGUAGES = ENABLED_LANGUAGES.filter((l) => !l.preview);

export function getLanguage(id: string | null | undefined): LanguageConfig {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0]!;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function quoteAll(values: string[]): string {
  return values.map(shellQuote).join(" ");
}

export function entryBaseName(entry: string): string {
  const file = entry.split("/").pop() ?? entry;
  return file.replace(/\.[^.]+$/, "");
}

/** Human-readable command list shown in the output terminal. */
export function displayCommands(language: LanguageConfig, ctx: BuildContext): string[] {
  return [...language.compile(ctx), ...language.run(ctx)].map((cmd) => cmd.replace(/'/g, ""));
}

const DETECTION: Array<{ id: string; patterns: RegExp[] }> = [
  { id: "java", patterns: [/\bjava\b/i, /\bspring\s?boot\b/i] },
  { id: "python", patterns: [/\bpython\b/i, /\bdjango\b/i, /\bpandas\b/i, /\bflask\b/i] },
  { id: "cpp", patterns: [/\bc\+\+\b/i, /\bcpp\b/i, /\bdsa in c\+\+/i] },
  { id: "javascript", patterns: [/\bjavascript\b/i, /\bnode(\.js)?\b/i] },
];

/**
 * Conservative language detection from course / lesson metadata. Returns null
 * when the signal is ambiguous so the user's own preference wins.
 */
export function detectLanguage(...texts: Array<string | null | undefined>): string | null {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;
  const hits = DETECTION.filter((d) => d.patterns.some((p) => p.test(haystack)));
  if (hits.length !== 1) return null;
  return hits[0]!.id;
}

const EXT_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  html: "html",
  htm: "html",
  css: "css",
  json: "json",
  md: "markdown",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  h: "cpp",
  java: "java",
  go: "go",
  rs: "rust",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
  txt: "plaintext",
};

export function monacoLanguageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plaintext";
}

export function languageIdForPath(path: string): string {
  const monaco = monacoLanguageForPath(path);
  const match = LANGUAGES.find((l) => l.monaco === monaco);
  return match?.id ?? "javascript";
}

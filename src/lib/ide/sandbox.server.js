/**
 * Sandboxed code execution.
 *
 * User code NEVER runs on the app server. Every execution is shipped to an
 * isolated, disposable sandbox (Judge0 + isolate, one throwaway box per
 * submission) which enforces CPU/wall time, memory, process count, filesystem
 * isolation and a disabled network, then destroys the box.
 *
 * Self-hosting: set JUDGE0_URL (and JUDGE0_AUTH_TOKEN / JUDGE0_RAPIDAPI_KEY).
 */
import { displayCommands, entryBaseName, getLanguage } from "@/lib/languages";
import { base64ToText, bytesToBase64, createZip, textToBase64 } from "@/lib/ide/zip";
/** Server-side execution limits (single source of truth). */
export const LIMITS = {
  cpuSeconds: 8,
  wallSeconds: 15,
  memoryKb: 256_000,
  maxOutputBytes: 1_000_000,
  maxFiles: 100,
  maxProjectBytes: 10_000_000,
  maxProcesses: 64,
};
/** Judge0 "Multi-file program" language id — we supply compile/run scripts. */
const MULTI_FILE_LANGUAGE_ID = 89;
const SAFE_PATH = /^(?!.*\/\/)(?![./])[A-Za-z0-9._\-/]+$/;
function baseUrl() {
  return (process.env["JUDGE0_URL"] ?? "https://ce.judge0.com").replace(/\/+$/, "");
}
function authHeaders() {
  const headers = { "content-type": "application/json" };
  const token = process.env["JUDGE0_AUTH_TOKEN"];
  if (token) headers["X-Auth-Token"] = token;
  const rapid = process.env["JUDGE0_RAPIDAPI_KEY"];
  if (rapid) {
    headers["X-RapidAPI-Key"] = rapid;
    headers["X-RapidAPI-Host"] = new URL(baseUrl()).host;
  }
  return headers;
}
export function validatePath(path) {
  if (!path || path.length > 200) return "Path is empty or too long";
  if (path.includes("..") || path.startsWith("/") || /[\0\\]/.test(path)) {
    return "Path is not allowed";
  }
  if (!SAFE_PATH.test(path)) {
    return "Only letters, digits, dot, dash, underscore and / are allowed";
  }
  return null;
}
function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[output truncated at ${Math.round(max / 1000)}KB]`;
}
function scriptPrelude(language) {
  const path = [...language.toolchainPath, "$PATH"].join(":");
  const env = Object.entries(language.env)
    .map(([key, value]) => `export ${key}='${value.replace(/'/g, "")}'`)
    .join("\n");
  return `#!/usr/bin/env bash\nset -e\nexport PATH=${path}\n${env}\n`;
}
async function submit(payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fields = "stdout,stderr,compile_output,message,status,time,memory,exit_code,token";
    const res = await fetch(
      `${baseUrl()}/submissions?base64_encoded=true&wait=true&fields=${fields}`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("sandbox submit failed", res.status, body.slice(0, 400));
      throw new Error(res.status === 429 ? "busy" : "unavailable");
    }
    const body = await res.json();
    if (body.status) return body;
    if (body.token) return pollToken(body.token, timeoutMs);
    throw new Error("unavailable");
  } finally {
    clearTimeout(timer);
  }
}
async function pollToken(token, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const res = await fetch(
      `${baseUrl()}/submissions/${token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,status,time,memory,exit_code`,
      { headers: authHeaders() },
    );
    if (!res.ok) throw new Error("unavailable");
    const body = await res.json();
    // 1 = in queue, 2 = processing
    if (body.status && body.status.id > 2) return body;
  }
  throw new Error("timeout");
}
function failure(message, status = "error") {
  return {
    status,
    ok: false,
    commands: [],
    compileOutput: "",
    stdout: "",
    stderr: "",
    exitCode: null,
    executionTimeMs: 0,
    memoryUsedKb: null,
    runtimeVersion: null,
    error: message,
  };
}
export async function runInSandbox(request) {
  const language = getLanguage(request.languageId);
  if (!language.enabled || language.preview) {
    return failure(`${language.label} does not run in the sandbox.`);
  }
  if (request.files.length > LIMITS.maxFiles) {
    return failure(`Too many files (limit ${LIMITS.maxFiles}).`, "limit_exceeded");
  }
  const totalBytes = request.files.reduce((sum, f) => sum + f.content.length, 0);
  if (totalBytes > LIMITS.maxProjectBytes) {
    return failure("Project is too large to execute (10MB limit).", "limit_exceeded");
  }
  for (const file of request.files) {
    const problem = validatePath(file.path);
    if (problem) return failure(`Invalid file path "${file.path}": ${problem}`);
  }
  const entry = request.files.find((f) => f.path === request.entry) ?? request.files[0];
  if (!entry) return failure("No entry file to run.");
  const paths = request.files.map((f) => f.path);
  const ctx = { entry: entry.path, paths, entryBase: entryBaseName(entry.path) };
  const compileLines = language.compile(ctx);
  const runLines = language.run(ctx);
  const commands = displayCommands(language, ctx);
  const versionLine = language.versionCommand ? `${language.versionCommand} 1>&2 || true\n` : "";
  const entries = [
    ...request.files.map((file) => ({ path: file.path, content: file.content })),
    {
      path: "run",
      content: `${scriptPrelude(language)}${versionLine}${runLines.join("\n")}\n`,
      mode: 0o755,
    },
  ];
  if (compileLines.length > 0) {
    entries.push({
      path: "compile",
      content: `${scriptPrelude(language)}${compileLines.join("\n")}\n`,
      mode: 0o755,
    });
  }
  const zipBase64 = bytesToBase64(createZip(entries));
  const cpuSeconds = Math.min(LIMITS.cpuSeconds, Math.max(2, language.timeoutMs / 1000));
  const payload = {
    language_id: MULTI_FILE_LANGUAGE_ID,
    additional_files: zipBase64,
    stdin: textToBase64(request.stdin ?? ""),
    cpu_time_limit: cpuSeconds,
    wall_time_limit: Math.min(LIMITS.wallSeconds, cpuSeconds + 6),
    memory_limit: Math.min(LIMITS.memoryKb, Math.round(language.memoryLimitBytes / 1024)),
    max_processes_and_or_threads: LIMITS.maxProcesses,
    enable_network: false,
    redirect_stderr_to_stdout: false,
  };
  const started = Date.now();
  let body;
  try {
    body = await submit(payload, (LIMITS.wallSeconds + 20) * 1000);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unavailable";
    if (reason === "busy") {
      return failure("The sandbox is busy right now. Try again in a few seconds.");
    }
    if (reason === "timeout") {
      return failure(
        `Execution timed out after ${cpuSeconds} seconds and the sandbox was destroyed.`,
        "timeout",
      );
    }
    console.error("sandbox execution failed", error);
    return failure("Could not reach the execution sandbox. Please try again.");
  }
  const statusId = body.status?.id ?? 0;
  const decode = (value) => (value ? base64ToText(value) : "");
  const rawStderr = decode(body.stderr);
  // The run script echoes the toolchain version to stderr on its first line.
  let runtimeVersion = null;
  let stderr = rawStderr;
  if (language.versionCommand && rawStderr) {
    const [first, ...rest] = rawStderr.split("\n");
    if (first && /\d+\.\d+/.test(first)) {
      runtimeVersion = first.trim();
      stderr = rest.join("\n");
    }
  }
  const compileOutput = decode(body.compile_output);
  const exitCode = statusId === 5 ? null : (body.exit_code ?? null);
  const status =
    statusId === 6
      ? "compile_error"
      : statusId === 5
        ? "timeout"
        : statusId === 3
          ? exitCode === 0
            ? "success"
            : "runtime_error"
          : statusId >= 7
            ? "runtime_error"
            : "error";
  const messages = decode(body.message);
  return {
    status,
    ok: status === "success",
    commands,
    compileOutput: truncate(compileOutput, LIMITS.maxOutputBytes / 4),
    stdout: truncate(decode(body.stdout), LIMITS.maxOutputBytes),
    stderr: truncate([stderr, messages].filter(Boolean).join("\n"), LIMITS.maxOutputBytes / 2),
    exitCode,
    executionTimeMs: body.time ? Math.round(Number(body.time) * 1000) : Date.now() - started,
    memoryUsedKb: body.memory ?? null,
    runtimeVersion,
    ...(status === "timeout"
      ? { error: `Execution timed out after ${cpuSeconds} seconds and the sandbox was destroyed.` }
      : {}),
  };
}
/** Real toolchain versions, probed once per worker instance. */
const versionCache = new Map();
export async function probeRuntimeVersion(languageId) {
  const language = getLanguage(languageId);
  if (!language.versionCommand || language.preview) return null;
  const cached = versionCache.get(language.id);
  if (cached) return cached;
  const entries = [
    {
      path: "run",
      content: `${scriptPrelude(language)}${language.versionCommand} 2>&1\n`,
      mode: 0o755,
    },
  ];
  try {
    const body = await submit(
      {
        language_id: MULTI_FILE_LANGUAGE_ID,
        additional_files: bytesToBase64(createZip(entries)),
        cpu_time_limit: 5,
        wall_time_limit: 10,
      },
      30_000,
    );
    const text =
      `${body.stdout ? base64ToText(body.stdout) : ""}${body.stderr ? base64ToText(body.stderr) : ""}`
        .trim()
        .split("\n")[0]
        ?.trim();
    if (text) versionCache.set(language.id, text);
    return text ?? null;
  } catch {
    return null;
  }
}

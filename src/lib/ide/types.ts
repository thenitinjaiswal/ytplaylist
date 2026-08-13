export interface WorkspaceFile {
  path: string;
  content: string;
}

export type RunStatus =
  "success" | "compile_error" | "runtime_error" | "timeout" | "limit_exceeded" | "error";

export interface RunResult {
  status: RunStatus;
  /** Convenience flag: exited cleanly with code 0. */
  ok: boolean;
  /** Commands the sandbox executed, for terminal display. */
  commands: string[];
  compileOutput: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Wall time reported by the sandbox, in ms. */
  executionTimeMs: number;
  memoryUsedKb: number | null;
  /** Real runtime version reported by the sandbox toolchain. */
  runtimeVersion: string | null;
  /** User-facing message for infrastructure problems. */
  error?: string;
}

export interface ExecutionLimits {
  cpuSeconds: number;
  wallSeconds: number;
  memoryKb: number;
  maxOutputBytes: number;
  maxFiles: number;
  maxProjectBytes: number;
  maxProcesses: number;
}

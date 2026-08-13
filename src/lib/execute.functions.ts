import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runSchema, versionSchema, rateLimited } from "@/lib/ide/execute-schema";
import type { RunResult } from "@/lib/ide/types";

export type { RunResult } from "@/lib/ide/types";

/**
 * Executes user code in a disposable, network-isolated sandbox container.
 * Nothing is ever executed on the application server process.
 */
export const runCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof runSchema>) => runSchema.parse(input))
  .handler(async ({ data, context }): Promise<RunResult> => {
    const { userId, supabase } = context;
    const { runInSandbox } = await import("@/lib/ide/sandbox.server");

    if (rateLimited(userId)) {
      return {
        status: "error",
        ok: false,
        commands: [],
        compileOutput: "",
        stdout: "",
        stderr: "",
        exitCode: null,
        executionTimeMs: 0,
        memoryUsedKb: null,
        runtimeVersion: null,
        error: "Too many runs in the last minute. Give the sandbox a moment.",
      };
    }

    const result = await runInSandbox({
      languageId: data.language,
      entry: data.entry,
      files: data.files,
      ...(data.stdin ? { stdin: data.stdin } : {}),
    });

    if (!result.error) {
      await supabase.from("activities").insert({
        user_id: userId,
        kind: "code_executed",
        ...(data.lessonId ? { lesson_id: data.lessonId } : {}),
        meta: { language: data.language, status: result.status, exit_code: result.exitCode },
      });
    }

    return result;
  });

/** Returns the real toolchain version reported by the sandbox. */
export const getRuntimeVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof versionSchema>) => versionSchema.parse(input))
  .handler(async ({ data }): Promise<{ version: string | null }> => {
    const { probeRuntimeVersion } = await import("@/lib/ide/sandbox.server");
    return { version: await probeRuntimeVersion(data.language) };
  });

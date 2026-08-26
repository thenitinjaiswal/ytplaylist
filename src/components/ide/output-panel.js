import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseErrorLocations } from "@/lib/ide/workspace";
import { cn } from "@/lib/utils";
const STATUS_LABEL = {
  success: "Success",
  compile_error: "Compilation Error",
  runtime_error: "Runtime Error",
  timeout: "Timed out",
  limit_exceeded: "Limit exceeded",
  error: "Sandbox error",
};
export function OutputPanel({
  result,
  running,
  stdin,
  onStdinChange,
  paths,
  onJumpTo,
  tab,
  onTabChange,
}) {
  const errorText = [result?.compileOutput, result?.stderr, result?.error]
    .filter(Boolean)
    .join("\n");
  const locations = result ? parseErrorLocations(errorText, paths) : [];
  return (
    <Tabs
      value={tab}
      onValueChange={onTabChange}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-black/60"
    >
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <TabsList className="h-7">
          <TabsTrigger value="output" className="text-xs">
            Output
          </TabsTrigger>
          <TabsTrigger value="errors" className="text-xs">
            Errors{errorText ? " •" : ""}
          </TabsTrigger>
          <TabsTrigger value="input" className="text-xs">
            Input
          </TabsTrigger>
        </TabsList>
        <div className="flex-1" />
        {result ? (
          <span
            className={cn(
              "text-mono-xs",
              result.status === "success"
                ? "text-success"
                : result.status === "error"
                  ? "text-muted-foreground"
                  : "text-destructive",
            )}
          >
            {STATUS_LABEL[result.status]}
            {result.executionTimeMs ? ` · ${result.executionTimeMs}ms` : ""}
            {result.memoryUsedKb ? ` · ${Math.round(result.memoryUsedKb / 1024)}MB` : ""}
          </span>
        ) : null}
      </div>

      <TabsContent value="output" className="min-h-0 flex-1 overflow-auto p-3">
        <pre className="whitespace-pre-wrap text-mono-xs leading-relaxed text-foreground">
          {running
            ? "Running in sandbox…"
            : result
              ? [
                  ...result.commands.map((cmd) => `$ ${cmd}`),
                  "",
                  result.stdout || (result.status === "success" ? "(no output)" : ""),
                  result.compileOutput && result.status === "compile_error"
                    ? result.compileOutput
                    : "",
                  result.stderr && result.status !== "success" ? result.stderr : "",
                  result.error ?? "",
                  result.exitCode !== null ? `\nProcess exited with code ${result.exitCode}` : "",
                ]
                  .filter((part) => part !== "")
                  .join("\n")
              : "Run your code to see output here."}
        </pre>
      </TabsContent>

      <TabsContent value="errors" className="min-h-0 flex-1 overflow-auto p-3">
        {errorText ? (
          <div className="space-y-2">
            <pre className="whitespace-pre-wrap text-mono-xs leading-relaxed text-destructive">
              {errorText}
            </pre>
            {locations.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                {locations.map((loc) => (
                  <button
                    key={`${loc.file}:${loc.line}`}
                    type="button"
                    onClick={() => onJumpTo(loc.file, loc.line)}
                    className="rounded border border-border px-1.5 py-0.5 text-mono-xs text-muted-foreground hover:text-foreground"
                  >
                    {loc.file}:{loc.line}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-mono-xs text-muted-foreground">No errors.</p>
        )}
      </TabsContent>

      <TabsContent value="input" className="min-h-0 flex-1 overflow-auto p-2">
        <Textarea
          value={stdin}
          onChange={(event) => onStdinChange(event.target.value)}
          placeholder={"Standard input, one value per line\n5\n10"}
          className="h-full min-h-24 resize-none border-border bg-transparent font-mono text-xs"
        />
      </TabsContent>
    </Tabs>
  );
}

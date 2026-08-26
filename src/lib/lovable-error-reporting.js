export function reportError(error, context = {}) {
  if (typeof window === "undefined") return;
  console.error("Runtime error caught:", error, context);
}

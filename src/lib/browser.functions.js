import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
export const searchBrowser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ query: z.string().trim().min(1).max(300) }).parse(input))
  .handler(async ({ data }) => {
    const { searchWeb } = await import("@/lib/ide/browser.server");
    return searchWeb(data.query);
  });
export const readBrowserPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ url: z.string().url().max(2_000) }).parse(input))
  .handler(async ({ data }) => {
    const { readWebPage } = await import("@/lib/ide/browser.server");
    return readWebPage(data.url);
  });

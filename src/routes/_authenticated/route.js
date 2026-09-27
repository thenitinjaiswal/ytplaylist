import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        return { userId: data.user.id };
      }
    } catch (e) {
      console.warn("Auth check failed:", e);
    }

    if (typeof window !== "undefined") {
      let demoUser = localStorage.getItem("codestudy.demoUser");
      if (!demoUser) {
        const defaultUser = {
          id: "guest-user",
          email: "user@codestudy.dev",
          user_metadata: { full_name: "CodeStudy User" },
        };
        localStorage.setItem("codestudy.demoUser", JSON.stringify(defaultUser));
        demoUser = JSON.stringify(defaultUser);
      }
      try {
        const parsed = JSON.parse(demoUser);
        return { userId: parsed.id };
      } catch (e) {
        // invalid JSON
      }
    }
    return { userId: "guest-user" };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

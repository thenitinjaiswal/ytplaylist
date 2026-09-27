import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SessionContext = createContext({
  session: null,
  user: null,
  loading: true,
});

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getDemoSession = () => {
      if (typeof window === "undefined") return null;
      const stored = localStorage.getItem("codestudy.demoUser");
      if (stored) {
        try {
          const user = JSON.parse(stored);
          return { user, access_token: "demo-access-token" };
        } catch (e) {
          // ignore error
        }
      }
      return null;
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (next) {
        setSession(next);
      } else {
        setSession(getDemoSession());
      }
      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data?.session) {
          setSession(data.session);
        } else {
          setSession(getDemoSession());
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn("Failed to get supabase session:", err);
        setSession(getDemoSession());
        setLoading(false);
      });

    return () => subscription?.subscription?.unsubscribe?.();
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

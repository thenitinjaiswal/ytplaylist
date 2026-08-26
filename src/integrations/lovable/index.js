import { supabase } from "../supabase/client";

export const auth = {
  signInWithOAuth: async (provider, opts) => {
    return supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: opts?.redirect_uri || window.location.origin,
      },
    });
  },
};

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  isSignUp: z.boolean().optional(),
});

export const authenticateUserServer = createServerFn({ method: "POST" })
  .validator((input) => authSchema.parse(input))
  .handler(async ({ data }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Supabase server environment variables missing.");
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const pubClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { email, password, name, isSignUp } = data;

    // Check if user already exists
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const existingUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    if (isSignUp && !existingUser) {
      // Create new user using admin credentials
      const createRes = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name || email.split("@")[0] },
      });

      if (createRes.error) {
        throw new Error(createRes.error.message);
      }
    } else if (existingUser) {
      // Update user password and metadata if provided
      await adminClient.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...existingUser.user_metadata,
          ...(name ? { full_name: name } : {}),
        },
      });
    }

    // Generate link/OTP to establish a real authenticated session
    const linkRes = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkRes.error) {
      throw new Error(linkRes.error.message);
    }

    const otp = linkRes.data?.properties?.email_otp;
    if (!otp) {
      throw new Error("Could not generate login token.");
    }

    // Verify OTP using publishable client to get real session tokens
    const verifyRes = await pubClient.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (verifyRes.error || !verifyRes.data?.session) {
      throw new Error(verifyRes.error?.message || "Failed to verify auth session.");
    }

    return {
      session: verifyRes.data.session,
      user: verifyRes.data.user,
    };
  });

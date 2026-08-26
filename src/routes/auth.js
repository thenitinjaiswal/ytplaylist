import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Code2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { authenticateUserServer } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — CodeStudy" },
      {
        name: "description",
        content:
          "Sign in to CodeStudy to turn YouTube coding playlists into interactive courses with an editor, terminal and notes.",
      },
      { property: "og:title", content: "Sign in — CodeStudy" },
      {
        property: "og:description",
        content: "Sign in to your CodeStudy workspace.",
      },
    ],
  }),
  component: AuthPage,
});

function safePath(value) {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/auth")) return "/dashboard";
  return value;
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(null);
  const [sent, setSent] = useState(false);
  const target = safePath(search.redirect);

  useEffect(() => {
    if (!loading && session) {
      navigate({ href: target, replace: true });
    }
  }, [loading, session, navigate, target]);

  async function handleServerAuth(isSignUp = false) {
    try {
      const res = await authenticateUserServer({
        data: { email, password, name, isSignUp },
      });
      if (res?.session) {
        await supabase.auth.setSession({
          access_token: res.session.access_token,
          refresh_token: res.session.refresh_token,
        });
        toast.success("Signed in successfully!");
        navigate({ href: target, replace: true });
        return true;
      }
    } catch (err) {
      toast.error(err.message || "Authentication failed.");
    }
    return false;
  }

  async function signIn(event) {
    event.preventDefault();
    setBusy("email");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // If client email sign-in is disabled, authenticate via admin server function
      if (
        error.message?.includes("disabled") ||
        error.message?.includes("provider") ||
        error.status === 422
      ) {
        const ok = await handleServerAuth(false);
        setBusy(null);
        if (ok) return;
        return;
      }
      setBusy(null);
      toast.error(error.message);
      return;
    }
    setBusy(null);
    navigate({ href: target, replace: true });
  }

  async function signUp(event) {
    event.preventDefault();
    setBusy("email");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: name },
      },
    });
    if (error) {
      // If client email signups are disabled on Supabase, authenticate via admin server function
      if (
        error.message?.includes("disabled") ||
        error.message?.includes("provider") ||
        error.status === 422 ||
        error.status === 400
      ) {
        const ok = await handleServerAuth(true);
        setBusy(null);
        if (ok) return;
        return;
      }
      setBusy(null);
      toast.error(error.message);
      return;
    }
    setBusy(null);
    if (!data.session) {
      setSent(true);
      return;
    }
    navigate({ href: target, replace: true });
  }

  async function google() {
    setBusy("google");
    if (target !== "/dashboard") {
      window.sessionStorage.setItem("codestudy.postAuth", target);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setBusy(null);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between border-r border-border bg-surface p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Code2 className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">CodeStudy</span>
        </Link>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
            Turn any YouTube playlist into a real coding course.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Video, editor, terminal and notes in one resizable workspace. Progress and streaks are
            tracked automatically, and your work pushes straight to GitHub.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            {[
              "Import a playlist — lessons, durations and thumbnails included",
              "Run code in a sandboxed runtime for 10+ languages",
              "Timestamped notes that jump back into the video",
              "Commit lesson files to a real repository",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-mono-xs text-muted-foreground">
          Code runs in an isolated sandbox — never in your browser or on your machine.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Code2 className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">CodeStudy</span>
          </div>

          {sent ? (
            <div className="rounded-lg border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold text-foreground">Check your inbox</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to <span className="text-foreground">{email}</span>.
                Click it to activate your account, then sign in.
              </p>
              <Button variant="outline" className="mt-5 w-full" onClick={() => setSent(false)}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={signIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy !== null}>
                    {busy === "email" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Sign in
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={signUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ada Lovelace"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-up">Email</Label>
                    <Input
                      id="email-up"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-up">Password</Label>
                    <Input
                      id="password-up"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy !== null}>
                    {busy === "email" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}

          {!sent ? (
            <>
              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-mono-xs uppercase tracking-widest text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={google}
                disabled={busy !== null}
              >
                {busy === "google" ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />}
                Continue with Google
              </Button>
              <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
                GitHub is connected separately from Settings once you're in, so CodeStudy can push
                your lesson files to your repositories.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.2h6.6c-.1 1.1-.9 2.7-2.1 3.8l-.1.1 3.1 2.4c1.8-1.7 2.9-4.2 2.9-7.3z"
      />
      <path
        fill="#34A853"
        d="M12 24c2.9 0 5.4-1 7.2-2.6l-3.4-2.6c-.9.6-2.1 1.1-3.8 1.1-2.8 0-5.2-1.9-6-4.5l-.1.1-3.2 2.5C4.5 21.3 8 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M6 15.4c-.2-.6-.4-1.3-.4-2.1s.1-1.5.3-2.1V11L2.6 8.5C1.8 10 1.4 11.7 1.4 13.4s.4 3.4 1.2 4.9L6 15.4z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c2 0 3.3.9 4.1 1.6l3-2.9C17.3 1.7 14.9.6 12 .6 8 .6 4.5 3.3 2.6 7.1l3.3 2.6C6.8 6.6 9.2 4.7 12 4.7z"
      />
    </svg>
  );
}

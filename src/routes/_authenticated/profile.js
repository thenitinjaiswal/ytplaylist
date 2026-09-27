import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Github, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — LearnFlow Studio" },
      { name: "description", content: "Your display name, GitHub profile and account details." },
      { property: "og:title", content: "Profile — LearnFlow Studio" },
      { property: "og:description", content: "Manage your profile and GitHub connection." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data } = await supabase.from("profiles").select("*").maybeSingle();
      const githubLogin = auth.user?.user_metadata?.github_login || data?.github_login || null;
      return { profile: data, email: auth.user?.email ?? "", githubLogin };
    },
  });

  const [form, setForm] = useState({ display_name: "", avatar_url: "", github_login: "" });

  useEffect(() => {
    if (query.data) {
      setForm({
        display_name: query.data.profile?.display_name ?? "",
        avatar_url: query.data.profile?.avatar_url ?? "",
        github_login: query.data.githubLogin ?? query.data.profile?.github_login ?? "",
      });
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").upsert(
        {
          id: auth.user.id,
          display_name: form.display_name.trim(),
          avatar_url: form.avatar_url.trim() || null,
          github_login: form.github_login.trim() || null,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => toast.error("Could not update your profile"),
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">{query.data?.email}</p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="space-y-2">
          <Label htmlFor="display_name">Display name</Label>
          <Input
            id="display_name"
            value={form.display_name}
            onChange={(event) => setForm({ ...form, display_name: event.target.value })}
            placeholder="Ada Lovelace"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="avatar_url">Avatar URL</Label>
          <Input
            id="avatar_url"
            value={form.avatar_url}
            onChange={(event) => setForm({ ...form, avatar_url: event.target.value })}
            placeholder="https://…"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="github_login" className="flex items-center gap-1.5">
              <Github className="size-3.5 text-foreground" />
              GitHub Username
            </Label>
            {form.github_login ? (
              <a
                href={`https://github.com/${form.github_login}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View GitHub Profile
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
          <Input
            id="github_login"
            value={form.github_login}
            onChange={(event) =>
              setForm({ ...form, github_login: event.target.value.replace(/^@/, "") })
            }
            placeholder="octocat"
          />
          <p className="text-[11px] text-muted-foreground">
            Connect your full GitHub account with tokens on the{" "}
            <Link to="/github" className="text-primary underline">
              GitHub page
            </Link>{" "}
            to push code directly.
          </p>
        </div>

        <div className="pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save profile
          </Button>
        </div>
      </div>
    </div>
  );
}

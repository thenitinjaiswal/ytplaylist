import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Eye, EyeOff, Github, KeyRound, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES } from "@/lib/languages";
import { PLAYBACK_SPEEDS } from "@/lib/format";
import { getGithubStatus, connectGithubToken, disconnectGithub } from "@/lib/github.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — LearnFlow Studio" },
      {
        name: "description",
        content: "Editor, playback, GitHub and workspace preferences for your account.",
      },
      { property: "og:title", content: "Settings — LearnFlow Studio" },
      { property: "og:description", content: "Tune your editor defaults and GitHub connection." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const getStatus = useServerFn(getGithubStatus);
  const connectToken = useServerFn(connectGithubToken);
  const disconnect = useServerFn(disconnectGithub);

  // GitHub token state
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);

  const query = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => {
      const { data } = await supabase.from("preferences").select("*").maybeSingle();
      return data;
    },
  });

  const ghQuery = useQuery({
    queryKey: ["github-status"],
    queryFn: () => getStatus({}),
  });

  const [form, setForm] = useState({
    default_language: "javascript",
    editor_font_size: 13,
    editor_tab_size: 2,
    playback_speed: 1,
    daily_target_minutes: 30,
    autosave: true,
    word_wrap: true,
    minimap: false,
  });

  useEffect(() => {
    if (query.data) {
      setForm({
        default_language: query.data.default_language ?? "javascript",
        editor_font_size: query.data.editor_font_size ?? 13,
        editor_tab_size: query.data.editor_tab_size ?? 2,
        playback_speed: Number(query.data.playback_speed ?? 1),
        daily_target_minutes: query.data.daily_target_minutes ?? 30,
        autosave: query.data.autosave ?? true,
        word_wrap: query.data.word_wrap ?? true,
        minimap: query.data.minimap ?? false,
      });
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("preferences")
        .upsert({ user_id: auth.user.id, ...form }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferences saved");
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
    onError: () => toast.error("Could not save preferences"),
  });

  const connectMutation = useMutation({
    mutationFn: async (token) => {
      const res = await connectToken({ data: { token } });
      if (!res.ok) throw new Error(res.error || "Failed to connect GitHub");
      return res;
    },
    onSuccess: (data) => {
      toast.success(`Connected to GitHub as @${data.login}!`);
      setTokenInput("");
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
    },
    onError: (err) => {
      toast.error(err.message || "Could not connect to GitHub");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect({}),
    onSuccess: () => {
      toast.success("GitHub disconnected");
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
    },
    onError: () => toast.error("Failed to disconnect GitHub"),
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const toggles = [
    { key: "autosave", label: "Autosave code", hint: "Save editor files as you type." },
    { key: "word_wrap", label: "Word wrap", hint: "Wrap long lines in the editor." },
    { key: "minimap", label: "Minimap", hint: "Show the editor minimap." },
  ];

  const ghConnected = ghQuery.data?.connected ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults applied to every lesson workspace and external integrations.
        </p>
      </div>

      {/* GitHub Integration Card */}
      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-muted text-foreground">
              <Github className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">GitHub Account</h2>
              <p className="text-xs text-muted-foreground">
                Push lesson code and synchronize repositories.
              </p>
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/github">
              GitHub Page
              <ExternalLink className="size-3 text-muted-foreground" />
            </Link>
          </Button>
        </div>

        {ghConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/80 bg-elevated/40 p-3.5">
            <div className="flex items-center gap-3">
              <Avatar className="size-9 border border-border">
                <AvatarImage
                  src={ghQuery.data?.avatarUrl || undefined}
                  alt={ghQuery.data?.login || "User"}
                />
                <AvatarFallback className="text-xs font-semibold bg-primary/20 text-primary">
                  {ghQuery.data?.login?.slice(0, 2).toUpperCase() || "GH"}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    @{ghQuery.data?.login}
                  </span>
                  <Badge
                    variant="outline"
                    className="h-5 text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  >
                    Connected
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Personal Access Token active</p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
            >
              <LogOut className="size-3.5" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-md border border-border/80 bg-elevated/40 p-3.5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="settings-gh-token" className="text-xs font-medium">
                  Connect Personal Access Token
                </Label>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=LearnFlow%20Studio"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <KeyRound className="size-3" />
                  Generate token on GitHub
                  <ExternalLink className="size-2.5" />
                </a>
              </div>

              <div className="relative flex items-center">
                <Input
                  id="settings-gh-token"
                  type={showToken ? "text" : "password"}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="h-8 font-mono text-xs pr-16"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-1 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-muted-foreground">
                Requires <code className="text-foreground">repo</code> &{" "}
                <code className="text-foreground">read:user</code> scopes.
              </p>

              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={!tokenInput.trim() || connectMutation.isPending}
                onClick={() => connectMutation.mutate(tokenInput.trim())}
              >
                {connectMutation.isPending ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Github className="size-3.5" />
                )}
                Connect
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Editor Preferences */}
      <div className="space-y-5 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-foreground">Editor Preferences</h2>

        <div className="space-y-2">
          <Label>Default language</Label>
          <Select
            value={form.default_language}
            onValueChange={(value) => setForm({ ...form, default_language: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.filter((language) => language.enabled).map((language) => (
                <SelectItem key={language.id} value={language.id}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Editor font size</Label>
            <Select
              value={String(form.editor_font_size)}
              onValueChange={(value) => setForm({ ...form, editor_font_size: Number(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[11, 12, 13, 14, 15, 16, 18].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tab size</Label>
            <Select
              value={String(form.editor_tab_size)}
              onValueChange={(value) => setForm({ ...form, editor_tab_size: Number(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 4, 8].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} spaces
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default playback speed</Label>
            <Select
              value={String(form.playback_speed)}
              onValueChange={(value) => setForm({ ...form, playback_speed: Number(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBACK_SPEEDS.map((speed) => (
                  <SelectItem key={speed} value={String(speed)}>
                    {speed}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Daily goal</Label>
            <Select
              value={String(form.daily_target_minutes)}
              onValueChange={(value) => setForm({ ...form, daily_target_minutes: Number(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[15, 30, 45, 60, 90, 120].map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} min / day
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          {toggles.map((toggle) => (
            <div
              key={toggle.key}
              className="flex items-center justify-between rounded-md border border-border bg-elevated/40 px-4 py-3"
            >
              <div>
                <p className="text-sm text-foreground">{toggle.label}</p>
                <p className="text-xs text-muted-foreground">{toggle.hint}</p>
              </div>
              <Button
                variant={form[toggle.key] ? "default" : "outline"}
                size="sm"
                onClick={() => setForm({ ...form, [toggle.key]: !form[toggle.key] })}
              >
                {form[toggle.key] ? "On" : "Off"}
              </Button>
            </div>
          ))}
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}

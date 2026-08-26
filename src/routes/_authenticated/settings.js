import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES } from "@/lib/languages";
import { PLAYBACK_SPEEDS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
      { title: "Settings — CodeStudy" },
      {
        name: "description",
        content: "Editor, playback and workspace preferences for your CodeStudy account.",
      },
      { property: "og:title", content: "Settings — CodeStudy" },
      { property: "og:description", content: "Tune your editor and playback defaults." },
    ],
  }),
  component: SettingsPage,
});
function SettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => {
      const { data } = await supabase.from("preferences").select("*").maybeSingle();
      return data;
    },
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
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults applied to every lesson workspace.
        </p>
      </div>

      <div className="space-y-5 rounded-lg border border-border bg-surface p-5">
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

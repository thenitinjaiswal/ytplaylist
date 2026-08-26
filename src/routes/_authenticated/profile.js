import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — CodeStudy" },
      { name: "description", content: "Your CodeStudy display name, avatar and account details." },
      { property: "og:title", content: "Profile — CodeStudy" },
      { property: "og:description", content: "Manage your CodeStudy profile." },
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
      return { profile: data, email: auth.user?.email ?? "" };
    },
  });
  const [form, setForm] = useState({ display_name: "", avatar_url: "" });
  useEffect(() => {
    if (query.data?.profile) {
      setForm({
        display_name: query.data.profile.display_name ?? "",
        avatar_url: query.data.profile.avatar_url ?? "",
      });
    }
  }, [query.data?.profile]);
  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: auth.user.id, ...form }, { onConflict: "id" });
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
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save profile
        </Button>
      </div>
    </div>
  );
}

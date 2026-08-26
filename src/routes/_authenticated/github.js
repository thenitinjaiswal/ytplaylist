import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, ExternalLink, UploadCloud, Key, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  getGithubStatus,
  disconnectGithub,
  listRepos,
  getGithubAuthUrl,
  connectGithub,
  connectGithubToken,
} from "@/lib/github.functions";
import { PushToGithubModal } from "@/components/push-to-github-modal";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/github")({
  validateSearch: (search) => ({
    code: search?.code ? String(search.code) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "GitHub — CodeStudy" },
      {
        name: "description",
        content: "Connect GitHub to commit and push the code you write in lesson workspaces.",
      },
      { property: "og:title", content: "GitHub — CodeStudy" },
      { property: "og:description", content: "Commit lesson code straight to your repositories." },
    ],
  }),
  component: GithubPage,
});

function GithubPage() {
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/_authenticated/github" });
  const navigate = useNavigate({ from: "/_authenticated/github" });

  const status = useServerFn(getGithubStatus);
  const repos = useServerFn(listRepos);
  const disconnect = useServerFn(disconnectGithub);
  const getAuthUrl = useServerFn(getGithubAuthUrl);
  const doConnectGithub = useServerFn(connectGithub);
  const doConnectToken = useServerFn(connectGithubToken);

  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  const statusQuery = useQuery({ queryKey: ["github-status"], queryFn: () => status({}) });
  const connected = statusQuery.data?.connected ?? false;
  const configured = statusQuery.data?.configured ?? false;

  const reposQuery = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => repos({}),
    enabled: connected,
  });

  // Handle OAuth code redirect callback from GitHub
  const connectCodeMutation = useMutation({
    mutationFn: async (code) => {
      const redirectUri = window.location.origin + window.location.pathname;
      const res = await doConnectGithub({ code, redirectUri });
      if (!res.ok) throw new Error(res.error || "Failed to connect GitHub.");
      return res;
    },
    onSuccess: (data) => {
      toast.success(`GitHub connected successfully as @${data.login}!`);
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      navigate({ search: {}, replace: true });
    },
    onError: (err) => {
      toast.error(err.message);
      navigate({ search: {}, replace: true });
    },
  });

  useEffect(() => {
    if (search.code && !connectCodeMutation.isPending && !connectCodeMutation.isSuccess) {
      connectCodeMutation.mutate(search.code);
    }
  }, [search.code]);

  const handleOAuthConnect = async () => {
    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const res = await getAuthUrl({ redirectUri });
      if (res.ok && res.url) {
        window.location.href = res.url;
      } else {
        toast.error(res.error || "GitHub OAuth is not configured in .env yet.");
      }
    } catch {
      toast.error("Could not initiate GitHub login.");
    }
  };

  const handleTokenConnect = useMutation({
    mutationFn: async () => {
      if (!tokenInput.trim()) throw new Error("Please enter a GitHub Personal Access Token.");
      const res = await doConnectToken({ token: tokenInput.trim() });
      if (!res.ok) throw new Error(res.error || "Failed to connect GitHub token.");
      return res;
    },
    onSuccess: (data) => {
      toast.success(`Connected to GitHub as @${data.login}!`);
      setTokenInput("");
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect({}),
    onSuccess: () => {
      toast.success("GitHub disconnected");
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
    },
  });

  if (statusQuery.isLoading || connectCodeMutation.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-52" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">GitHub Integration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Push the code you write in lessons directly to your GitHub repositories.
          </p>
        </div>
        <Button onClick={() => setPushModalOpen(true)} className="gap-2">
          <UploadCloud className="size-4" /> Push Code to GitHub
        </Button>
      </div>

      {!connected ? (
        <div className="space-y-4">
          {configured ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary p-2 text-primary-foreground">
                  <Github className="size-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    1-Click Direct GitHub Connect <Sparkles className="size-4 text-amber-500" />
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Connect your GitHub account instantly. No Personal Access Tokens or setup required!
                  </p>
                </div>
              </div>
              <Button onClick={handleOAuthConnect} size="lg" className="w-full sm:w-auto gap-2 font-medium">
                <Github className="size-5" /> Connect with GitHub (1-Click)
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                  <Github className="size-6" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">GitHub Integration Setup</h2>
                  <p className="text-xs text-muted-foreground">
                    To enable 1-Click OAuth Connect for all users, set <code className="bg-muted px-1 rounded">GITHUB_CLIENT_ID</code> and <code className="bg-muted px-1 rounded">GITHUB_CLIENT_SECRET</code> in <code className="bg-muted px-1 rounded">.env</code>.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <div className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <Key className="size-4 text-primary" /> Alternative: Connect using Personal Access Token (PAT)
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="ghp_... or github_pat_..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleTokenConnect.mutate()}
                    disabled={handleTokenConnect.isPending}
                  >
                    {handleTokenConnect.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Connect Token"
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Need a token?{" "}
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=CodeStudy"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Generate Personal Access Token <ExternalLink className="size-3" />
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
            <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Connected as <strong className="text-primary">@{statusQuery.data?.login}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Your lesson code can now be pushed directly to any of your GitHub repositories.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              Disconnect Account
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your GitHub Repositories
            </div>
            {reposQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(reposQuery.data && "repos" in reposQuery.data ? reposQuery.data.repos : []).map(
                  (repo) => (
                    <li key={repo.fullName} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {repo.fullName}
                      </span>
                      <span className="text-mono-xs text-muted-foreground">
                        {repo.defaultBranch}
                      </span>
                      <a
                        href={`https://github.com/${repo.fullName}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={`Open ${repo.fullName} on GitHub`}
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </>
      )}

      <PushToGithubModal
        open={pushModalOpen}
        onOpenChange={setPushModalOpen}
        files={[
          {
            path: "README.md",
            content: "# CodeStudy Project\n\nCreated with CodeStudy.",
          },
        ]}
        lessonTitle="CodeStudy Project"
      />
    </div>
  );
}


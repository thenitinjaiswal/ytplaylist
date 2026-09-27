import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Github,
  GitPullRequest,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  getGithubStatus,
  connectGithubToken,
  disconnectGithub,
  listRepos,
  createRepo,
} from "@/lib/github.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/github")({
  head: () => ({
    meta: [
      { title: "GitHub Integration — LearnFlow Studio" },
      {
        name: "description",
        content:
          "Connect your GitHub account to manage repositories and push lesson code directly from workspaces.",
      },
      { property: "og:title", content: "GitHub Integration — LearnFlow Studio" },
      {
        property: "og:description",
        content: "Commit lesson code straight to your GitHub repositories.",
      },
    ],
  }),
  component: GithubPage,
});

function GithubPage() {
  const queryClient = useQueryClient();
  const status = useServerFn(getGithubStatus);
  const repos = useServerFn(listRepos);
  const connectToken = useServerFn(connectGithubToken);
  const disconnect = useServerFn(disconnectGithub);
  const createNewRepo = useServerFn(createRepo);

  // Connection form state
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);

  // Create repo state
  const [createRepoOpen, setCreateRepoOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [newRepoAutoInit, setNewRepoAutoInit] = useState(true);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [copiedRepo, setCopiedRepo] = useState(null);

  const statusQuery = useQuery({
    queryKey: ["github-status"],
    queryFn: () => status({}),
  });

  const connected = statusQuery.data?.connected ?? false;

  const reposQuery = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => repos({}),
    enabled: connected,
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
      toast.error(err.message || "Could not connect to GitHub. Check your token.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect({}),
    onSuccess: () => {
      toast.success("GitHub disconnected");
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      setDisconnectConfirmOpen(false);
    },
    onError: () => toast.error("Failed to disconnect GitHub"),
  });

  const createRepoMutation = useMutation({
    mutationFn: async () => {
      const res = await createNewRepo({
        data: {
          name: newRepoName.trim(),
          description: newRepoDesc.trim() || undefined,
          isPrivate: newRepoPrivate,
          autoInit: newRepoAutoInit,
        },
      });
      if (!res.ok) throw new Error(res.error || "Failed to create repository");
      return res;
    },
    onSuccess: (res) => {
      toast.success(`Repository ${res.repo.fullName} created on GitHub!`);
      setCreateRepoOpen(false);
      setNewRepoName("");
      setNewRepoDesc("");
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
    },
    onError: (err) => {
      toast.error(err.message || "Could not create repository");
    },
  });

  const handleCopyClone = (fullName) => {
    navigator.clipboard.writeText(`git clone https://github.com/${fullName}.git`);
    setCopiedRepo(fullName);
    toast.success("Clone command copied to clipboard!");
    setTimeout(() => setCopiedRepo(null), 2500);
  };

  if (statusQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const allRepos =
    (reposQuery.data && "repos" in reposQuery.data ? reposQuery.data.repos : []) || [];
  const filteredRepos = allRepos.filter((repo) => {
    const matchesSearch =
      repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      repo.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;
    if (visibilityFilter === "public") return !repo.private;
    if (visibilityFilter === "private") return repo.private;
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
            <Github className="size-7 text-primary" />
            GitHub Integration
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your personal GitHub account to manage repositories, push lesson code, and build
            your developer portfolio.
          </p>
        </div>

        {connected && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => reposQuery.refetch()}
              disabled={reposQuery.isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${reposQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateRepoOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              New Repository
            </Button>
          </div>
        )}
      </div>

      {/* Disconnected State: Connect Token Form */}
      {!connected ? (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-b from-card to-background p-6 shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <Sparkles className="size-3.5" />
                  Direct GitHub Connection
                </div>
                <h2 className="text-xl font-semibold text-foreground">
                  Connect your GitHub Account
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Connect using a GitHub Personal Access Token (PAT). This allows LearnFlow Studio
                  to load your existing repositories, create new ones, and commit your workspace
                  code directly to your GitHub profile.
                </p>
              </div>

              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=LearnFlow%20Studio"
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <KeyRound className="size-4 text-primary" />
                Generate Token on GitHub
                <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            </div>

            {/* Token Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tokenInput.trim()) {
                  connectMutation.mutate(tokenInput.trim());
                }
              }}
              className="mt-6 space-y-4 rounded-lg border border-border/70 bg-card/60 p-4"
            >
              <div className="space-y-2">
                <Label htmlFor="gh-token" className="text-sm font-medium">
                  GitHub Personal Access Token (Classic or Fine-Grained)
                </Label>
                <div className="relative flex items-center">
                  <Input
                    id="gh-token"
                    type={showToken ? "text" : "password"}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_xxxxxxxxxxxxxxxxxxxx"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="pr-24 font-mono text-sm"
                    autoComplete="off"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowToken(!showToken)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      title={showToken ? "Hide token" : "Show token"}
                    >
                      {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  Required scopes:{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-foreground font-mono">
                    repo
                  </code>{" "}
                  (for committing code) and{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-foreground font-mono">
                    read:user
                  </code>{" "}
                  (for profile info).
                </p>

                <Button
                  type="submit"
                  disabled={!tokenInput.trim() || connectMutation.isPending}
                  className="gap-2"
                >
                  {connectMutation.isPending ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Github className="size-4" />
                      Connect GitHub
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Quick 3-Step Guide */}
            <div className="mt-6 grid gap-4 border-t border-border/60 pt-5 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    1
                  </span>
                  Create Token
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Click the button above to open GitHub’s token page with pre-selected scopes.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    2
                  </span>
                  Generate & Copy
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Click &ldquo;Generate token&rdquo; at the bottom of the page and copy the
                  generated token string.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    3
                  </span>
                  Connect & Sync
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Paste the token above. You can now commit directly to your GitHub from any lesson!
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Connected State */
        <div className="space-y-6">
          {/* User Profile Card */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <Avatar className="size-14 border border-border shadow-sm">
                <AvatarImage
                  src={statusQuery.data?.avatarUrl || undefined}
                  alt={statusQuery.data?.login || "User"}
                />
                <AvatarFallback className="bg-primary/20 text-primary font-semibold text-lg">
                  {statusQuery.data?.login?.slice(0, 2).toUpperCase() || "GH"}
                </AvatarFallback>
              </Avatar>

              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-foreground">
                    {statusQuery.data?.name || statusQuery.data?.login}
                  </h2>
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  >
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </Badge>
                </div>

                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <a
                    href={
                      statusQuery.data?.htmlUrl || `https://github.com/${statusQuery.data?.login}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono hover:text-foreground transition-colors"
                  >
                    @{statusQuery.data?.login}
                    <ExternalLink className="size-3" />
                  </a>

                  <span>•</span>
                  <span>{allRepos.length} Repositories loaded</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDisconnectConfirmOpen(true)}
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="size-3.5" />
                Disconnect
              </Button>
            </div>
          </div>

          {/* Repositories Section */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-wide uppercase text-foreground">
                  Your Repositories ({filteredRepos.length})
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search repositories..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 w-48 pl-8 text-xs sm:w-64"
                  />
                </div>

                {/* Filter */}
                <div className="flex rounded-md border border-border bg-background p-0.5 text-xs">
                  <button
                    onClick={() => setVisibilityFilter("all")}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      visibilityFilter === "all"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setVisibilityFilter("public")}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      visibilityFilter === "public"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Public
                  </button>
                  <button
                    onClick={() => setVisibilityFilter("private")}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      visibilityFilter === "private"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Private
                  </button>
                </div>
              </div>
            </div>

            {/* Repos List */}
            {reposQuery.isLoading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="p-12 text-center">
                <Github className="mx-auto size-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {searchTerm ? "No repositories match your search" : "No repositories found"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {searchTerm
                    ? "Try searching for a different keyword or change visibility filter."
                    : "Create your first repository using the button above."}
                </p>
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchTerm("");
                      setVisibilityFilter("all");
                    }}
                    className="mt-3"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredRepos.map((repo) => (
                  <div
                    key={repo.id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={repo.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-sm text-foreground hover:text-primary transition-colors hover:underline inline-flex items-center gap-1.5"
                        >
                          {repo.fullName}
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </a>

                        <Badge
                          variant={repo.private ? "secondary" : "outline"}
                          className="text-[10px] uppercase font-mono tracking-wider h-5"
                        >
                          {repo.private ? (
                            <span className="flex items-center gap-1">
                              <Lock className="size-2.5" /> Private
                            </span>
                          ) : (
                            "Public"
                          )}
                        </Badge>

                        {repo.language && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="size-2 rounded-full bg-primary/70" />
                            {repo.language}
                          </span>
                        )}
                      </div>

                      {repo.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {repo.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <GitBranch className="size-3" />
                          {repo.defaultBranch}
                        </span>
                        {repo.updatedAt && (
                          <span>Updated {new Date(repo.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyClone(repo.fullName)}
                        className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        title="Copy git clone URL"
                      >
                        {copiedRepo === repo.fullName ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        Clone
                      </Button>

                      <a
                        href={repo.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted transition-colors gap-1.5"
                      >
                        Open
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Repo Dialog */}
      <Dialog open={createRepoOpen} onOpenChange={setCreateRepoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="size-5 text-primary" />
              Create a new GitHub repository
            </DialogTitle>
            <DialogDescription>
              Create a new repository directly under your GitHub account @{statusQuery.data?.login}.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newRepoName.trim()) {
                createRepoMutation.mutate();
              }
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-2">
              <Label htmlFor="repo-name">Repository name</Label>
              <Input
                id="repo-name"
                placeholder="my-awesome-project"
                value={newRepoName}
                onChange={(e) =>
                  setNewRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-"))
                }
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Will be created as:{" "}
                <span className="font-mono text-foreground">
                  {statusQuery.data?.login}/{newRepoName || "repo-name"}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="repo-desc">Description (optional)</Label>
              <Input
                id="repo-desc"
                placeholder="Repository created from LearnFlow Studio"
                value={newRepoDesc}
                onChange={(e) => setNewRepoDesc(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="private-toggle" className="text-sm font-medium">
                  Private repository
                </Label>
                <p className="text-xs text-muted-foreground">
                  Only you and authorized collaborators can see this repository.
                </p>
              </div>
              <Switch
                id="private-toggle"
                checked={newRepoPrivate}
                onCheckedChange={setNewRepoPrivate}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="readme-toggle" className="text-sm font-medium">
                  Initialize with README
                </Label>
                <p className="text-xs text-muted-foreground">
                  Creates an initial commit with a README file.
                </p>
              </div>
              <Switch
                id="readme-toggle"
                checked={newRepoAutoInit}
                onCheckedChange={setNewRepoAutoInit}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateRepoOpen(false)}
                disabled={createRepoMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newRepoName.trim() || createRepoMutation.isPending}
                className="gap-2"
              >
                {createRepoMutation.isPending ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="size-4" />
                    Create Repository
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disconnect Alert Dialog */}
      <AlertDialog open={disconnectConfirmOpen} onOpenChange={setDisconnectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your GitHub connection from LearnFlow Studio. You won’t be able to
              push lesson code or view your repositories until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? "Disconnecting..." : "Yes, disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

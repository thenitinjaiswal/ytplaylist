import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  FolderGit2,
  Github,
  GitBranch,
  GitCommit,
  Key,
  Loader2,
  Plus,
} from "lucide-react";
import {
  commitAndPush,
  connectGithubToken,
  createRepo,
  getGithubAuthUrl,
  getGithubStatus,
  listRepos,
} from "@/lib/github.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function PushToGithubModal({
  open,
  onOpenChange,
  files = [],
  lessonTitle = "Lesson Workspace",
  lessonId = null,
}) {
  const queryClient = useQueryClient();
  const getStatus = useServerFn(getGithubStatus);
  const getAuthUrl = useServerFn(getGithubAuthUrl);
  const getRepos = useServerFn(listRepos);
  const saveToken = useServerFn(connectGithubToken);
  const makeRepo = useServerFn(createRepo);
  const doPush = useServerFn(commitAndPush);

  const [tokenInput, setTokenInput] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [branch, setBranch] = useState("main");
  const [commitMessage, setCommitMessage] = useState("");
  const [directory, setDirectory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["github-status"],
    queryFn: () => getStatus({}),
    enabled: open,
  });

  const reposQuery = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => getRepos({}),
    enabled: open && Boolean(statusQuery.data?.connected),
  });

  useEffect(() => {
    if (open) {
      setCommitMessage(`Commit code: ${lessonTitle || "Lesson workspace"}`);
      if (lessonTitle) {
        const slug = lessonTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        setNewRepoName(slug ? `codestudy-${slug}` : "codestudy-workspace");
      }
    }
  }, [open, lessonTitle]);

  useEffect(() => {
    if (reposQuery.data?.repos?.length > 0 && !selectedRepo) {
      setSelectedRepo(reposQuery.data.repos[0].fullName);
    }
  }, [reposQuery.data?.repos, selectedRepo]);

  const handleConnectToken = useMutation({
    mutationFn: async () => {
      if (!tokenInput.trim()) throw new Error("Please enter a GitHub Personal Access Token.");
      const res = await saveToken({ token: tokenInput.trim() });
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

  const handleOAuthConnect = async () => {
    try {
      const res = await getAuthUrl({ redirectUri: window.location.href });
      if (res.ok && res.url) {
        window.location.href = res.url;
      } else {
        toast.error(res.error || "GitHub OAuth is not configured.");
      }
    } catch {
      toast.error("Could not initiate GitHub login.");
    }
  };

  const handlePush = async () => {
    if (files.length === 0) {
      toast.error("No workspace files to push.");
      return;
    }

    setSubmitting(true);
    try {
      let targetFullName = selectedRepo;

      // Create new repository if selected option is __new__
      if (selectedRepo === "__new__" || !selectedRepo) {
        if (!newRepoName.trim()) {
          toast.error("Please enter a repository name.");
          setSubmitting(false);
          return;
        }

        const createRes = await makeRepo({
          name: newRepoName.trim(),
          description: `CodeStudy workspace code for ${lessonTitle}`,
          isPrivate,
        });

        if (!createRes.ok || !createRes.repo) {
          throw new Error(createRes.error || "Failed to create new repository on GitHub.");
        }

        targetFullName = createRes.repo.fullName;
        toast.success(`Repository ${targetFullName} created on GitHub!`);
      }

      // Prepare files array
      const filesToPush = files.map((f) => ({
        path: f.path,
        content: f.content ?? "",
      }));

      // Execute Commit and Push
      const pushRes = await doPush({
        fullName: targetFullName,
        branch: branch.trim() || "main",
        message: commitMessage.trim() || `Update ${lessonTitle}`,
        directory: directory.trim() || undefined,
        lessonId: lessonId || null,
        files: filesToPush,
      });

      if (!pushRes.ok) {
        throw new Error(pushRes.error || "Failed to push commit to GitHub.");
      }

      toast.success("Code pushed to GitHub successfully!", {
        description: `Repository: ${targetFullName}`,
        action: pushRes.url
          ? {
              label: "View Commit",
              onClick: () => window.open(pushRes.url, "_blank"),
            }
          : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Push failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const isConnected = Boolean(statusQuery.data?.connected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Github className="size-5 text-primary" /> Push Code to GitHub
          </DialogTitle>
          <DialogDescription>
            Commit and push your workspace files directly to your GitHub repositories.
          </DialogDescription>
        </DialogHeader>

        {statusQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !isConnected ? (
          <div className="space-y-4 py-2">
            {statusQuery.data?.configured ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-3">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Github className="size-5 text-primary" /> Connect GitHub with 1-Click
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Authorize your GitHub account in 1 click to commit and push code directly.
                </p>
                <Button onClick={handleOAuthConnect} className="w-full gap-2 font-medium">
                  <Github className="size-4" /> Connect with GitHub (1-Click)
                </Button>
              </div>
            ) : null}

            <div className="rounded-lg border border-border bg-surface p-4 text-sm space-y-3">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Key className="size-4 text-primary" /> Connect with Personal Access Token (PAT)
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Enter your token with <code className="text-foreground bg-muted px-1 rounded">repo</code> scope.
                </span>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=CodeStudy"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                >
                  Generate Token <ExternalLink className="size-3" />
                </a>
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
                  onClick={() => handleConnectToken.mutate()}
                  disabled={handleConnectToken.isPending}
                >
                  {handleConnectToken.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Connect Token"
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-sm">
            {/* Connected User Badge */}
            <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                {statusQuery.data?.avatarUrl ? (
                  <img
                    src={statusQuery.data.avatarUrl}
                    alt=""
                    className="size-5 rounded-full"
                  />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
                <span>Connected as <strong className="text-foreground">@{statusQuery.data?.login}</strong></span>
              </div>
              <a
                href={`https://github.com/${statusQuery.data?.login}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                Profile <ExternalLink className="size-3" />
              </a>
            </div>

            {/* Repository Select */}
            <div className="space-y-2">
              <Label className="text-xs">Target Repository</Label>
              <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select or create a repository..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">
                    <span className="flex items-center gap-2 text-primary font-medium">
                      <Plus className="size-3.5" /> + Create New Repository
                    </span>
                  </SelectItem>
                  {reposQuery.data?.repos?.map((repo) => (
                    <SelectItem key={repo.fullName} value={repo.fullName}>
                      <span className="flex items-center gap-2">
                        <FolderGit2 className="size-3.5 text-muted-foreground" />
                        {repo.fullName} {repo.private ? "(Private)" : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* New Repo Form if __new__ selected */}
            {(selectedRepo === "__new__" || reposQuery.data?.repos?.length === 0) && (
              <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-repo" className="text-xs">New Repository Name</Label>
                  <Input
                    id="new-repo"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="my-coding-course"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Label htmlFor="private-toggle" className="text-xs cursor-pointer">
                    Private Repository
                  </Label>
                  <Switch
                    id="private-toggle"
                    checked={isPrivate}
                    onCheckedChange={setIsPrivate}
                  />
                </div>
              </div>
            )}

            {/* Branch & Subfolder */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="branch-input" className="text-xs flex items-center gap-1">
                  <GitBranch className="size-3 text-muted-foreground" /> Branch
                </Label>
                <Input
                  id="branch-input"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dir-input" className="text-xs">
                  Directory / Folder (Optional)
                </Label>
                <Input
                  id="dir-input"
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  placeholder="lessons/lesson-1"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Commit Message */}
            <div className="space-y-1.5">
              <Label htmlFor="commit-msg" className="text-xs flex items-center gap-1">
                <GitCommit className="size-3 text-muted-foreground" /> Commit Message
              </Label>
              <Input
                id="commit-msg"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit lesson workspace files"
              />
            </div>

            {/* File List Summary */}
            <div className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground flex items-center justify-between">
              <span>Pushing <strong>{files.length}</strong> file(s):</span>
              <span className="font-mono text-foreground truncate max-w-[200px]">
                {files.map((f) => f.path.split("/").pop()).join(", ")}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {isConnected ? (
            <Button onClick={handlePush} disabled={submitting || files.length === 0} className="gap-2">
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Github className="size-4" />
              )}
              {submitting ? "Pushing…" : "Push to GitHub"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

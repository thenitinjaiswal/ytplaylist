import { useEffect, useState, useMemo } from "react";
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
  Loader2,
  Plus,
  FileCode2,
  Folder,
  Layers,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import {
  commitAndPush,
  createRepo,
  getGithubStatus,
  listRepos,
} from "@/lib/github.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Link } from "@tanstack/react-router";

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanLessonFolderName(position, title) {
  const cleanTitle = (title || "lesson")
    .split("|")[0]
    .trim()
    .replace(/^[0-9]+[.\-:\s]*/, "");
  const num = String(position + 1).padStart(2, "0");
  const slug = slugify(cleanTitle) || `lesson-${num}`;
  return `${num}-${slug}`;
}

export function ProjectsPushModal({
  open,
  onOpenChange,
  selectedItems = [], // Array of { lesson, course, files }
  defaultCourseTitle = "",
}) {
  const queryClient = useQueryClient();
  const getStatus = useServerFn(getGithubStatus);
  const getRepos = useServerFn(listRepos);
  const makeRepo = useServerFn(createRepo);
  const doPush = useServerFn(commitAndPush);

  const [selectedRepo, setSelectedRepo] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [branch, setBranch] = useState("main");
  const [commitMessage, setCommitMessage] = useState("");
  const [rootDirectory, setRootDirectory] = useState("");
  const [organizeByLesson, setOrganizeByLesson] = useState(true);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["github-status"],
    queryFn: () => getStatus({}),
    enabled: open,
  });

  const isConnected = Boolean(statusQuery.data?.connected);

  const reposQuery = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => getRepos({}),
    enabled: open && isConnected,
  });

  // Calculate prepared files with destination paths
  const preparedFiles = useMemo(() => {
    const list = [];
    const baseDir = (rootDirectory || "").trim().replace(/^\/+|\/+$/g, "");

    for (const item of selectedItems) {
      const lessonFolderName = cleanLessonFolderName(
        item.lesson?.position ?? 0,
        item.lesson?.title ?? "lesson",
      );

      for (const file of item.files || []) {
        let destPath = file.path;
        if (organizeByLesson) {
          destPath = `${lessonFolderName}/${file.path.replace(/^\/+/, "")}`;
        }
        if (baseDir) {
          destPath = `${baseDir}/${destPath}`;
        }
        list.push({
          originalPath: file.path,
          destPath,
          content: file.content ?? "",
          language: file.language,
          lessonTitle: item.lesson?.title,
          courseTitle: item.course?.title,
        });
      }
    }
    return list;
  }, [selectedItems, rootDirectory, organizeByLesson]);

  // Set default repo name and commit message when opened
  useEffect(() => {
    if (open && selectedItems.length > 0) {
      const courseTitle = defaultCourseTitle || selectedItems[0]?.course?.title || "CodeStudy";
      const courseSlug = slugify(courseTitle);
      setNewRepoName(courseSlug ? `learnflow-${courseSlug}` : "learnflow-workspace");
      setNewRepoDesc(`Course code and exercises for ${courseTitle}`);

      if (selectedItems.length === 1) {
        setCommitMessage(`Update code for ${selectedItems[0]?.lesson?.title || "lesson"}`);
      } else {
        setCommitMessage(
          `Update ${selectedItems.length} lessons code (${courseTitle})`,
        );
      }
    }
  }, [open, selectedItems, defaultCourseTitle]);

  // Select first repo by default
  useEffect(() => {
    if (reposQuery.data?.repos?.length > 0 && !selectedRepo) {
      setSelectedRepo(reposQuery.data.repos[0].fullName);
    }
  }, [reposQuery.data?.repos, selectedRepo]);

  const handlePush = async () => {
    if (preparedFiles.length === 0) {
      toast.error("No files found to push.");
      return;
    }

    if (!selectedRepo && !newRepoName.trim()) {
      toast.error("Please select or create a GitHub repository.");
      return;
    }

    setSubmitting(true);
    try {
      let targetFullName = selectedRepo;

      // Create new repo if needed
      if (selectedRepo === "__new__" || !selectedRepo) {
        if (!newRepoName.trim()) {
          toast.error("Please enter a repository name.");
          setSubmitting(false);
          return;
        }

        const createRes = await makeRepo({
          data: {
            name: newRepoName.trim(),
            description: newRepoDesc.trim() || undefined,
            isPrivate,
            autoInit: true,
          },
        });

        if (!createRes.ok || !createRes.repo) {
          throw new Error(createRes.error || "Failed to create new repository on GitHub.");
        }

        targetFullName = createRes.repo.fullName;
        toast.success(`Repository ${targetFullName} created on GitHub!`);
      }

      // Execute Commit & Push
      const filesToPush = preparedFiles.map((f) => ({
        path: f.destPath,
        content: f.content,
      }));

      const pushRes = await doPush({
        data: {
          fullName: targetFullName,
          branch: branch.trim() || "main",
          message: commitMessage.trim() || `Update ${selectedItems.length} lesson files`,
          files: filesToPush,
        },
      });

      if (!pushRes.ok) {
        throw new Error(pushRes.error || "Failed to push code to GitHub.");
      }

      toast.success(
        `Pushed ${filesToPush.length} files across ${selectedItems.length} lesson(s) to GitHub!`,
        {
          description: `Repository: ${targetFullName}`,
          action: pushRes.url
            ? {
                label: "View Commit",
                onClick: () => window.open(pushRes.url, "_blank"),
              }
            : undefined,
          duration: 6000,
        },
      );

      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Failed to push code to GitHub.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalLessons = selectedItems.length;
  const totalFiles = preparedFiles.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Github className="size-5 text-primary" />
            Push Code to GitHub
          </DialogTitle>
          <DialogDescription>
            Commit and push your saved lesson files to your GitHub repository.
          </DialogDescription>
        </DialogHeader>

        {!isConnected && !statusQuery.isLoading ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 space-y-3">
            <div className="flex items-center gap-2 font-medium">
              <Github className="size-4" />
              GitHub is not connected yet
            </div>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Connect your GitHub account using a Personal Access Token to push files directly to your repositories.
            </p>
            <Link
              to="/github"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 transition"
            >
              Connect GitHub Now <ExternalLink className="size-3" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Selected Summary Card */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface/80 p-3.5 text-xs">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                <div>
                  <span className="font-semibold text-foreground">
                    {totalLessons} {totalLessons === 1 ? "Lesson" : "Lessons"} Selected
                  </span>
                  <span className="text-muted-foreground ml-1.5">({totalFiles} files total)</span>
                </div>
              </div>
              <Badge variant="outline" className="text-mono-xs">
                {defaultCourseTitle || selectedItems[0]?.course?.title || "Workspace"}
              </Badge>
            </div>

            {/* Target Repository Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Target Repository</Label>
              <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select repository..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="__new__" className="font-medium text-primary">
                    <span className="flex items-center gap-1.5">
                      <Plus className="size-3.5" /> + Create New Repository
                    </span>
                  </SelectItem>
                  {(reposQuery.data?.repos || []).map((repo) => (
                    <SelectItem key={repo.id} value={repo.fullName}>
                      <span className="flex items-center gap-2">
                        <FolderGit2 className="size-3.5 text-muted-foreground" />
                        {repo.fullName}
                        {repo.private ? (
                          <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                            Private
                          </Badge>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* New Repo Fields */}
            {selectedRepo === "__new__" || (!selectedRepo && !reposQuery.data?.repos?.length) ? (
              <div className="space-y-3 rounded-lg border border-border bg-elevated/40 p-3.5 text-xs">
                <div className="space-y-1.5">
                  <Label htmlFor="new-repo-name" className="text-xs">
                    New Repository Name
                  </Label>
                  <Input
                    id="new-repo-name"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="learnflow-dsa-java"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-repo-desc" className="text-xs">
                    Description (optional)
                  </Label>
                  <Input
                    id="new-repo-desc"
                    value={newRepoDesc}
                    onChange={(e) => setNewRepoDesc(e.target.value)}
                    placeholder="Exercises and code for course"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Label htmlFor="repo-privacy" className="text-xs cursor-pointer">
                    Private Repository
                  </Label>
                  <Switch
                    id="repo-privacy"
                    checked={isPrivate}
                    onCheckedChange={setIsPrivate}
                  />
                </div>
              </div>
            ) : null}

            {/* Branch and Directory Options */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="branch" className="text-xs">
                  Branch
                </Label>
                <div className="relative">
                  <GitBranch className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    id="branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="h-8 pl-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="root-dir" className="text-xs">
                  Folder Prefix (optional)
                </Label>
                <div className="relative">
                  <Folder className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    id="root-dir"
                    value={rootDirectory}
                    onChange={(e) => setRootDirectory(e.target.value)}
                    placeholder="e.g. java-dsa"
                    className="h-8 pl-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Folder Structure Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-xs">
              <div className="space-y-0.5 pr-2">
                <div className="font-medium text-foreground">Organize by Lesson Folders</div>
                <div className="text-[11px] text-muted-foreground">
                  Creates folders like <code className="text-primary font-mono text-[10px]">01-hello-world/src/Main.java</code>
                </div>
              </div>
              <Switch
                checked={organizeByLesson}
                onCheckedChange={setOrganizeByLesson}
              />
            </div>

            {/* Commit Message */}
            <div className="space-y-1.5">
              <Label htmlFor="commit-msg" className="text-xs">
                Commit Message
              </Label>
              <div className="relative">
                <GitCommit className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  id="commit-msg"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Update lesson code"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            {/* File List Collapsible Preview */}
            <div className="rounded-lg border border-border bg-elevated/20 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowFilePreview(!showFilePreview)}
                className="flex w-full items-center justify-between p-2.5 text-left font-medium hover:bg-surface/50 transition"
              >
                <span className="flex items-center gap-1.5">
                  <FileCode2 className="size-3.5 text-primary" />
                  Files to be pushed ({preparedFiles.length})
                </span>
                {showFilePreview ? (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
              </button>

              {showFilePreview ? (
                <div className="max-h-44 overflow-y-auto border-t border-border p-2 space-y-1">
                  {preparedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded bg-surface px-2 py-1 font-mono text-[11px] text-muted-foreground"
                    >
                      <span className="truncate pr-2 text-foreground/90">
                        {file.destPath}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                        {file.language || "text"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handlePush}
            disabled={submitting || !isConnected || preparedFiles.length === 0}
            className="gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Pushing {preparedFiles.length} files...
              </>
            ) : (
              <>
                <Github className="size-3.5" />
                Push {preparedFiles.length} Files to GitHub
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

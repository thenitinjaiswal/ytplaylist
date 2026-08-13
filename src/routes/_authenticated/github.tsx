import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getGithubStatus, disconnectGithub, listRepos } from "@/lib/github.functions";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/github")({
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
  const status = useServerFn(getGithubStatus);
  const repos = useServerFn(listRepos);
  const disconnect = useServerFn(disconnectGithub);

  const statusQuery = useQuery({ queryKey: ["github-status"], queryFn: () => status({}) });
  const connected = statusQuery.data?.connected ?? false;

  const reposQuery = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => repos({}),
    enabled: connected,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect({}),
    onSuccess: () => {
      toast.success("GitHub disconnected");
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
    },
  });

  if (statusQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-52" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">GitHub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Push the code you write in lessons to your own repositories.
        </p>
      </div>

      {!connected ? (
        <EmptyState
          icon={Github}
          title="GitHub not connected"
          description="Add a personal access token with repo scope in Settings to enable commit and push from any lesson workspace."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
            <Github className="size-5 text-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Connected as {statusQuery.data?.login ?? "GitHub user"}
              </p>
              <p className="text-xs text-muted-foreground">
                Commits are made through the GitHub API using your token.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              Disconnect
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Repositories
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
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

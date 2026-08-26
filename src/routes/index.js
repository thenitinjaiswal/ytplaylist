import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Code2, FileText, Github, PlayCircle, Terminal, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CodeStudy — Learn to code from YouTube playlists" },
      {
        name: "description",
        content:
          "CodeStudy turns public YouTube coding playlists into structured courses with a video player, code editor, sandboxed terminal, notes and GitHub commits.",
      },
      { property: "og:title", content: "CodeStudy — Learn to code from YouTube playlists" },
      {
        property: "og:description",
        content:
          "One workspace to watch, code, take timestamped notes, track streaks and push to GitHub.",
      },
    ],
  }),
  component: Landing,
});
const FEATURES = [
  {
    icon: PlayCircle,
    title: "Playlist to course",
    body: "Paste any public playlist URL. Lessons, durations and thumbnails are imported and ordered for you.",
  },
  {
    icon: Terminal,
    title: "Sandboxed runs",
    body: "Run JavaScript, TypeScript, Python, Go, Rust and more in an isolated runtime with stdin and args.",
  },
  {
    icon: FileText,
    title: "Timestamped notes",
    body: "Markdown notes with slash commands. Every timestamp jumps the video back to the exact moment.",
  },
  {
    icon: Github,
    title: "Real commits",
    body: "Connect GitHub, pick a repo and push your lesson files as a proper multi-file commit.",
  },
  {
    icon: Timer,
    title: "Streaks and pacing",
    body: "Daily targets, watch time and an estimated finish date for every course you're working through.",
  },
  {
    icon: Code2,
    title: "IDE workspace",
    body: "Resizable panes, file tabs, version snapshots and a command palette on ⌘K.",
  },
];
function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-5">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Code2 className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">CodeStudy</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 0%, var(--color-primary), transparent 45%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-5 py-24 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-mono-xs text-muted-foreground">
              YouTube playlists → structured courses
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              Stop tab-switching between tutorials and your editor.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
              CodeStudy puts the video, a real code editor, a sandboxed terminal and Notion-style
              notes in one resizable workspace — with progress, streaks and GitHub built in.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/auth">
                  Start learning <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">I already have an account</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
            Everything a tutorial should have shipped with
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-ring/40"
              >
                <div className="flex size-9 items-center justify-center rounded-md bg-elevated text-primary">
                  <feature.icon className="size-4" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-5 text-mono-xs text-muted-foreground">
          CodeStudy — code runs in an isolated sandbox, never on your machine.
        </div>
      </footer>
    </div>
  );
}

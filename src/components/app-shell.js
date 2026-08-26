import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Code2,
  FileText,
  Flame,
  Github,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { usePaletteActions } from "@/hooks/use-palette-actions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/courses", label: "Courses", icon: BookOpen },
  { to: "/projects", label: "Projects", icon: Code2 },
  { to: "/notes", label: "Notes", icon: FileText },
  { to: "/github", label: "GitHub", icon: Github },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate, collapsed }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        const linkEl = (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center rounded-md text-sm font-medium transition-colors",
              collapsed ? "size-10 justify-center mx-auto" : "gap-2.5 px-2.5 py-2",
              active
                ? "bg-elevated text-foreground"
                : "text-muted-foreground hover:bg-elevated/60 hover:text-foreground",
            )}
          >
            <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );

        if (collapsed) {
          return (
            <Tooltip key={item.to} delayDuration={100}>
              <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        }

        return linkEl;
      })}
    </nav>
  );
}

function Sidebar({ onNavigate, collapsed, onToggle }) {
  return (
    <div className="flex h-full flex-col gap-5 p-3">
      <div
        className={cn(
          "flex items-center pt-1 px-1",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Code2 className="size-4" />
          </div>
          {!collapsed && <span className="text-sm font-semibold tracking-tight">CodeStudy</span>}
        </Link>
        {!collapsed && onToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>

      {collapsed ? (
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Button asChild size="icon" className="size-10 mx-auto">
              <Link to="/courses/new" onClick={onNavigate}>
                <Plus className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Import playlist</TooltipContent>
        </Tooltip>
      ) : (
        <Button asChild size="sm" className="mx-1 justify-start gap-2">
          <Link to="/courses/new" onClick={onNavigate}>
            <Plus className="size-4" /> Import playlist
          </Link>
        </Button>
      )}

      <NavLinks onNavigate={onNavigate} collapsed={collapsed} />

      <div
        className={cn(
          "mt-auto px-2.5 pb-2 text-mono-xs text-muted-foreground",
          collapsed && "text-center",
        )}
      >
        {collapsed ? (
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <kbd className="rounded border border-border bg-elevated px-1.5 py-0.5 cursor-pointer">
                ⌘K
              </kbd>
            </TooltipTrigger>
            <TooltipContent side="right">Command menu (⌘K)</TooltipContent>
          </Tooltip>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-elevated px-1.5 py-0.5">⌘K</kbd>
            commands
          </span>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { open, setOpen } = useCommandPalette();
  const paletteActions = usePaletteActions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("codestudy_sidebar_collapsed") === "true";
    }
    return false;
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("codestudy_sidebar_collapsed", String(next));
      }
      return next;
    });
  };

  const initials =
    user?.user_metadata?.["full_name"]
      ?.split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("") ??
    user?.email?.[0]?.toUpperCase() ??
    "?";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen bg-background">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface transition-all duration-300 ease-in-out lg:block",
            collapsed ? "w-16" : "w-60",
          )}
        >
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
            {/* Mobile menu button */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-border bg-surface p-0">
                <Sidebar onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            {/* Desktop sidebar toggle button */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex"
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4 text-muted-foreground" />
              ) : (
                <PanelLeft className="size-4 text-muted-foreground" />
              )}
            </Button>

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-elevated/50 px-3 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground md:max-w-sm"
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate">Search or jump to…</span>
              <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-mono-xs md:inline">
                ⌘K
              </kbd>
            </button>

            <div className="ml-auto flex items-center gap-1.5">
              <Link
                to="/dashboard"
                className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-mono-xs text-muted-foreground transition-colors hover:text-foreground sm:flex"
              >
                <Flame className="size-3.5 text-warning" /> streak
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-full bg-elevated text-xs font-semibold uppercase text-foreground ring-1 ring-border transition-shadow hover:ring-ring/50"
                    aria-label="Account menu"
                  >
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <User className="mr-2 size-4" /> Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings className="mr-2 size-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleSignOut}>
                    <LogOut className="mr-2 size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="min-w-0 flex-1">{children}</main>
        </div>

        <CommandPalette open={open} onOpenChange={setOpen} actions={paletteActions} />
      </div>
    </TooltipProvider>
  );
}

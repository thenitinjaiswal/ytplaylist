import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const API = "https://api.github.com";
function creds() {
  const clientId = process.env["GITHUB_CLIENT_ID"];
  const clientSecret = process.env["GITHUB_CLIENT_SECRET"];
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}
async function tokenFor(userId) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("github_connections")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.access_token ?? null;
}
async function gh(token, path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CodeStudy",
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("github api error", path, res.status, text.slice(0, 500));
      const message =
        res.status === 401
          ? "Your GitHub connection expired. Reconnect GitHub to continue."
          : res.status === 403
            ? "GitHub rejected the request (rate limit or missing permission)."
            : res.status === 422
              ? "GitHub rejected the request — that name may already be taken."
              : "GitHub request failed. Please try again.";
      return { ok: false, error: message, status: res.status };
    }
    return { ok: true, data: await res.json() };
  } catch (error) {
    console.error("github request failed", path, error);
    return { ok: false, error: "Could not reach GitHub. Please try again.", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
export const getGithubStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { configured, clientId } = creds();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("github_connections")
      .select("login, avatar_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      configured: Boolean(configured && clientId),
      connected: Boolean(data),
      login: data?.login ?? null,
      avatarUrl: data?.avatar_url ?? null,
    };
  });
export const getGithubAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ redirectUri: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const { clientId, configured } = creds();
    if (!configured || !clientId) {
      return { ok: false, error: "GitHub is not configured for this app yet." };
    }
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", data.redirectUri);
    url.searchParams.set("scope", "repo read:user");
    url.searchParams.set("state", crypto.randomUUID());
    return { ok: true, url: url.toString() };
  });
export const connectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().min(6).max(200), redirectUri: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { clientId, clientSecret, configured } = creds();
    if (!configured || !clientId || !clientSecret) {
      return { ok: false, error: "GitHub is not configured for this app yet." };
    }
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: data.code,
        redirect_uri: data.redirectUri,
      }),
    }).catch((error) => {
      console.error("github token exchange failed", error);
      return null;
    });
    const body = await tokenRes?.json().catch(() => null);
    if (!body?.access_token) {
      console.error("github token exchange rejected", body?.error_description);
      return { ok: false, error: "GitHub did not return an access token. Try connecting again." };
    }
    const user = await gh(body.access_token, "/user");
    if (!user.ok) return { ok: false, error: user.error };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("github_connections").upsert(
      {
        user_id: context.userId,
        login: user.data.login,
        avatar_url: user.data.avatar_url,
        access_token: body.access_token,
        scope: body.scope ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("github connection save failed", error);
      return { ok: false, error: "Could not save the GitHub connection." };
    }
    await context.supabase
      .from("profiles")
      .update({ github_login: user.data.login })
      .eq("id", context.userId);
    await context.supabase
      .from("activities")
      .insert({ user_id: context.userId, kind: "github_connected" });
    return { ok: true, login: user.data.login };
  });
export const connectGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(10).max(250) }).parse(input))
  .handler(async ({ data, context }) => {
    const user = await gh(data.token, "/user");
    if (!user.ok) {
      return {
        ok: false,
        error: "Invalid GitHub Personal Access Token. Check permissions (repo scope required).",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("github_connections").upsert(
      {
        user_id: context.userId,
        login: user.data.login,
        avatar_url: user.data.avatar_url,
        access_token: data.token,
        scope: "repo",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("github connection save failed", error);
      return { ok: false, error: "Could not save GitHub token." };
    }
    await context.supabase
      .from("profiles")
      .update({ github_login: user.data.login })
      .eq("id", context.userId);
    await context.supabase
      .from("activities")
      .insert({ user_id: context.userId, kind: "github_connected" });
    return { ok: true, login: user.data.login };
  });
export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("github_connections").delete().eq("user_id", context.userId);
    await context.supabase.from("profiles").update({ github_login: null }).eq("id", context.userId);
    return { ok: true };
  });
export const listRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = await tokenFor(context.userId);
    if (!token) return { ok: false, error: "GitHub is not connected." };
    const res = await gh(token, "/user/repos?per_page=50&sort=updated&affiliation=owner");
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      repos: res.data.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        htmlUrl: r.html_url,
        private: r.private,
        defaultBranch: r.default_branch,
        updatedAt: r.updated_at,
        language: r.language,
      })),
    };
  });
export const createRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
        description: z.string().max(300).optional(),
        isPrivate: z.boolean(),
        courseId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = await tokenFor(context.userId);
    if (!token) return { ok: false, error: "GitHub is not connected." };
    const res = await gh(token, "/user/repos", {
      method: "POST",
      body: {
        name: data.name,
        description: data.description ?? "Created with CodeStudy",
        private: data.isPrivate,
        auto_init: true,
      },
    });
    if (!res.ok) return { ok: false, error: res.error };
    await context.supabase.from("github_repos").upsert(
      {
        user_id: context.userId,
        course_id: data.courseId ?? null,
        full_name: res.data.full_name,
        html_url: res.data.html_url,
        is_private: res.data.private,
        default_branch: res.data.default_branch,
      },
      { onConflict: "user_id,full_name" },
    );
    await context.supabase.from("activities").insert({
      user_id: context.userId,
      kind: "repo_created",
      meta: { repo: res.data.full_name },
    });
    return {
      ok: true,
      repo: {
        id: res.data.id,
        name: res.data.name,
        fullName: res.data.full_name,
        htmlUrl: res.data.html_url,
        private: res.data.private,
        defaultBranch: res.data.default_branch,
        updatedAt: res.data.updated_at,
        language: res.data.language,
      },
    };
  });
const commitSchema = z.object({
  fullName: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/),
  branch: z.string().min(1).max(100).default("main"),
  message: z.string().min(1).max(300),
  directory: z.string().max(120).optional(),
  lessonId: z.string().uuid().nullable().optional(),
  files: z
    .array(z.object({ path: z.string().min(1).max(200), content: z.string().max(500_000) }))
    .min(1)
    .max(60),
});
export const commitAndPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => commitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const token = await tokenFor(context.userId);
    if (!token) return { ok: false, error: "GitHub is not connected." };
    for (const file of data.files) {
      if (file.path.includes("..") || file.path.startsWith("/")) {
        return { ok: false, error: `Invalid file path: ${file.path}` };
      }
    }
    const dir = (data.directory ?? "").replace(/^\/+|\/+$/g, "");
    if (dir.includes("..")) return { ok: false, error: "Invalid directory." };
    const ref = await gh(token, `/repos/${data.fullName}/git/ref/heads/${data.branch}`);
    if (!ref.ok) {
      return {
        ok: false,
        error:
          ref.status === 404
            ? `Branch "${data.branch}" does not exist in that repository.`
            : ref.error,
      };
    }
    const baseCommit = await gh(
      token,
      `/repos/${data.fullName}/git/commits/${ref.data.object.sha}`,
    );
    if (!baseCommit.ok) return { ok: false, error: baseCommit.error };
    const tree = await gh(token, `/repos/${data.fullName}/git/trees`, {
      method: "POST",
      body: {
        base_tree: baseCommit.data.tree.sha,
        tree: data.files.map((f) => ({
          path: dir ? `${dir}/${f.path}` : f.path,
          mode: "100644",
          type: "blob",
          content: f.content,
        })),
      },
    });
    if (!tree.ok) return { ok: false, error: tree.error };
    const commit = await gh(token, `/repos/${data.fullName}/git/commits`, {
      method: "POST",
      body: {
        message: data.message,
        tree: tree.data.sha,
        parents: [ref.data.object.sha],
      },
    });
    if (!commit.ok) return { ok: false, error: commit.error };
    const update = await gh(token, `/repos/${data.fullName}/git/refs/heads/${data.branch}`, {
      method: "PATCH",
      body: { sha: commit.data.sha, force: false },
    });
    if (!update.ok) return { ok: false, error: update.error };
    const { data: repoRow } = await context.supabase
      .from("github_repos")
      .upsert(
        {
          user_id: context.userId,
          full_name: data.fullName,
          html_url: `https://github.com/${data.fullName}`,
          default_branch: data.branch,
        },
        { onConflict: "user_id,full_name" },
      )
      .select("id")
      .single();
    if (repoRow) {
      await context.supabase.from("commits").insert({
        user_id: context.userId,
        repo_id: repoRow.id,
        lesson_id: data.lessonId ?? null,
        message: data.message,
        sha: commit.data.sha,
        html_url: commit.data.html_url,
        file_count: data.files.length,
      });
    }
    await context.supabase.from("activities").insert({
      user_id: context.userId,
      kind: "commit_pushed",
      lesson_id: data.lessonId ?? null,
      meta: { repo: data.fullName, files: data.files.length },
    });
    return { ok: true, sha: commit.data.sha, url: commit.data.html_url };
  });
export const createBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fullName: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/),
        from: z.string().min(1).max(100),
        name: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z0-9._/-]+$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = await tokenFor(context.userId);
    if (!token) return { ok: false, error: "GitHub is not connected." };
    const ref = await gh(token, `/repos/${data.fullName}/git/ref/heads/${data.from}`);
    if (!ref.ok) return { ok: false, error: ref.error };
    const created = await gh(token, `/repos/${data.fullName}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${data.name}`, sha: ref.data.object.sha },
    });
    if (!created.ok) return { ok: false, error: created.error };
    return { ok: true };
  });
export const listRemoteFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fullName: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/),
        branch: z.string().min(1).max(100),
        directory: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = await tokenFor(context.userId);
    if (!token) return { ok: false, error: "GitHub is not connected." };
    const dir = (data.directory ?? "").replace(/^\/+|\/+$/g, "");
    if (dir.includes("..")) return { ok: false, error: "Invalid directory." };
    const listing = await gh(
      token,
      `/repos/${data.fullName}/contents/${dir}?ref=${encodeURIComponent(data.branch)}`,
    );
    if (!listing.ok) return { ok: false, error: listing.error };
    const files = [];
    for (const item of (Array.isArray(listing.data) ? listing.data : []).slice(0, 25)) {
      if (item.type !== "file" || item.size > 200_000 || !item.download_url) continue;
      const raw = await fetch(item.download_url, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "CodeStudy" },
      }).catch(() => null);
      if (!raw?.ok) continue;
      files.push({
        path: dir ? item.path.slice(dir.length + 1) : item.path,
        content: (await raw.text()).slice(0, 200_000),
      });
    }
    return { ok: true, files };
  });

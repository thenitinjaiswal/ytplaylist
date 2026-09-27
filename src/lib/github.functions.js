import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const API = "https://api.github.com";

function creds() {
  const clientId = process.env["GITHUB_CLIENT_ID"];
  const clientSecret = process.env["GITHUB_CLIENT_SECRET"];
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

async function getAdminSafe() {
  try {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

async function tokenFor(userId, context) {
  // 1. Try Supabase Auth user_metadata
  if (context?.supabase) {
    try {
      const { data } = await context.supabase.auth.getUser();
      if (data?.user?.user_metadata?.github_token) {
        return data.user.user_metadata.github_token;
      }
    } catch {}
  }

  // 2. Try Supabase Admin if service role key is present
  const admin = await getAdminSafe();
  if (admin) {
    try {
      const { data } = await admin
        .from("github_connections")
        .select("access_token")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.access_token) return data.access_token;
    } catch {}
  }

  // 3. Try context.supabase query on github_connections
  if (context?.supabase) {
    try {
      const { data } = await context.supabase
        .from("github_connections")
        .select("access_token")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.access_token) return data.access_token;
    } catch {}
  }

  return null;
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
        "User-Agent": "LearnFlowStudio",
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
          ? "Your GitHub connection expired or token is invalid. Reconnect GitHub to continue."
          : res.status === 403
            ? "GitHub rejected the request (rate limit or missing permission)."
            : res.status === 422
              ? "GitHub rejected the request — that name or path may already exist or be invalid."
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
    const token = await tokenFor(context.userId, context);

    if (token) {
      let login = null;
      let avatarUrl = null;
      let name = null;
      let htmlUrl = null;
      let publicRepos = null;

      try {
        const { data } = await context.supabase.auth.getUser();
        if (data?.user?.user_metadata?.github_login) {
          login = data.user.user_metadata.github_login;
          avatarUrl = data.user.user_metadata.github_avatar ?? null;
          name = data.user.user_metadata.github_name ?? null;
          htmlUrl = data.user.user_metadata.github_html_url ?? `https://github.com/${login}`;
        }
      } catch {}

      if (!login) {
        const ghUser = await gh(token, "/user");
        if (ghUser.ok) {
          login = ghUser.data.login;
          avatarUrl = ghUser.data.avatar_url;
          name = ghUser.data.name;
          htmlUrl = ghUser.data.html_url;
          publicRepos = ghUser.data.public_repos;

          // Cache in user_metadata for fast subsequent loads
          try {
            await context.supabase.auth.updateUser({
              data: {
                github_login: login,
                github_avatar: avatarUrl,
                github_name: name,
                github_html_url: htmlUrl,
              },
            });
          } catch {}
        }
      }

      return {
        configured: true,
        oauthConfigured: Boolean(configured && clientId),
        connected: Boolean(login),
        login,
        avatarUrl,
        name,
        htmlUrl,
        publicRepos,
      };
    }

    return {
      configured: true,
      oauthConfigured: Boolean(configured && clientId),
      connected: false,
      login: null,
      avatarUrl: null,
      name: null,
      htmlUrl: null,
      publicRepos: null,
    };
  });

export const connectGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().trim().min(8, "GitHub token is required") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = data.token.trim();
    const userRes = await gh(token, "/user");
    if (!userRes.ok) {
      return {
        ok: false,
        error: userRes.error || "Invalid GitHub token. Please verify your token and scopes.",
      };
    }

    const ghUser = userRes.data;

    // 1. Save to Supabase auth user_metadata
    try {
      await context.supabase.auth.updateUser({
        data: {
          github_token: token,
          github_login: ghUser.login,
          github_avatar: ghUser.avatar_url,
          github_name: ghUser.name || ghUser.login,
          github_html_url: ghUser.html_url,
        },
      });
    } catch (e) {
      console.error("Failed to update user_metadata:", e);
    }

    // 2. Try saving to github_connections table
    try {
      const admin = await getAdminSafe();
      const client = admin || context.supabase;
      if (client) {
        await client.from("github_connections").upsert(
          {
            user_id: context.userId,
            login: ghUser.login,
            avatar_url: ghUser.avatar_url,
            access_token: token,
            scope: "pat",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      }
    } catch (e) {
      console.warn("Failed to save to github_connections:", e);
    }

    // 3. Update public.profiles
    try {
      if (context.supabase) {
        await context.supabase
          .from("profiles")
          .update({ github_login: ghUser.login })
          .eq("id", context.userId);
      }
    } catch (e) {
      console.warn("Failed to update profiles github_login:", e);
    }

    // 4. Record activity
    try {
      if (context.supabase) {
        await context.supabase
          .from("activities")
          .insert({ user_id: context.userId, kind: "github_connected" });
      }
    } catch (e) {
      console.warn("Failed to insert github_connected activity:", e);
    }

    return {
      ok: true,
      login: ghUser.login,
      avatarUrl: ghUser.avatar_url,
      name: ghUser.name || ghUser.login,
      htmlUrl: ghUser.html_url,
      publicRepos: ghUser.public_repos,
    };
  });

export const getGithubAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ redirectUri: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const { clientId, configured } = creds();
    if (!configured || !clientId) {
      return {
        ok: false,
        error: "GitHub OAuth is not configured. Use Personal Access Token instead.",
      };
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
      return {
        ok: false,
        error: "GitHub OAuth is not configured. Use Personal Access Token instead.",
      };
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

    try {
      await context.supabase.auth.updateUser({
        data: {
          github_token: body.access_token,
          github_login: user.data.login,
          github_avatar: user.data.avatar_url,
          github_name: user.data.name,
          github_html_url: user.data.html_url,
        },
      });
    } catch {}

    try {
      const admin = await getAdminSafe();
      const client = admin || context.supabase;
      if (client) {
        await client.from("github_connections").upsert(
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
      }
    } catch (e) {
      console.warn("Failed to save to github_connections:", e);
    }

    try {
      if (context.supabase) {
        await context.supabase
          .from("profiles")
          .update({ github_login: user.data.login })
          .eq("id", context.userId);
      }
    } catch (e) {
      console.warn("Failed to update profiles github_login:", e);
    }

    try {
      if (context.supabase) {
        await context.supabase
          .from("activities")
          .insert({ user_id: context.userId, kind: "github_connected" });
      }
    } catch (e) {
      console.warn("Failed to insert github_connected activity:", e);
    }

    return { ok: true, login: user.data.login };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // 1. Clear Supabase user_metadata
    try {
      await context.supabase.auth.updateUser({
        data: {
          github_token: null,
          github_login: null,
          github_avatar: null,
          github_name: null,
          github_html_url: null,
        },
      });
    } catch {}

    // 2. Clear github_connections table
    try {
      const admin = await getAdminSafe();
      const client = admin || context.supabase;
      if (client) {
        await client
          .from("github_connections")
          .delete()
          .eq("user_id", context.userId);
      }
    } catch (e) {
      console.warn("Failed to clear github_connections:", e);
    }

    // 3. Clear profile github_login
    try {
      if (context.supabase) {
        await context.supabase
          .from("profiles")
          .update({ github_login: null })
          .eq("id", context.userId);
      }
    } catch (e) {
      console.warn("Failed to clear profile github_login:", e);
    }

    return { ok: true };
  });

export const listRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = await tokenFor(context.userId, context);
    if (!token)
      return {
        ok: false,
        error: "GitHub is not connected. Add your Personal Access Token to connect.",
      };
    const res = await gh(
      token,
      "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
    );
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      repos: res.data.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        htmlUrl: r.html_url,
        private: r.private,
        defaultBranch: r.default_branch || "main",
        updatedAt: r.updated_at,
        language: r.language,
        description: r.description,
        stargazersCount: r.stargazers_count,
        forksCount: r.forks_count,
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
        isPrivate: z.boolean().default(false),
        autoInit: z.boolean().default(true),
        courseId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = await tokenFor(context.userId, context);
    if (!token)
      return { ok: false, error: "GitHub is not connected. Please connect your GitHub account." };

    const res = await gh(token, "/user/repos", {
      method: "POST",
      body: {
        name: data.name,
        description: data.description ?? "Created with LearnFlow Studio",
        private: data.isPrivate,
        auto_init: data.autoInit ?? true,
      },
    });
    if (!res.ok) return { ok: false, error: res.error };

    try {
      if (context.supabase) {
        await context.supabase
          .from("github_repos")
          .upsert(
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
      }
    } catch (e) {
      console.warn("Failed to upsert github_repos:", e);
    }

    try {
      if (context.supabase) {
        await context.supabase
          .from("activities")
          .insert({
            user_id: context.userId,
            kind: "repo_created",
            meta: { repo: res.data.full_name },
          });
      }
    } catch (e) {
      console.warn("Failed to insert repo_created activity:", e);
    }

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
    const token = await tokenFor(context.userId, context);
    if (!token) return { ok: false, error: "GitHub is not connected." };

    for (const file of data.files) {
      if (file.path.includes("..") || file.path.startsWith("/")) {
        return { ok: false, error: `Invalid file path: ${file.path}` };
      }
    }
    const dir = (data.directory ?? "").replace(/^\/+|\/+$/g, "");
    if (dir.includes("..")) return { ok: false, error: "Invalid directory." };

    let ref = await gh(token, `/repos/${data.fullName}/git/ref/heads/${data.branch}`);
    let baseCommitSha = null;
    let baseTreeSha = null;

    if (!ref.ok) {
      // Check repository info
      const repoInfo = await gh(token, `/repos/${data.fullName}`);
      if (!repoInfo.ok) {
        return { ok: false, error: repoInfo.error || `Repository "${data.fullName}" not found.` };
      }

      const defaultBranch = repoInfo.data.default_branch || "main";
      if (defaultBranch !== data.branch) {
        const defaultRef = await gh(token, `/repos/${data.fullName}/git/ref/heads/${defaultBranch}`);
        if (defaultRef.ok) {
          baseCommitSha = defaultRef.data.object.sha;
        }
      }
    } else {
      baseCommitSha = ref.data.object.sha;
    }

    if (baseCommitSha) {
      const baseCommit = await gh(token, `/repos/${data.fullName}/git/commits/${baseCommitSha}`);
      if (baseCommit.ok) {
        baseTreeSha = baseCommit.data.tree.sha;
      }
    }

    const treePayload = {
      tree: data.files.map((f) => ({
        path: dir ? `${dir}/${f.path}` : f.path,
        mode: "100644",
        type: "blob",
        content: f.content,
      })),
    };
    if (baseTreeSha) {
      treePayload.base_tree = baseTreeSha;
    }

    const tree = await gh(token, `/repos/${data.fullName}/git/trees`, {
      method: "POST",
      body: treePayload,
    });
    if (!tree.ok) return { ok: false, error: tree.error };

    const commit = await gh(token, `/repos/${data.fullName}/git/commits`, {
      method: "POST",
      body: {
        message: data.message,
        tree: tree.data.sha,
        parents: baseCommitSha ? [baseCommitSha] : [],
      },
    });
    if (!commit.ok) return { ok: false, error: commit.error };

    if (ref.ok) {
      const update = await gh(token, `/repos/${data.fullName}/git/refs/heads/${data.branch}`, {
        method: "PATCH",
        body: { sha: commit.data.sha, force: false },
      });
      if (!update.ok) return { ok: false, error: update.error };
    } else {
      const createRef = await gh(token, `/repos/${data.fullName}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${data.branch}`, sha: commit.data.sha },
      });
      if (!createRef.ok) return { ok: false, error: createRef.error };
    }

    try {
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
    } catch {}

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
    const token = await tokenFor(context.userId, context);
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
    const token = await tokenFor(context.userId, context);
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
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "LearnFlowStudio" },
      }).catch(() => null);
      if (!raw?.ok) continue;
      files.push({
        path: dir ? item.path.slice(dir.length + 1) : item.path,
        content: (await raw.text()).slice(0, 200_000),
      });
    }
    return { ok: true, files };
  });

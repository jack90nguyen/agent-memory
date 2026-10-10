import { execFileSync } from "node:child_process";

/**
 * Chuẩn hoá remote về `host/owner/repo` (lowercase), bỏ user/token/port/.git.
 * `git@github.com:Owner/Repo.git`, `https://u:tok@github.com/Owner/Repo` → `github.com/owner/repo`.
 * Idempotent: `github.com/owner/repo` giữ nguyên. Remote là path local (`/srv/repo.git`, `file://`) → undefined.
 */
export function normalizeRemote(url: string): string | undefined {
  const u = url.trim();
  let host: string;
  let path: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    if (u.startsWith("file:")) return undefined;
    try {
      const parsed = new URL(u);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch {
      return undefined;
    }
  } else if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\/[^:\s]+$/i.test(u)) {
    [host, path] = [u.slice(0, u.indexOf("/")), u.slice(u.indexOf("/"))]; // đã chuẩn hoá sẵn → idempotent
  } else {
    const scp = u.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/); // cú pháp scp: git@host:owner/repo
    if (!scp) return undefined;
    [, host, path] = scp;
  }
  path = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  return host && path ? `${host}/${path}`.toLowerCase() : undefined;
}

function git(dir: string, args: string[]): string | undefined {
  try {
    const out = execFileSync("git", ["-C", dir, ...args], { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 });
    return out.toString().trim() || undefined;
  } catch {
    return undefined; // không phải git repo / không có git
  }
}

/** Remote `origin` (không có thì remote đầu tiên) của repo chứa `dir`, đã chuẩn hoá. */
export function detectRemote(dir: string): string | undefined {
  const remotes = git(dir, ["remote"])?.split("\n") ?? [];
  const name = remotes.includes("origin") ? "origin" : remotes[0];
  const url = name && git(dir, ["remote", "get-url", name]);
  return url ? normalizeRemote(url) : undefined;
}

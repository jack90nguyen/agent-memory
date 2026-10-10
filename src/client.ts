import type { Project, ProjectSummary, SearchHit, Section } from "./schema.ts";
import type { Store } from "./store.ts";

/** Store gọi API của máy chủ (vd `http://mac-mini:4100` qua Tailscale). */
export function createHttpStore(base: string): Store {
  const root = base.replace(/\/+$/, "");

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new Error(`Không kết nối được PMEM_API=${root} (${(err as Error).message}) — mac-mini/Tailscale có đang bật?`);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data as T;
  }

  const q = (params: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries(params).filter((kv): kv is [string, string] => !!kv[1])).toString();
    return s ? `?${s}` : "";
  };

  return {
    listProjects: () => call<ProjectSummary[]>("GET", "/api/projects"),
    findProject: (slug) => call<Project>("GET", `/api/projects/${encodeURIComponent(slug)}`),
    findProjectFor: async (remote, path) =>
      (await call<Project | null>("GET", `/api/resolve${q({ remote, path })}`)) ?? undefined,
    addProject: (input) => call<Project>("POST", "/api/projects", input),
    backfillRemotes: async () => {
      throw new Error("backfill-remote dò git trên đĩa của máy chủ — chạy trực tiếp trên mac-mini (bỏ PMEM_API)");
    },
    addSection: async (input) => (await call<{ id: number }>("POST", "/api/sections", input)).id,
    deleteSection: async (id) => void (await call("DELETE", `/api/sections/${id}`)),
    getEntry: (id) => call<SearchHit>("GET", `/api/entries/${id}`),
    addEntry: async (input) => (await call<{ id: number }>("POST", "/api/entries", input)).id,
    updateEntry: async (id, patch) => void (await call("PATCH", `/api/entries/${id}`, patch)),
    deleteEntry: async (id) => void (await call("DELETE", `/api/entries/${id}`)),
    getTree: (project, type) =>
      call<Section[]>("GET", `/api/projects/${encodeURIComponent(project.slug)}/tree${q({ type })}`),
    searchEntries: (text, project) => call<SearchHit[]>("GET", `/api/search${q({ q: text, project: project?.slug })}`),
  };
}

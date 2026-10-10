import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { join } from "node:path";
import {
  addEntry,
  addProject,
  addSection,
  deleteEntry,
  deleteSection,
  findProject,
  findProjectFor,
  getEntry,
  getTree,
  listProjects,
  searchEntries,
  updateEntry,
} from "./memory.ts";
import { formatError, SectionType } from "./schema.ts";

const PORT = Number(process.env.PORT ?? 4100);
const WEB_DIST = join(import.meta.dirname, "..", "web", "dist");

const app = new Hono();

app.onError((err, c) => c.json({ error: formatError(err) }, 400));

const id = (raw: string) => Number(raw.replace(/^[es]/, ""));

// ---------- đọc ----------

app.get("/api/projects", (c) => c.json(listProjects()));

app.get("/api/projects/:slug", (c) => c.json(findProject(c.req.param("slug"))));

/** CLI máy khác gửi remote (đã chuẩn hoá) + cwd của nó → project khớp, hoặc null. */
app.get("/api/resolve", (c) => c.json(findProjectFor(c.req.query("remote"), c.req.query("path")) ?? null));

app.get("/api/entries/:id", (c) => c.json(getEntry(id(c.req.param("id")))));

app.get("/api/projects/:slug/tree", (c) => {
  const p = findProject(c.req.param("slug"));
  const rawType = c.req.query("type");
  return c.json(getTree(p.id, rawType ? SectionType.parse(rawType) : undefined));
});

app.get("/api/search", (c) => {
  const slug = c.req.query("project");
  return c.json(searchEntries(c.req.query("q") ?? "", slug ? findProject(slug).id : undefined));
});

// ---------- ghi (không auth: chỉ truy cập được trong tailnet / localhost) ----------

app.post("/api/projects", async (c) => c.json(addProject(await c.req.json())));

app.post("/api/sections", async (c) => c.json({ id: addSection(await c.req.json()) }));

app.delete("/api/sections/:id", (c) => {
  deleteSection(id(c.req.param("id")));
  return c.json({ ok: true });
});

app.post("/api/entries", async (c) => c.json({ id: addEntry(await c.req.json()) }));

app.patch("/api/entries/:id", async (c) => {
  updateEntry(id(c.req.param("id")), await c.req.json());
  return c.json({ ok: true });
});

app.delete("/api/entries/:id", (c) => {
  deleteEntry(id(c.req.param("id")));
  return c.json({ ok: true });
});

app.all("/api/*", (c) => c.json({ error: `Không có API ${c.req.method} ${c.req.path}` }, 404));

app.use("/*", serveStatic({ root: WEB_DIST }));
app.get("*", serveStatic({ path: join(WEB_DIST, "index.html") }));

// Chỉ bind localhost; máy khác vào qua `tailscale serve` (chỉ thiết bị trong tailnet).
serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, ({ port }) =>
  console.log(`agent-memory dashboard: http://localhost:${port}`),
);

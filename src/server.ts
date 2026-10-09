import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { join } from "node:path";
import { findProject, getTree, listProjects, searchEntries } from "./memory.ts";
import { SectionType } from "./schema.ts";

const PORT = Number(process.env.PORT ?? 4100);
const WEB_DIST = join(import.meta.dirname, "..", "web", "dist");

const app = new Hono();

app.onError((err, c) => c.json({ error: err.message }, 400));

app.get("/api/projects", (c) => c.json(listProjects()));

app.get("/api/projects/:slug/tree", (c) => {
  const p = findProject(c.req.param("slug"));
  const rawType = c.req.query("type");
  return c.json(getTree(p.id, rawType ? SectionType.parse(rawType) : undefined));
});

app.get("/api/search", (c) => {
  const slug = c.req.query("project");
  return c.json(searchEntries(c.req.query("q") ?? "", slug ? findProject(slug).id : undefined));
});

app.use("/*", serveStatic({ root: WEB_DIST }));
app.get("*", serveStatic({ path: join(WEB_DIST, "index.html") }));

// Chỉ bind localhost — dashboard cá nhân, không mở ra mạng.
serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, ({ port }) =>
  console.log(`agent-memory dashboard: http://localhost:${port}`),
);

import { existsSync, realpathSync } from "node:fs";
import { db, foldText } from "./db.ts";
import { detectRemote, normalizeRemote } from "./git.ts";
import {
  EntryInput,
  EntryPatch,
  ProjectInput,
  ProjectOrder,
  SectionInput,
  type Entry,
  type Project,
  type ProjectSummary,
  type SearchHit,
  type Section,
  type SectionType,
} from "./schema.ts";

type EntryRow = {
  id: number;
  section_id: number;
  content: string;
  ref_file: string | null;
  tags: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type SectionRow = {
  id: number;
  project_id: number;
  parent_id: number | null;
  title: string;
  type: SectionType;
  position: number;
};

type ProjectRow = {
  id: number;
  slug: string;
  name: string;
  path: string | null;
  remote: string | null;
  created_at: string;
};

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  path: r.path,
  remote: r.remote,
  createdAt: r.created_at,
});

const toEntry = (r: EntryRow): Entry => ({
  id: r.id,
  sectionId: r.section_id,
  content: r.content,
  refFile: r.ref_file,
  tags: r.tags ? r.tags.split(",") : [],
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ---------- projects ----------

export function listProjects(): ProjectSummary[] {
  const rows = db
    .prepare(
      `SELECT p.*, (SELECT count(*) FROM entries e JOIN sections s ON s.id = e.section_id
                    WHERE s.project_id = p.id) AS entry_count
       FROM projects p ORDER BY p.position, p.slug`,
    )
    .all() as (ProjectRow & { entry_count: number })[];
  return rows.map((r) => ({ ...toProject(r), entryCount: r.entry_count }));
}

export function findProject(slug: string): Project {
  const row = db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as ProjectRow | undefined;
  if (!row) throw new Error(`Không có project "${slug}"`);
  return toProject(row);
}

/** Project có `path` là tiền tố dài nhất của cwd. */
function findProjectByPath(cwd: string): Project | undefined {
  const rows = db.prepare("SELECT * FROM projects WHERE path IS NOT NULL").all() as ProjectRow[];
  const match = rows
    .filter((r) => cwd === r.path || cwd.startsWith(r.path + "/"))
    .sort((a, b) => b.path!.length - a.path!.length)[0];
  return match && toProject(match);
}

/** Nhận project: theo git remote trước (clone ở đâu cũng khớp), không có thì theo path. */
export function findProjectFor(remote: string | undefined, path: string | undefined): Project | undefined {
  const row = remote && (db.prepare("SELECT * FROM projects WHERE remote = ?").get(remote) as ProjectRow | undefined);
  if (row) return toProject(row);
  return path ? findProjectByPath(path) : undefined;
}

function assertRemoteFree(remote: string) {
  const owner = db.prepare("SELECT slug FROM projects WHERE remote = ?").get(remote) as { slug: string } | undefined;
  if (owner) throw new Error(`Remote ${remote} đã thuộc project "${owner.slug}"`);
}

export function addProject(input: ProjectInput): Project {
  const p = ProjectInput.parse(input);
  // realpath để khớp process.cwd() (vd macOS: /tmp → /private/tmp).
  const path = p.path && existsSync(p.path) ? realpathSync(p.path) : p.path;
  const remote = p.remote ? normalizeRemote(p.remote) : path ? detectRemote(path) : undefined;
  if (remote) assertRemoteFree(remote);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO projects (slug, name, path, remote, position)
       VALUES (?, ?, ?, ?, (SELECT coalesce(max(position), 0) + 1 FROM projects))`,
    )
    .run(p.slug, p.name, path ?? null, remote ?? null);
  return toProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(lastInsertRowid) as ProjectRow);
}

/** Ghi thứ tự project theo danh sách slug — phải đủ mọi project, kẻo lệch với danh sách vừa bị đổi ở chỗ khác. */
export function reorderProjects(input: ProjectOrder): void {
  const { slugs } = ProjectOrder.parse(input);
  const known = (db.prepare("SELECT slug FROM projects").all() as { slug: string }[]).map((r) => r.slug);
  if (slugs.length !== known.length || new Set(slugs).size !== slugs.length || !slugs.every((s) => known.includes(s)))
    throw new Error("Danh sách project đã thay đổi — tải lại trang rồi thử lại");
  const update = db.prepare("UPDATE projects SET position = ? WHERE slug = ?");
  db.transaction(() => slugs.forEach((slug, i) => update.run(i + 1, slug)))();
}

export type BackfillResult = { slug: string; remote?: string; skipped?: string };

/** Gán remote cho các project đã đăng ký trước khi có định danh theo remote. */
export function backfillRemotes(): BackfillResult[] {
  const rows = db.prepare("SELECT * FROM projects WHERE remote IS NULL AND path IS NOT NULL ORDER BY slug").all() as ProjectRow[];
  return rows.map((r) => {
    const remote = detectRemote(r.path!);
    if (!remote) return { slug: r.slug, skipped: "không có git remote → vẫn match theo path" };
    try {
      assertRemoteFree(remote);
    } catch (e) {
      return { slug: r.slug, skipped: (e as Error).message };
    }
    db.prepare("UPDATE projects SET remote = ? WHERE id = ?").run(remote, r.id);
    return { slug: r.slug, remote };
  });
}

// ---------- sections ----------

function getSectionRow(id: number): SectionRow {
  const row = db.prepare("SELECT * FROM sections WHERE id = ?").get(id) as SectionRow | undefined;
  if (!row) throw new Error(`Không có section s${id}`);
  return row;
}

export function addSection(input: SectionInput): number {
  const s = SectionInput.parse(input);
  if (s.parentId) {
    const parent = getSectionRow(s.parentId);
    if (parent.project_id !== s.projectId) throw new Error("Section cha thuộc project khác");
    if (parent.parent_id !== null) throw new Error("Chỉ hỗ trợ 2 cấp heading");
  }
  const { pos } = db
    .prepare("SELECT coalesce(max(position), 0) + 1 AS pos FROM sections WHERE project_id = ? AND parent_id IS ?")
    .get(s.projectId, s.parentId ?? null) as { pos: number };
  const { lastInsertRowid } = db
    .prepare("INSERT INTO sections (project_id, parent_id, title, type, position) VALUES (?, ?, ?, ?, ?)")
    .run(s.projectId, s.parentId ?? null, s.title, s.type, pos);
  return Number(lastInsertRowid);
}

export function deleteSection(id: number): void {
  getSectionRow(id);
  db.prepare("DELETE FROM sections WHERE id = ?").run(id);
}

// ---------- entries ----------

export function getEntry(id: number): SearchHit {
  const row = db
    .prepare(
      `SELECT e.*, p.slug, sp.path, sp.type AS section_type
       FROM entries e
       JOIN section_paths sp ON sp.id = e.section_id
       JOIN projects p ON p.id = sp.project_id
       WHERE e.id = ?`,
    )
    .get(id) as (EntryRow & { slug: string; path: string; section_type: SectionType }) | undefined;
  if (!row) throw new Error(`Không có entry e${id}`);
  return { ...toEntry(row), projectSlug: row.slug, sectionPath: row.path, sectionType: row.section_type };
}

export function addEntry(input: EntryInput): number {
  const e = EntryInput.parse(input);
  getSectionRow(e.sectionId);
  const { pos } = db
    .prepare("SELECT coalesce(max(position), 0) + 1 AS pos FROM entries WHERE section_id = ?")
    .get(e.sectionId) as { pos: number };
  const { lastInsertRowid } = db
    .prepare("INSERT INTO entries (section_id, content, ref_file, tags, position) VALUES (?, ?, ?, ?, ?)")
    .run(e.sectionId, e.content, e.refFile ?? null, e.tags?.join(",") ?? null, pos);
  return Number(lastInsertRowid);
}

export function updateEntry(id: number, patch: EntryPatch): void {
  const p = EntryPatch.parse(patch);
  const cur = getEntry(id);
  db.prepare(
    `UPDATE entries SET content = ?, ref_file = ?, tags = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(
    p.content ?? cur.content,
    p.refFile ?? cur.refFile,
    (p.tags ?? cur.tags).join(",") || null,
    id,
  );
}

export function deleteEntry(id: number): void {
  getEntry(id);
  db.prepare("DELETE FROM entries WHERE id = ?").run(id);
}

// ---------- đọc ----------

export function getTree(projectId: number, type?: SectionType): Section[] {
  const sections = db
    .prepare("SELECT * FROM sections WHERE project_id = ? ORDER BY position")
    .all(projectId) as SectionRow[];
  const entries = db
    .prepare(
      `SELECT e.* FROM entries e JOIN sections s ON s.id = e.section_id
       WHERE s.project_id = ? ORDER BY e.position`,
    )
    .all(projectId) as EntryRow[];

  const byId = new Map<number, Section>(
    sections.map((s) => [
      s.id,
      {
        id: s.id,
        projectId: s.project_id,
        parentId: s.parent_id,
        title: s.title,
        type: s.type,
        position: s.position,
        entries: [],
        children: [],
      },
    ]),
  );
  for (const e of entries) byId.get(e.section_id)!.entries.push(toEntry(e));
  const roots: Section[] = [];
  for (const s of byId.values()) {
    if (s.parentId === null) roots.push(s);
    else byId.get(s.parentId)!.children.push(s);
  }
  if (!type) return roots;
  // Section con khác type cha vẫn được giữ nếu khớp filter.
  return roots
    .map((r) => ({
      ...r,
      entries: r.type === type ? r.entries : [],
      children: r.children.filter((c) => c.type === type),
    }))
    .filter((r) => r.entries.length > 0 || r.children.length > 0 || r.type === type);
}

/** Mỗi từ thành 1 prefix term → user gõ tự do, không dính cú pháp FTS5. */
function toFtsQuery(q: string): string {
  return foldText(q)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w.replaceAll('"', '""')}"*`)
    .join(" ");
}

export function searchEntries(q: string, projectId?: number, limit = 50): SearchHit[] {
  const match = toFtsQuery(q);
  if (!match) return [];
  const rows = db
    .prepare(
      `SELECT e.*, p.slug, sp.path, sp.type AS section_type
       FROM entries_fts f
       JOIN entries e ON e.id = f.rowid
       JOIN section_paths sp ON sp.id = e.section_id
       JOIN projects p ON p.id = sp.project_id
       WHERE entries_fts MATCH ? AND (? IS NULL OR p.id = ?)
       ORDER BY bm25(entries_fts) LIMIT ?`,
    )
    .all(match, projectId ?? null, projectId ?? null, limit) as (EntryRow & {
    slug: string;
    path: string;
    section_type: SectionType;
  })[];
  return rows.map((r) => ({ ...toEntry(r), projectSlug: r.slug, sectionPath: r.path, sectionType: r.section_type }));
}

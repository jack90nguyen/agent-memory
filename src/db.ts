import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = process.env.PMEM_DB ?? join(import.meta.dirname, "..", "data", "memory.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

// FTS5 unicode61 không fold "đ" → tự fold cả lúc index lẫn lúc query (xem foldText).
const FOLD = (col: string) => `replace(replace(${col}, 'đ', 'd'), 'Đ', 'D')`;
const FTS_ROW = `
  SELECT e.id, ${FOLD("e.content")}, ${FOLD("coalesce(e.tags, '')")}, ${FOLD("sp.path")}
  FROM entries e JOIN section_paths sp ON sp.id = e.section_id`;

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  path       TEXT UNIQUE,
  remote     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sections (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL,
  position   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  ref_file   TEXT,
  tags       TEXT,
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sections_project ON sections(project_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_entries_section ON entries(section_id);

CREATE VIEW IF NOT EXISTS section_paths AS
  SELECT s.id, s.project_id, s.type,
         coalesce(p.title || ' › ', '') || s.title AS path
  FROM sections s LEFT JOIN sections p ON p.id = s.parent_id;

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  content, tags, section,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, content, tags, section) ${FTS_ROW} WHERE e.id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  DELETE FROM entries_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  DELETE FROM entries_fts WHERE rowid = old.id;
  INSERT INTO entries_fts(rowid, content, tags, section) ${FTS_ROW} WHERE e.id = new.id;
END;

-- Đổi tên section cha thì path của bullet trong section con cũng đổi.
CREATE TRIGGER IF NOT EXISTS sections_au AFTER UPDATE OF title ON sections BEGIN
  DELETE FROM entries_fts WHERE rowid IN (
    SELECT e.id FROM entries e JOIN sections s ON s.id = e.section_id
    WHERE s.id = new.id OR s.parent_id = new.id);
  INSERT INTO entries_fts(rowid, content, tags, section) ${FTS_ROW}
    JOIN sections s ON s.id = e.section_id
    WHERE s.id = new.id OR s.parent_id = new.id;
END;
`);

// Migration: DB tạo trước khi có định danh theo git remote.
const projectCols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
if (!projectCols.some((c) => c.name === "remote")) db.exec("ALTER TABLE projects ADD COLUMN remote TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_remote ON projects(remote)");

export function foldText(text: string): string {
  return text.replaceAll("đ", "d").replaceAll("Đ", "D");
}

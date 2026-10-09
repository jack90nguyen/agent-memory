// Import MEMORY.md của 1 repo vào DB: ## → section, ### → section con, mỗi bullet/đoạn/bảng/code → 1 entry.
// node scripts/import-md.ts <repoPath> [--slug s] [--name n] [--replace]
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { db } from "../src/db.ts";
import { addEntry, addProject, addSection, findProject } from "../src/memory.ts";
import type { Project, SectionType } from "../src/schema.ts";

type RawSection = { level: 2 | 3; title: string; body: string[] };

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const LIST_ITEM = /^([-*+]|\d+[.)])\s/;
const HR = /^(-{3,}|\*{3,}|_{3,})\s*$/;

// Khớp trên heading có dấu (lowercase) — bỏ dấu sẽ đụng "đừng"/"dùng", "lỗi"/"lợi".
const TYPE_KEYWORDS: [SectionType, string[]][] = [
  ["pitfall", ["bẫy", "gotcha", "pitfall", "dễ sai", "lưu ý", "cảnh báo", "đừng", "không được", "lỗi", "bài học"]],
  ["decision", ["quyết định", "decision", "chốt", "rule", "đính chính"]],
  ["process", ["quy trình", "deploy", "cách chạy", "vận hành", "hạ tầng", "lệnh", "worker"]],
  ["pattern", ["pattern", "standard", "coding", "cơ chế"]],
  ["preference", ["preference", "sở thích"]],
];

function detectType(title: string): SectionType | undefined {
  const t = title.toLowerCase();
  return TYPE_KEYWORDS.find(([, words]) => words.some((w) => t.includes(w)))?.[0];
}

/** Cắt file theo heading (bỏ qua heading nằm trong code fence). */
function splitSections(md: string): RawSection[] {
  const sections: RawSection[] = [{ level: 2, title: "Tổng quan", body: [] }];
  let inFence = false;
  for (const line of md.split(/\r?\n/)) {
    if (FENCE.test(line)) inFence = !inFence;
    const h = !inFence && line.match(HEADING);
    if (!h) {
      sections.at(-1)!.body.push(line);
      continue;
    }
    if (h[1].length === 1) continue; // # Title của file
    sections.push({ level: h[1].length === 2 ? 2 : 3, title: h[2], body: [] });
  }
  return sections;
}

/** Tách body của 1 section thành các khối: list item (kèm phần thụt lề), đoạn văn, bảng, code. */
function splitBlocks(lines: string[]): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  let kind: "list" | "para" | "table" | "code" | null = null;
  let inFence = false;
  let pendingBlank = 0;

  const flush = () => {
    const text = cur.join("\n").trim();
    if (text) blocks.push(text);
    cur = [];
    kind = null;
    pendingBlank = 0;
  };
  const start = (k: typeof kind, line: string) => {
    flush();
    kind = k;
    cur.push(line);
  };

  for (const line of lines) {
    if (inFence) {
      cur.push(line);
      if (FENCE.test(line)) {
        inFence = false;
        if (kind === "code") flush();
      }
      continue;
    }

    const blank = line.trim() === "";
    const indented = /^\s+\S/.test(line);

    if (blank) {
      if (kind === "list") pendingBlank++;
      else flush();
      continue;
    }

    // Dòng thụt lề sau list item (kể cả sau dòng trống) = phần của item đó.
    if (kind === "list" && indented) {
      cur.push(...Array(pendingBlank).fill(""), line);
      pendingBlank = 0;
      if (FENCE.test(line)) inFence = true;
      continue;
    }

    if (FENCE.test(line)) {
      start("code", line);
      inFence = true;
    } else if (HR.test(line)) {
      flush();
    } else if (LIST_ITEM.test(line)) {
      start("list", line);
    } else if (line.trimStart().startsWith("|")) {
      if (kind === "table") cur.push(line);
      else start("table", line);
    } else if (kind === "para" || (kind === "list" && pendingBlank === 0)) {
      cur.push(line); // lazy continuation
    } else {
      start("para", line);
    }
  }
  flush();
  return blocks;
}

function ensureProject(slug: string, name: string, path: string): Project {
  try {
    return findProject(slug);
  } catch {
    return addProject({ slug, name, path });
  }
}

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { slug: { type: "string" }, name: { type: "string" }, replace: { type: "boolean" } },
});

const repo = resolve(positionals[0] ?? ".");
const folder = basename(repo);
const md = readFileSync(join(repo, "MEMORY.md"), "utf8");

const stats = db.transaction(() => {
  const project = ensureProject(opts.slug ?? folder.toLowerCase(), opts.name ?? folder, repo);
  const existing = db.prepare("SELECT count(*) AS n FROM sections WHERE project_id = ?").get(project.id) as { n: number };
  if (existing.n > 0) {
    if (!opts.replace) throw new Error(`${project.slug} đã có dữ liệu — thêm --replace để import lại`);
    db.prepare("DELETE FROM sections WHERE project_id = ?").run(project.id);
  }

  const count: Record<string, number> = {};
  let parent: { id: number; type: SectionType } | undefined;
  let sections = 0;
  let entries = 0;

  for (const [i, raw] of splitSections(md).entries()) {
    const blocks = splitBlocks(raw.body);
    if (i === 0 && blocks.length === 0) continue; // không có intro trước ## đầu tiên
    const isChild = raw.level === 3 && parent !== undefined;
    const type = detectType(raw.title) ?? (isChild ? parent!.type : "note");
    const id = addSection({ projectId: project.id, parentId: isChild ? parent!.id : undefined, title: raw.title, type });
    if (!isChild) parent = { id, type };
    sections++;
    for (const content of blocks) {
      addEntry({ sectionId: id, content });
      entries++;
      count[type] = (count[type] ?? 0) + 1;
    }
  }
  return { slug: project.slug, sections, entries, count };
})();

const types = Object.entries(stats.count).map(([t, n]) => `${t}:${n}`).join(" ");
console.log(`${stats.slug.padEnd(18)} ${String(stats.sections).padStart(3)} sections ${String(stats.entries).padStart(4)} entries  ${types}`);

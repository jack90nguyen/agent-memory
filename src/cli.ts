#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { detectRemote } from "./git.ts";
import { renderTree } from "./render.ts";
import { formatError, SectionType, type Project, type SearchHit } from "./schema.ts";
import { openStore } from "./store.ts";

const HELP = `pmem — project memory (SQLite)

Máy khác (qua Tailscale): đặt PMEM_API=http://mac-mini:4100 → CLI gọi API thay vì mở DB local.

Đọc:
  projects                                   Danh sách project
  show [-p slug] [--type T]                  Toàn bộ section + entry dạng markdown
  get <entryId>                              Chi tiết 1 entry
  search "<q>" [-p slug]                     Full-text search (bỏ dấu được)

Ghi:
  add-project <slug> "<name>" [--path P]
  add-section "<title>" --type T [--parent sId] [-p slug]
  add <sectionId> ["<content>"] [--ref F] [--tags a,b]     content lấy từ stdin nếu bỏ trống
  update <entryId> ["<content>"] [--ref F] [--tags a,b]
  del <entryId>
  del-section <sectionId>                    Xoá luôn section con + entry bên trong

Bảo trì:
  backfill-remote                            Gán git remote cho project đăng ký trước đây

Không truyền -p thì tự nhận project của thư mục hiện tại: theo git remote trước
(clone repo ở folder nào cũng khớp), repo không có remote thì theo path.
Type: ${SectionType.options.join(" | ")}
ID chấp nhận dạng 12, e12, s12.`;

// Bullet markdown ("- foo") bị parseArgs tưởng là option → dồn các arg dạng text ra sau "--".
const argv = process.argv.slice(2);
const isText = (a: string) => /^-(?![-a-z])/i.test(a);

const parse = () =>
  parseArgs({
    args: argv.includes("--") ? argv : [...argv.filter((a) => !isText(a)), "--", ...argv.filter(isText)],
    allowPositionals: true,
    options: {
      project: { type: "string", short: "p" },
      type: { type: "string" },
      parent: { type: "string" },
      path: { type: "string" },
      ref: { type: "string" },
      tags: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

let parsed: ReturnType<typeof parse>;
try {
  parsed = parse();
} catch (err) {
  console.error(`ERROR: ${(err as Error).message}`);
  process.exit(1);
}
const { values: opts, positionals } = parsed;
const [cmd, ...args] = positionals;
const store = await openStore();

const toId = (raw: string | undefined): number => {
  const n = Number(raw?.replace(/^[es]/, ""));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`ID không hợp lệ: ${raw ?? "(trống)"}`);
  return n;
};

async function resolveProject(): Promise<Project> {
  if (opts.project) return store.findProject(opts.project);
  const cwd = process.cwd();
  const p = await store.findProjectFor(detectRemote(cwd), cwd);
  if (!p) throw new Error(`Không nhận ra project từ ${cwd} — truyền -p <slug>`);
  return p;
}

const readContent = (arg: string | undefined): string | undefined => {
  if (arg !== undefined) return arg;
  if (process.stdin.isTTY) return undefined;
  return readFileSync(0, "utf8") || undefined;
};

const parseTags = (raw: string | undefined) => raw?.split(",").map((t) => t.trim()).filter(Boolean);

const printHit = (h: SearchHit) => {
  console.log(`[e${h.id}] ${h.projectSlug} › ${h.sectionPath} (s${h.sectionId} · ${h.sectionType})`);
  console.log(h.content.replace(/^/gm, "    "));
  if (h.refFile) console.log(`    ref: ${h.refFile}`);
  if (h.tags.length > 0) console.log(`    tags: ${h.tags.join(",")}`);
  console.log();
};

async function run(): Promise<void> {
  switch (cmd) {
    case "projects": {
      const list = await store.listProjects();
      if (list.length === 0) return console.log("(chưa có project)");
      for (const p of list)
        console.log(`${p.slug.padEnd(16)} ${String(p.entryCount).padStart(4)} entries  ${(p.remote ?? "-").padEnd(42)} ${p.path ?? ""}`);
      return;
    }
    case "show": {
      const p = await resolveProject();
      const type = opts.type ? SectionType.parse(opts.type) : undefined;
      return console.log(renderTree(p, await store.getTree(p, type)));
    }
    case "get": {
      const e = await store.getEntry(toId(args[0]));
      printHit(e);
      return console.log(`created ${e.createdAt} · updated ${e.updatedAt}`);
    }
    case "search": {
      const q = args.join(" ");
      const p = opts.project ? await store.findProject(opts.project) : undefined;
      const hits = await store.searchEntries(q, p);
      if (hits.length === 0) return console.log("(không có kết quả)");
      return hits.forEach(printHit);
    }
    case "add-project": {
      // Dò remote + realpath ở máy đang chạy CLI (máy chủ không thấy được đĩa của máy khác).
      const path = opts.path && existsSync(opts.path) ? realpathSync(opts.path) : opts.path;
      const remote = path ? detectRemote(path) : undefined;
      const p = await store.addProject({ slug: args[0] ?? "", name: args[1] ?? "", path, remote });
      return console.log(`ok project ${p.slug} (id ${p.id})`);
    }
    case "add-section": {
      const p = await resolveProject();
      const id = await store.addSection({
        projectId: p.id,
        parentId: opts.parent ? toId(opts.parent) : undefined,
        title: args[0] ?? "",
        type: SectionType.parse(opts.type),
      });
      return console.log(`ok s${id}`);
    }
    case "add": {
      const id = await store.addEntry({
        sectionId: toId(args[0]),
        content: readContent(args[1]) ?? "",
        refFile: opts.ref,
        tags: parseTags(opts.tags),
      });
      return console.log(`ok e${id}`);
    }
    case "update": {
      const id = toId(args[0]);
      await store.updateEntry(id, { content: readContent(args[1]), refFile: opts.ref, tags: parseTags(opts.tags) });
      return console.log(`ok e${id}`);
    }
    case "backfill-remote": {
      const results = await store.backfillRemotes();
      if (results.length === 0) return console.log("(không có project nào cần backfill)");
      for (const r of results) console.log(`${r.slug.padEnd(16)} ${r.remote ? `ok ${r.remote}` : `skip: ${r.skipped}`}`);
      return;
    }
    case "del": {
      const id = toId(args[0]);
      await store.deleteEntry(id);
      return console.log(`ok deleted e${id}`);
    }
    case "del-section": {
      const id = toId(args[0]);
      await store.deleteSection(id);
      return console.log(`ok deleted s${id}`);
    }
    default:
      console.log(HELP);
      if (cmd && !opts.help) process.exitCode = 1;
  }
}

try {
  await run();
} catch (err) {
  console.error(`ERROR: ${formatError(err)}`);
  process.exitCode = 1;
}

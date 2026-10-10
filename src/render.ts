import type { Entry, Project, Section } from "./schema.ts";

// ---------- render cho AI ----------

const LIST_ITEM = /^\s*([-*+]|\d+\.)\s/;

function renderEntries(entries: Entry[]): string {
  let out = "";
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    const sep = !prev ? "" : LIST_ITEM.test(prev.content) && LIST_ITEM.test(e.content) ? "\n" : "\n\n";
    const meta = [e.refFile && `ref: ${e.refFile}`, e.tags.length > 0 && `tags: ${e.tags.join(",")}`]
      .filter(Boolean)
      .join(" · ");
    out += `${sep}[e${e.id}] ${e.content}${meta ? `  ⟨${meta}⟩` : ""}`;
  });
  return out;
}

/** Ghép cây về markdown, kèm id `[sN]` / `[eN]` để AI dùng cho add/update/del. */
export function renderTree(project: Project, tree: Section[]): string {
  const parts = [`# ${project.name} (${project.slug})`];
  const walk = (s: Section, depth: number) => {
    parts.push(`${"#".repeat(depth)} ${s.title} [s${s.id} · ${s.type}]`);
    if (s.entries.length > 0) parts.push(renderEntries(s.entries));
    s.children.forEach((c) => walk(c, depth + 1));
  };
  tree.forEach((s) => walk(s, 2));
  if (tree.length === 0) parts.push("_(chưa có section nào)_");
  return parts.join("\n\n");
}

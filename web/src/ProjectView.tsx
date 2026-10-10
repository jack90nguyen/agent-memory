import { useEffect, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  SECTION_TYPES,
  type Entry,
  type ProjectSummary,
  type Section,
  type SectionType,
} from "../../src/schema.ts";
import { fetchTree } from "./api.ts";

type Props = {
  slug: string;
  project?: ProjectSummary;
  focusId?: number;
  isMobile: boolean;
};

const allIds = (tree: Section[]): number[] => tree.flatMap((s) => [s.id, ...allIds(s.children)]);

const countEntries = (s: Section): number =>
  s.entries.length + s.children.reduce((n, c) => n + countEntries(c), 0);

/** Các section (cha → con) chứa entry, để mở ra trước khi cuộn tới. */
function findPath(tree: Section[], entryId: number): number[] | undefined {
  for (const s of tree) {
    if (s.entries.some((e) => e.id === entryId)) return [s.id];
    const sub = findPath(s.children, entryId);
    if (sub) return [s.id, ...sub];
  }
}

export function ProjectView({ slug, project, focusId, isMobile }: Props) {
  const [type, setType] = useState<SectionType>();
  const [tree, setTree] = useState<Section[]>();
  const [open, setOpen] = useState<Set<number>>();
  const [flashId, setFlashId] = useState<number>();
  const [error, setError] = useState("");
  const handledFocus = useRef<number>(undefined);
  const scrolledTo = useRef<number>(undefined);

  // Nhảy tới entry thì bỏ filter, kẻo entry đang bị lọc mất.
  useEffect(() => {
    if (focusId) setType(undefined);
  }, [focusId]);

  useEffect(() => {
    fetchTree(slug, type)
      .then((t) => {
        setTree(t);
        // Mobile: mặc định thu gọn → màn đầu là mục lục. Desktop: mở hết.
        setOpen((prev) => prev ?? new Set(isMobile ? [] : allIds(t)));
      })
      .catch((e: Error) => setError(e.message));
  }, [slug, type]); // isMobile chỉ quyết định trạng thái mở lần load đầu

  useEffect(() => {
    if (!tree || !focusId || handledFocus.current === focusId) return;
    const path = findPath(tree, focusId);
    if (!path) return;
    handledFocus.current = focusId;
    scrolledTo.current = undefined;
    setOpen((prev) => new Set([...(prev ?? []), ...path]));
    setFlashId(focusId);
    const timer = setTimeout(() => setFlashId(undefined), 2400);
    return () => clearTimeout(timer);
  }, [tree, focusId]);

  // Cuộn sau khi section đã mở (entry đã có trong DOM).
  useEffect(() => {
    if (!flashId || scrolledTo.current === flashId) return;
    const el = document.getElementById(`e${flashId}`);
    if (!el) return;
    scrolledTo.current = flashId;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flashId, open]);

  const ids = tree ? allIds(tree) : [];
  const allOpen = ids.length > 0 && ids.every((id) => open?.has(id));

  const toggle = (id: number, head: HTMLElement) => {
    const wasOpen = open?.has(id);
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Thu gọn lúc header đang dính trên đầu → kéo về đầu section, khỏi lạc chỗ.
    const section = head.parentElement!;
    if (wasOpen && section.getBoundingClientRect().top < 0) {
      requestAnimationFrame(() => section.scrollIntoView({ block: "start" }));
    }
  };

  return (
    <div className="project-view">
      {!isMobile && project && (
        <div className="project-title">
          <h1>{project.name}</h1>
          <span className="muted">
            {[`${project.entryCount} entries`, project.remote, project.path].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}

      <div className="toolbar">
        <div className="chips" role="group" aria-label="Lọc theo type">
          <button className={`chip ${!type ? "active" : ""}`} onClick={() => setType(undefined)}>
            all
          </button>
          {SECTION_TYPES.map((t) => (
            <button key={t} className={`chip t-${t} ${type === t ? "active" : ""}`} onClick={() => setType(t)}>
              <span className="dot" />
              {t}
            </button>
          ))}
        </div>
        {ids.length > 0 && (
          <button className="toggle-all" onClick={() => setOpen(new Set(allOpen ? [] : ids))}>
            {allOpen ? "Thu hết" : "Mở hết"}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {tree?.length === 0 && (
        <div className="empty">
          <span className="big">🫙</span>
          {type ? `Không có section ${type} nào.` : "Project này chưa có memory nào."}
        </div>
      )}
      {open &&
        tree?.map((s) => <SectionBlock key={s.id} section={s} open={open} onToggle={toggle} flashId={flashId} />)}
    </div>
  );
}

type SectionProps = {
  section: Section;
  open: Set<number>;
  onToggle: (id: number, head: HTMLElement) => void;
  flashId?: number;
  nested?: boolean;
};

function SectionBlock({ section, open, onToggle, flashId, nested }: SectionProps) {
  const isOpen = open.has(section.id);
  return (
    <section id={`s${section.id}`} className={`sec ${nested ? "nested" : ""} ${isOpen ? "open" : ""}`}>
      <button className="sec-head" aria-expanded={isOpen} onClick={(e) => onToggle(section.id, e.currentTarget)}>
        <ChevronRight />
        <span className="sec-title">
          <InlineMd text={section.title} />
          <span className="sec-id"> s{section.id}</span>
        </span>
        <TypeBadge type={section.type} />
        <span className="sec-count">{countEntries(section)}</span>
      </button>
      {isOpen && (
        <div className="sec-body">
          {section.entries.map((e) => (
            <EntryItem key={e.id} entry={e} flash={e.id === flashId} />
          ))}
          {section.children.map((c) => (
            <SectionBlock key={c.id} section={c} open={open} onToggle={onToggle} flashId={flashId} nested />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- dùng chung với SearchView ----------

const mdComponents: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
};

export const EntryMarkdown = ({ content }: { content: string }) => (
  <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
    {content}
  </Markdown>
);

/** Markdown 1 dòng cho tiêu đề (giữ `code`, **bold**, ~~del~~). */
export const InlineMd = ({ text }: { text: string }) => (
  <Markdown remarkPlugins={[remarkGfm]} allowedElements={["code", "strong", "em", "del"]} unwrapDisallowed>
    {text}
  </Markdown>
);

export const TypeBadge = ({ type }: { type: SectionType }) => <span className={`badge t-${type}`}>{type}</span>;

const rtf = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** SQLite `datetime('now')` là UTC, không kèm múi giờ. */
const parseUtc = (s: string) => new Date(`${s.replace(" ", "T")}Z`);

function timeAgo(s: string): string {
  const sec = (parseUtc(s).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit);
  return "vừa xong";
}

export function EntryMeta({ entry }: { entry: Entry }) {
  const fmt = (s: string) => parseUtc(s).toLocaleString("vi-VN");
  return (
    <div className="meta">
      <span>e{entry.id}</span>
      <span title={`Tạo ${fmt(entry.createdAt)} · Sửa ${fmt(entry.updatedAt)}`}>{timeAgo(entry.updatedAt)}</span>
      {entry.refFile && <code>{entry.refFile}</code>}
      {entry.tags.map((t) => (
        <span key={t} className="tag">
          #{t}
        </span>
      ))}
    </div>
  );
}

function EntryItem({ entry, flash }: { entry: Entry; flash: boolean }) {
  return (
    <article id={`e${entry.id}`} className={`entry ${flash ? "flash" : ""}`}>
      <div className="md">
        <EntryMarkdown content={entry.content} />
      </div>
      <EntryMeta entry={entry} />
    </article>
  );
}

const ChevronRight = () => (
  <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

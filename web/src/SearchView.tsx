import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SearchHit } from "../../src/schema.ts";
import { searchEntries } from "./api.ts";
import { EntryMarkdown, EntryMeta, InlineMd, TypeBadge } from "./ProjectView.tsx";

const LIMIT = 50; // khớp limit mặc định của searchEntries phía server

export function SearchView({ query, onPick }: { query: string; onPick: (hit: SearchHit) => void }) {
  const [hits, setHits] = useState<SearchHit[]>();
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      searchEntries(query)
        .then((list) => {
          setHits(list);
          setError("");
        })
        .catch((e: Error) => setError(e.message));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  if (error) return <p className="error">{error}</p>;
  if (!hits) return null;
  if (hits.length === 0)
    return (
      <div className="empty">
        <span className="big">🔍</span>
        Không tìm thấy “{query.trim()}”
      </div>
    );

  return (
    <div className="search-view">
      <p className="result-count">{hits.length >= LIMIT ? `${LIMIT}+ kết quả, đang hiện ${LIMIT} kết quả khớp nhất` : `${hits.length} kết quả`}</p>
      {hits.map((h) => (
        <article
          key={h.id}
          className="hit"
          role="button"
          tabIndex={0}
          onClick={(e) => (e.target as HTMLElement).closest("a") || onPick(h)}
          onKeyDown={(e) => e.key === "Enter" && onPick(h)}
        >
          <div className="hit-path">
            <span className="hit-project">{h.projectSlug}</span>
            <TypeBadge type={h.sectionType} />
          </div>
          <div className="hit-section">
            <InlineMd text={h.sectionPath} />
          </div>
          <Clamp>
            <EntryMarkdown content={h.content} />
          </Clamp>
          <EntryMeta entry={h} />
        </article>
      ))}
    </div>
  );
}

/** Cắt nội dung dài, chỉ làm mờ đáy khi thật sự bị cắt. */
function Clamp({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current!;
    setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [children]);
  return (
    <div ref={ref} className={`md clamp ${clipped ? "clipped" : ""}`}>
      {children}
    </div>
  );
}

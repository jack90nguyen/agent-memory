import { useEffect, useState } from "react";
import type { ProjectSummary } from "../../src/schema.ts";

type Props = {
  projects: ProjectSummary[];
  current: string;
  onPick: (slug: string) => void;
  onClose: () => void;
};

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Bottom sheet chọn project (mobile). */
export function ProjectSheet({ projects, current, onPick, onClose }: Props) {
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const q = fold(filter.trim());
  const list = q ? projects.filter((p) => fold(`${p.name} ${p.slug}`).includes(q)) : projects;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal aria-label="Chọn project" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <strong>Project</strong>
          <span className="muted">{projects.length}</span>
        </div>
        <input
          className="field"
          type="search"
          placeholder="Lọc project…"
          aria-label="Lọc project"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <ul className="sheet-list">
          {list.map((p) => (
            <li key={p.id}>
              <button className={p.slug === current ? "active" : ""} onClick={() => onPick(p.slug)}>
                <span className="name">{p.name}</span>
                <span className={`count ${p.entryCount === 0 ? "zero" : ""}`}>{p.entryCount}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted sheet-empty">Không có project khớp “{filter}”</li>}
        </ul>
      </div>
    </div>
  );
}

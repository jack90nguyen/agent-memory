import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProjectSummary } from "../../src/schema.ts";
import { fetchProjects } from "./api.ts";
import { ProjectSheet } from "./ProjectSheet.tsx";
import { ProjectView } from "./ProjectView.tsx";
import { SearchView } from "./SearchView.tsx";

type Route = { slug: string; entryId?: number };

/** Hash dạng `#/slug` hoặc `#/slug/e123` (nhảy tới entry). */
function parseHash(): Route {
  const [slug = "", target] = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/");
  const entryId = Number(target?.replace(/^e/, ""));
  return { slug, entryId: entryId > 0 ? entryId : undefined };
}

const goTo = (slug: string, entryId?: number) => {
  location.hash = `/${slug}${entryId ? `/e${entryId}` : ""}`;
};

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mql = matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [route, setRoute] = useState(parseHash);
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState("");
  const isMobile = useMediaQuery("(max-width: 719px)");
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetchProjects()
      .then((list) => {
        setProjects(list);
        const first = list.find((p) => p.entryCount > 0) ?? list[0];
        if (!parseHash().slug && first) goTo(first.slug);
      })
      .catch((e: Error) => setError(e.message));
    const onHash = () => {
      setRoute(parseHash());
      setQuery("");
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  // Section header sticky ngay dưới topbar → cần chiều cao thật của topbar.
  useLayoutEffect(() => {
    const el = headerRef.current!;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const current = projects.find((p) => p.slug === route.slug);
  const pick = (slug: string) => {
    setSheetOpen(false);
    setQuery("");
    goTo(slug);
  };

  return (
    <div className="layout">
      <header ref={headerRef} className="topbar">
        {isMobile ? (
          <button className="project-switch" onClick={() => setSheetOpen(true)}>
            <span aria-hidden>🧠</span>
            <span className="name">{current?.name ?? "Chọn project"}</span>
            {current && <span className="pill">{current.entryCount}</span>}
            <ChevronDown />
          </button>
        ) : (
          <div className="brand">🧠 Agent Memory</div>
        )}
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Search mọi project…"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </header>

      {!isMobile && (
        <nav className="sidebar">
          {projects.map((p) => (
            <a
              key={p.id}
              href={`#/${p.slug}`}
              className={!query && p.slug === route.slug ? "active" : ""}
              onClick={() => setQuery("")}
            >
              <span className="name">{p.name}</span>
              <span className={`count ${p.entryCount === 0 ? "zero" : ""}`}>{p.entryCount}</span>
            </a>
          ))}
        </nav>
      )}

      <main>
        {error && <p className="error">{error}</p>}
        {query.trim() ? (
          <SearchView query={query} onPick={(h) => goTo(h.projectSlug, h.id)} />
        ) : (
          route.slug && (
            <ProjectView
              key={route.slug}
              slug={route.slug}
              project={current}
              focusId={route.entryId}
              isMobile={isMobile}
            />
          )
        )}
      </main>

      {isMobile && sheetOpen && (
        <ProjectSheet projects={projects} current={route.slug} onPick={pick} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}

const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const ChevronDown = () => (
  <svg className="chev-down" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

import type { ProjectSummary, SearchHit, Section, SectionType } from "../../src/schema.ts";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export const fetchProjects = () => get<ProjectSummary[]>("/api/projects");

export const fetchTree = (slug: string, type?: SectionType) =>
  get<Section[]>(`/api/projects/${slug}/tree${type ? `?type=${type}` : ""}`);

export const searchEntries = (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`);

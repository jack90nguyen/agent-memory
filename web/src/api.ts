import type { ProjectSummary, SearchHit, Section, SectionType } from "../../src/schema.ts";

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export const fetchProjects = () => get<ProjectSummary[]>("/api/projects");

export const fetchTree = (slug: string, type?: SectionType) =>
  get<Section[]>(`/api/projects/${slug}/tree${type ? `?type=${type}` : ""}`);

export const searchEntries = (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`);

export const saveProjectOrder = (slugs: string[]) =>
  get<{ ok: true }>("/api/projects/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slugs }),
  });

export const deleteEntry = (id: number) => get<{ ok: true }>(`/api/entries/${id}`, { method: "DELETE" });

export const deleteSection = (id: number) => get<{ ok: true }>(`/api/sections/${id}`, { method: "DELETE" });

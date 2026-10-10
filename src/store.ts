import type { BackfillResult } from "./memory.ts";
import type {
  EntryInput,
  EntryPatch,
  Project,
  ProjectInput,
  ProjectSummary,
  SearchHit,
  Section,
  SectionInput,
  SectionType,
} from "./schema.ts";

/** Các thao tác CLI cần — chạy thẳng DB (máy chủ) hoặc qua HTTP API (máy khác). */
export type Store = {
  listProjects(): Promise<ProjectSummary[]>;
  findProject(slug: string): Promise<Project>;
  findProjectFor(remote: string | undefined, path: string): Promise<Project | undefined>;
  addProject(input: ProjectInput): Promise<Project>;
  backfillRemotes(): Promise<BackfillResult[]>;
  addSection(input: SectionInput): Promise<number>;
  deleteSection(id: number): Promise<void>;
  getEntry(id: number): Promise<SearchHit>;
  addEntry(input: EntryInput): Promise<number>;
  updateEntry(id: number, patch: EntryPatch): Promise<void>;
  deleteEntry(id: number): Promise<void>;
  getTree(project: Project, type?: SectionType): Promise<Section[]>;
  searchEntries(q: string, project?: Project): Promise<SearchHit[]>;
};

/** Có `PMEM_API` → gọi API của máy chủ; không có → mở DB local. Import động để máy client khỏi đụng SQLite. */
export async function openStore(): Promise<Store> {
  const api = process.env.PMEM_API;
  if (api) return (await import("./client.ts")).createHttpStore(api);

  const m = await import("./memory.ts");
  return {
    listProjects: async () => m.listProjects(),
    findProject: async (slug) => m.findProject(slug),
    findProjectFor: async (remote, path) => m.findProjectFor(remote, path),
    addProject: async (input) => m.addProject(input),
    backfillRemotes: async () => m.backfillRemotes(),
    addSection: async (input) => m.addSection(input),
    deleteSection: async (id) => m.deleteSection(id),
    getEntry: async (id) => m.getEntry(id),
    addEntry: async (input) => m.addEntry(input),
    updateEntry: async (id, patch) => m.updateEntry(id, patch),
    deleteEntry: async (id) => m.deleteEntry(id),
    getTree: async (project, type) => m.getTree(project.id, type),
    searchEntries: async (q, project) => m.searchEntries(q, project?.id),
  };
}

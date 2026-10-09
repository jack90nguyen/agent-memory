import { z } from "zod";

export const SECTION_TYPES = ["pattern", "decision", "pitfall", "process", "preference", "note"] as const;
export const SectionType = z.enum(SECTION_TYPES);
export type SectionType = z.infer<typeof SectionType>;

const id = z.coerce.number().int().positive();
const tags = z.array(z.string().trim().min(1)).optional();

export const ProjectInput = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug chỉ gồm a-z, 0-9, -"),
  name: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
});
export type ProjectInput = z.infer<typeof ProjectInput>;

export const SectionInput = z.object({
  projectId: id,
  parentId: id.optional(),
  title: z.string().trim().min(1),
  type: SectionType,
});
export type SectionInput = z.infer<typeof SectionInput>;

export const EntryInput = z.object({
  sectionId: id,
  content: z.string().trim().min(1),
  refFile: z.string().trim().min(1).optional(),
  tags,
});
export type EntryInput = z.infer<typeof EntryInput>;

export const EntryPatch = EntryInput.omit({ sectionId: true }).partial();
export type EntryPatch = z.infer<typeof EntryPatch>;

export type Project = {
  id: number;
  slug: string;
  name: string;
  path: string | null;
  createdAt: string;
};

export type ProjectSummary = Project & { entryCount: number };

export type Entry = {
  id: number;
  sectionId: number;
  content: string;
  refFile: string | null;
  tags: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Section = {
  id: number;
  projectId: number;
  parentId: number | null;
  title: string;
  type: SectionType;
  position: number;
  entries: Entry[];
  children: Section[];
};

export type SearchHit = Entry & {
  projectSlug: string;
  sectionPath: string;
  sectionType: SectionType;
};

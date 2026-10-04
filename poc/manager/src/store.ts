import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type ProjectStatus =
  | "new"
  | "provisioning"
  | "installing"
  | "starting"
  | "ready"
  | "stopped"
  | "error";

export interface LogLine {
  ts: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  machine?: string;
  previewUrl?: string;
  previewPort?: number;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PersistedState {
  projects: Project[];
}

const TRANSIENT: ReadonlySet<ProjectStatus> = new Set([
  "provisioning",
  "installing",
  "starting",
]);

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "project";
}

/**
 * Durable, file-backed project registry. Small enough for a PoC: the whole set
 * is kept in memory and flushed atomically after each mutation.
 */
export class ProjectStore {
  private readonly file: string;
  private projects = new Map<string, Project>();

  constructor(private readonly dataDir: string) {
    this.file = join(dataDir, "projects.json");
  }

  async load(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as PersistedState;
      for (const project of parsed.projects ?? []) {
        const reconciled: Project = { ...project };
        // A manager restart mid-provision leaves a transient status but no live
        // job. Demote to a resumable state so the user can retry.
        if (TRANSIENT.has(reconciled.status)) {
          reconciled.status = reconciled.machine ? "stopped" : "new";
        }
        this.projects.set(reconciled.id, reconciled);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }

  private async flush(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const payload: PersistedState = { projects: [...this.projects.values()] };
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(tmp, this.file);
  }

  list(): Project[] {
    return [...this.projects.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Project | undefined {
    return this.projects.get(id);
  }

  async create(name?: string): Promise<Project> {
    const now = new Date().toISOString();
    const id = `${slugify(name ?? "project")}-${randomUUID().slice(0, 6)}`;
    const project: Project = {
      id,
      name: name?.trim() || id,
      status: "new",
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    await this.flush();
    return project;
  }

  async update(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Promise<Project> {
    const current = this.projects.get(id);
    if (!current) throw new Error(`unknown project ${id}`);
    const next: Project = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.projects.set(id, next);
    await this.flush();
    return next;
  }

  /** Mutate in memory and schedule a flush; for high-frequency status changes. */
  touch(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Project {
    const current = this.projects.get(id);
    if (!current) throw new Error(`unknown project ${id}`);
    const next: Project = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.projects.set(id, next);
    void this.flush();
    return next;
  }

  async remove(id: string): Promise<void> {
    this.projects.delete(id);
    await this.flush();
  }
}

export { slugify };

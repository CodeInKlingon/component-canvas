import { EventEmitter } from "node:events";
import type { LogLine, Project } from "./store.js";

export interface ProjectSnapshot {
  project: Project;
  lines: LogLine[];
}

type ProjectEvent =
  | { type: "status"; project: Project }
  | { type: "log"; line: LogLine }
  | { type: "error"; message: string }
  | { type: "done"; project: Project };

const MAX_LOG_LINES = 500;

/**
 * Per-project event fan-out and a bounded log ring buffer. In-memory only: the
 * PoC does not need durable logs, and the registry (not the logs) is the source
 * of truth for project state.
 */
export class EventHub {
  private readonly emitter = new EventEmitter();
  private readonly logs = new Map<string, LogLine[]>();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  private channel(projectId: string): string {
    return `project:${projectId}`;
  }

  log(projectId: string, line: LogLine): void {
    const buffer = this.logs.get(projectId) ?? [];
    buffer.push(line);
    if (buffer.length > MAX_LOG_LINES) buffer.splice(0, buffer.length - MAX_LOG_LINES);
    this.logs.set(projectId, buffer);
    this.emit(projectId, { type: "log", line });
  }

  lines(projectId: string): LogLine[] {
    return [...(this.logs.get(projectId) ?? [])];
  }

  status(project: Project): void {
    this.emit(project.id, { type: "status", project });
  }

  error(projectId: string, message: string): void {
    this.emit(projectId, { type: "error", message });
  }

  done(project: Project): void {
    this.emit(project.id, { type: "done", project });
  }

  subscribe(projectId: string, handler: (event: ProjectEvent) => void): () => void {
    const channel = this.channel(projectId);
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  clear(projectId: string): void {
    this.logs.delete(projectId);
  }

  private emit(projectId: string, event: ProjectEvent): void {
    this.emitter.emit(this.channel(projectId), event);
  }
}

export type { ProjectEvent };

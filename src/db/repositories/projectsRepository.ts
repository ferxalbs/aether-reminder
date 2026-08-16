import { createId } from "@/lib/id";
import type { Project } from "@/domain/entities";
import { DatabaseError } from "../errors";
import { mapProjectRow, type ProjectRow } from "../mappers";
import type { SqlDatabase } from "../types";

export class ProjectsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async getById(id: string): Promise<Project | null> {
    const row = await this.db.getFirstAsync<ProjectRow>(
      `SELECT * FROM projects WHERE id = ?`,
      [id],
    );
    return row ? mapProjectRow(row) : null;
  }

  async listActive(): Promise<Project[]> {
    const rows = await this.db.getAllAsync<ProjectRow>(
      `SELECT * FROM projects WHERE archived = 0 ORDER BY name COLLATE NOCASE ASC`,
    );
    return rows.map(mapProjectRow);
  }

  async create(input: {
    name: string;
    color?: string | null;
    id?: string;
  }): Promise<Project> {
    const name = input.name.trim();
    if (!name) {
      throw new DatabaseError("VALIDATION_FAILED", "Project name is required.");
    }
    const id = input.id ?? createId();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO projects (id, name, color, archived, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [id, name, input.color ?? null, now, now],
    );
    const project = await this.getById(id);
    if (!project)
      throw new DatabaseError(
        "QUERY_FAILED",
        "Project insert verification failed.",
      );
    return project;
  }
}

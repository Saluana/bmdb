import type { Storage } from "./Storage";
import { deepFreeze } from "../utils/freeze";
import type { JsonObject } from "../utils/types";
import { existsSync, readFileSync, writeFileSync } from "fs";

export class JSONStorage implements Storage {
  private path: string;
  private indent = 0;
  constructor(path: string = "db.json", opts: { indent?: number } = {}) {
    this.path = path;
    this.indent = opts.indent ?? 0;
    if (!existsSync(this.path)) {
      writeFileSync(this.path, "{}\n");
    }
  }

  read(): JsonObject | null {
    const raw = readFileSync(this.path, 'utf-8');
    if (!raw || raw.trim() === "") {
      return null;
    }
    try {
      return JSON.parse(raw) as JsonObject;
    } catch {
      return null;
    }
  }

  write(obj: JsonObject): void {
    const frozen = deepFreeze(structuredClone(obj));
    writeFileSync(this.path, JSON.stringify(frozen, null, this.indent));
  }

  close(): void {
    /* noop for file storage */
  }
}
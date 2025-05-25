import { WALStorage } from "./WALStorage";
import { deepFreeze } from "../utils/freeze";
import type { JsonObject } from "../utils/types";
import { existsSync, writeFileSync } from "fs";

// Efficient deep clone without JSON serialization overhead
function deepClone(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
}

export class WALJSONStorage extends WALStorage {
  private indent = 0;

  constructor(path: string = "db.json", opts: { indent?: number; batchSize?: number; maxBatchWaitMs?: number } = {}) {
    super(path, { batchSize: opts.batchSize ?? 1000, maxBatchWaitMs: opts.maxBatchWaitMs ?? 20 });
    this.indent = opts.indent ?? 0;
    
    // Initialize main data file if it doesn't exist
    if (!existsSync(path)) {
      writeFileSync(path, "{}\n");
    }
  }

  write(obj: JsonObject): void {
    // Create a copy before freezing to avoid modifying the original
    const copy = deepClone(obj);
    const frozen = deepFreeze(copy);
    super.write(frozen);
  }

  update(obj: JsonObject): void {
    // Create a copy before freezing to avoid modifying the original
    const copy = deepClone(obj);
    const frozen = deepFreeze(copy);
    super.update(frozen);
  }

  read(): JsonObject | null {
    const data = super.read();
    // Return a copy that can be modified by TinyDB
    return data ? deepClone(data) : null;
  }

  flush(): void {
    const currentData = this.read();
    if (currentData) {
      // Create a copy before freezing to avoid modifying the original
      const copy = deepClone(currentData);
      const frozen = deepFreeze(copy);
      const dataPath = (this as any).dataPath; // Access private field
      writeFileSync(dataPath, JSON.stringify(frozen, null, this.indent));
    }
  }
}
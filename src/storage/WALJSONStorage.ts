import { WALStorage } from "./WALStorage";
import { deepFreeze } from "../utils/freeze";
import type { JsonObject } from "../utils/types";
import { existsSync, writeFileSync } from "fs";

export class WALJSONStorage extends WALStorage {
  private indent = 0;

  constructor(path: string = "db.json", opts: { indent?: number; batchSize?: number; maxBatchWaitMs?: number } = {}) {
    super(path, opts.batchSize ?? 10, opts.maxBatchWaitMs ?? 50);
    this.indent = opts.indent ?? 0;
    
    // Initialize main data file if it doesn't exist
    if (!existsSync(path)) {
      writeFileSync(path, "{}\n");
    }
  }

  write(obj: JsonObject): void {
    const frozen = deepFreeze(structuredClone(obj));
    super.write(frozen);
  }

  update(obj: JsonObject): void {
    const frozen = deepFreeze(structuredClone(obj));
    super.update(frozen);
  }

  read(): JsonObject | null {
    const data = super.read();
    // Return unfrozen copy so TinyDB can modify it
    return data ? structuredClone(data) : null;
  }

  flush(): void {
    const currentData = this.read();
    if (currentData) {
      const frozen = deepFreeze(structuredClone(currentData));
      const dataPath = (this as any).dataPath; // Access private field
      writeFileSync(dataPath, JSON.stringify(frozen, null, this.indent));
    }
  }
}
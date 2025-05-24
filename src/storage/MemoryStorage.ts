import type { Storage } from "./Storage";
import type { JsonObject } from "../utils/types";

export class MemoryStorage implements Storage {
  private data: JsonObject = {};
  
  constructor() {
    // Initialize with empty data
    this.data = {};
  }

  read(): JsonObject | null {
    return this.data ? structuredClone(this.data) : null;
  }
  
  write(obj: JsonObject): void {
    this.data = structuredClone(obj);
  }
  
  close(): void {
    // Nothing to close for memory storage
  }
}
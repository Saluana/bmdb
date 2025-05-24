import type { JsonObject } from "../utils/types";

export interface Storage {
  read(): JsonObject | null;
  write(obj: JsonObject): void;
  close(): void;
  
  // V2 features (optional for backward compatibility)
  createIndex?(tableName: string, field: string): Promise<void>;
  checkUnique?(tableName: string, field: string, value: any, excludeDocId?: string): Promise<boolean>;
  supportsFeature?(feature: 'compoundIndex' | 'batch' | 'tx' | 'async'): boolean;
}

export type StorageCtor = new (pathOrOpts?: any) => Storage;
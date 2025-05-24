import type { JsonObject } from "../utils/types";

export interface Storage {
  read(): JsonObject | null;
  write(obj: JsonObject): void;
  close(): void;
}

export type StorageCtor = new (pathOrOpts?: any) => Storage;
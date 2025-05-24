/**
 * Contains the base class for middlewares and implementations.
 */

import type { Storage } from "./storage/Storage";
import type { JsonObject } from "./utils/types";

export abstract class Middleware implements Storage {
  protected _storage: Storage;

  constructor(StorageCls: new (...args: any[]) => Storage) {
    this._StorageCls = StorageCls;
  }

  private _StorageCls: new (...args: any[]) => Storage;

  // This is called when TinyDB initializes the storage
  __call__(...args: any[]): this {
    this._storage = new this._StorageCls(...args);
    return this;
  }

  // Forward unknown attribute calls to the underlying storage
  __getattr__(name: string): any {
    return (this._storage as any)[name];
  }

  abstract read(): JsonObject | null;
  abstract write(data: JsonObject): void;
  abstract close(): void;
}

/**
 * Add some caching to TinyDB.
 * 
 * This Middleware aims to improve the performance of TinyDB by writing only
 * the last DB state every WRITE_CACHE_SIZE time and reading always from cache.
 */
export class CachingMiddleware extends Middleware {
  // The number of write operations to cache before writing to disc
  static WRITE_CACHE_SIZE = 1000;

  private cache: JsonObject | null = null;
  private _cacheModifiedCount = 0;

  constructor(StorageCls: new (...args: any[]) => Storage) {
    super(StorageCls);
  }

  read(): JsonObject | null {
    if (this.cache === null) {
      // Empty cache: read from the storage
      this.cache = this._storage.read();
    }
    
    // Return the cached data
    return this.cache;
  }

  write(data: JsonObject): void {
    // Store data in cache
    this.cache = data;
    this._cacheModifiedCount += 1;

    // Check if we need to flush the cache
    if (this._cacheModifiedCount >= CachingMiddleware.WRITE_CACHE_SIZE) {
      this.flush();
    }
  }

  /**
   * Flush all unwritten data to disk.
   */
  flush(): void {
    if (this._cacheModifiedCount > 0) {
      // Force-flush the cache by writing the data to the storage
      this._storage.write(this.cache!);
      this._cacheModifiedCount = 0;
    }
  }

  close(): void {
    // Flush potentially unwritten data
    this.flush();

    // Let the storage clean up too
    this._storage.close();
  }
}
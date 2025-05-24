/**
 * Object pooling implementation to reduce allocation overhead
 * Manages a pool of reusable objects to minimize garbage collection pressure
 */

export interface PooledObject {
  reset?(): void;
  dispose?(): void;
}

export interface ObjectPoolOptions<T> {
  maxSize?: number;
  factory: () => T;
  reset?: (obj: T) => void;
  validator?: (obj: T) => boolean;
  maxAge?: number; // milliseconds
}

export class ObjectPool<T extends PooledObject = any> {
  private _available: Array<{ obj: T; created: number }> = [];
  private _inUse = new Set<T>();
  private _factory: () => T;
  private _reset?: (obj: T) => void;
  private _validator?: (obj: T) => boolean;
  private _maxSize: number;
  private _maxAge: number;
  private _created = 0;
  private _borrowed = 0;
  private _returned = 0;

  constructor(options: ObjectPoolOptions<T>) {
    this._factory = options.factory;
    this._reset = options.reset;
    this._validator = options.validator;
    this._maxSize = options.maxSize || 100;
    this._maxAge = options.maxAge || 300000; // 5 minutes default
  }

  // Borrow an object from the pool
  borrow(): T {
    // Clean up expired objects first
    this._cleanupExpired();

    let obj: T;
    let objWrapper = this._available.pop();

    if (objWrapper && this._isValid(objWrapper.obj)) {
      obj = objWrapper.obj;
    } else {
      // Create new object
      obj = this._factory();
      this._created++;
    }

    // Reset object state
    if (this._reset) {
      this._reset(obj);
    } else if (obj.reset) {
      obj.reset();
    }

    this._inUse.add(obj);
    this._borrowed++;
    return obj;
  }

  // Return an object to the pool
  return(obj: T): void {
    if (!this._inUse.has(obj)) {
      return; // Object not from this pool or already returned
    }

    this._inUse.delete(obj);
    this._returned++;

    // Only keep objects if pool not full and object is valid
    if (this._available.length < this._maxSize && this._isValid(obj)) {
      this._available.push({
        obj,
        created: Date.now()
      });
    } else {
      // Dispose of object if pool is full or object is invalid
      if (obj.dispose) {
        obj.dispose();
      }
    }
  }

  // Clear all objects from the pool
  clear(): void {
    // Dispose available objects
    for (const wrapper of this._available) {
      if (wrapper.obj.dispose) {
        wrapper.obj.dispose();
      }
    }
    this._available.length = 0;

    // Note: objects in use will be disposed when returned
    this._inUse.clear();
  }

  // Get pool statistics
  getStats(): {
    available: number;
    inUse: number;
    created: number;
    borrowed: number;
    returned: number;
    hitRate: number;
  } {
    const hitRate = this._borrowed === 0 ? 0 : 
      (this._borrowed - this._created) / this._borrowed;

    return {
      available: this._available.length,
      inUse: this._inUse.size,
      created: this._created,
      borrowed: this._borrowed,
      returned: this._returned,
      hitRate
    };
  }

  // Check if object is valid
  private _isValid(obj: T): boolean {
    if (this._validator) {
      return this._validator(obj);
    }
    return true;
  }

  // Clean up expired objects
  private _cleanupExpired(): void {
    const now = Date.now();
    this._available = this._available.filter(wrapper => {
      const isExpired = (now - wrapper.created) > this._maxAge;
      if (isExpired && wrapper.obj.dispose) {
        wrapper.obj.dispose();
      }
      return !isExpired;
    });
  }
}

/**
 * Global object pool manager
 */
export class PoolRegistry {
  private _pools = new Map<string, ObjectPool<any>>();

  // Get or create a pool
  getPool<T extends PooledObject>(
    name: string, 
    options?: ObjectPoolOptions<T>
  ): ObjectPool<T> {
    if (!this._pools.has(name)) {
      if (!options) {
        throw new Error(`Pool '${name}' does not exist and no options provided`);
      }
      this._pools.set(name, new ObjectPool<T>(options));
    }
    return this._pools.get(name) as ObjectPool<T>;
  }

  // Remove a pool
  removePool(name: string): void {
    const pool = this._pools.get(name);
    if (pool) {
      pool.clear();
      this._pools.delete(name);
    }
  }

  // Get all pool names
  getPoolNames(): string[] {
    return Array.from(this._pools.keys());
  }

  // Get statistics for all pools
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [name, pool] of this._pools) {
      stats[name] = pool.getStats();
    }
    return stats;
  }

  // Clear all pools
  clearAll(): void {
    for (const pool of this._pools.values()) {
      pool.clear();
    }
    this._pools.clear();
  }
}

// Global registry instance
export const poolRegistry = new PoolRegistry();

/**
 * Commonly used pooled objects
 */

// Pooled array wrapper
export class PooledArray<T> implements PooledObject {
  private _array: T[] = [];

  constructor(initialCapacity = 10) {
    this._array = new Array(initialCapacity);
    this._array.length = 0;
  }

  get array(): T[] {
    return this._array;
  }

  reset(): void {
    this._array.length = 0;
  }

  push(...items: T[]): number {
    return this._array.push(...items);
  }

  pop(): T | undefined {
    return this._array.pop();
  }

  get length(): number {
    return this._array.length;
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this._array[Symbol.iterator]();
  }
}

// Pooled object wrapper
export class PooledMap<K, V> implements PooledObject {
  private _map = new Map<K, V>();

  get map(): Map<K, V> {
    return this._map;
  }

  reset(): void {
    this._map.clear();
  }

  set(key: K, value: V): this {
    this._map.set(key, value);
    return this;
  }

  get(key: K): V | undefined {
    return this._map.get(key);
  }

  has(key: K): boolean {
    return this._map.has(key);
  }

  delete(key: K): boolean {
    return this._map.delete(key);
  }

  get size(): number {
    return this._map.size;
  }

  keys(): IterableIterator<K> {
    return this._map.keys();
  }

  values(): IterableIterator<V> {
    return this._map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this._map.entries();
  }
}

// Pooled result set for queries
export class PooledResultSet<T> implements PooledObject {
  private _results: T[] = [];
  private _metadata: Record<string, any> = {};

  get results(): T[] {
    return this._results;
  }

  get metadata(): Record<string, any> {
    return this._metadata;
  }

  reset(): void {
    this._results.length = 0;
    for (const key in this._metadata) {
      delete this._metadata[key];
    }
  }

  addResult(result: T): void {
    this._results.push(result);
  }

  addResults(results: T[]): void {
    this._results.push(...results);
  }

  setMetadata(key: string, value: any): void {
    this._metadata[key] = value;
  }

  getMetadata(key: string): any {
    return this._metadata[key];
  }

  get length(): number {
    return this._results.length;
  }
}

// Pre-configured pools for common objects
export const arrayPool = new ObjectPool<PooledArray<any>>({
  maxSize: 50,
  factory: () => new PooledArray(),
  maxAge: 60000 // 1 minute
});

export const mapPool = new ObjectPool<PooledMap<any, any>>({
  maxSize: 30,
  factory: () => new PooledMap(),
  maxAge: 60000 // 1 minute
});

export const resultSetPool = new ObjectPool<PooledResultSet<any>>({
  maxSize: 20,
  factory: () => new PooledResultSet(),
  maxAge: 30000 // 30 seconds
});
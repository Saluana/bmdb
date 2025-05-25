/**
 * Copy-on-Write (CoW) container for efficient data isolation
 * Allows sharing data between operations until a write occurs
 */
export class CopyOnWriteMap<K, V> {
    private _data: Map<K, V>;
    private _isOwner: boolean;
    private _version: number;

    constructor(data?: Map<K, V> | Record<string, V>, version = 0) {
        if (data instanceof Map) {
            this._data = data;
            this._isOwner = false;
        } else if (data && typeof data === 'object') {
            this._data = new Map(Object.entries(data) as [K, V][]);
            this._isOwner = true;
        } else {
            this._data = new Map();
            this._isOwner = true;
        }
        this._version = version;
    }

    // Create a new CoW reference to the same data
    clone(): CopyOnWriteMap<K, V> {
        const cloned = new CopyOnWriteMap<K, V>();
        cloned._data = this._data;
        cloned._isOwner = false;
        cloned._version = this._version;
        return cloned;
    }

    // Read operations (no copy needed)
    get(key: K): V | undefined {
        return this._data.get(key);
    }

    has(key: K): boolean {
        return this._data.has(key);
    }

    get size(): number {
        return this._data.size;
    }

    keys(): IterableIterator<K> {
        return this._data.keys();
    }

    values(): IterableIterator<V> {
        return this._data.values();
    }

    entries(): IterableIterator<[K, V]> {
        return this._data.entries();
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this._data[Symbol.iterator]();
    }

    // Write operations (trigger copy if needed)
    set(key: K, value: V): this {
        this._ensureOwnership();
        this._data.set(key, value);
        return this;
    }

    delete(key: K): boolean {
        this._ensureOwnership();
        return this._data.delete(key);
    }

    clear(): void {
        this._ensureOwnership();
        this._data.clear();
    }

    // Ensure we own the data before modifying
    private _ensureOwnership(): void {
        if (!this._isOwner) {
            // Create a copy of the data
            const newData = new Map(this._data);
            this._data = newData;
            this._isOwner = true;
            this._version++;
        }
    }

    // Get the version number (useful for cache invalidation)
    get version(): number {
        return this._version;
    }

    // Check if this instance owns its data
    get isOwner(): boolean {
        return this._isOwner;
    }

    // Convert to plain object
    toObject(): Record<string, V> {
        const obj: Record<string, V> = {};
        for (const [key, value] of this._data) {
            obj[key as any] = value;
        }
        return obj;
    }

    // Convert to Map
    toMap(): Map<K, V> {
        return new Map(this._data);
    }

    // Get raw data reference (use with caution)
    getRawData(): Map<K, V> {
        return this._data;
    }
}

/**
 * Copy-on-Write array implementation
 */
export class CopyOnWriteArray<T> {
    private _data: T[];
    private _isOwner: boolean;
    private _version: number;

    constructor(data?: T[], version = 0) {
        this._data = data ? [...data] : [];
        this._isOwner = true;
        this._version = version;
    }

    // Create a new CoW reference to the same data
    clone(): CopyOnWriteArray<T> {
        const cloned = new CopyOnWriteArray<T>();
        cloned._data = this._data;
        cloned._isOwner = false;
        cloned._version = this._version;
        return cloned;
    }

    // Read operations
    get(index: number): T | undefined {
        return this._data[index];
    }

    get length(): number {
        return this._data.length;
    }

    slice(start?: number, end?: number): T[] {
        return this._data.slice(start, end);
    }

    indexOf(searchElement: T, fromIndex?: number): number {
        return this._data.indexOf(searchElement, fromIndex);
    }

    includes(searchElement: T, fromIndex?: number): boolean {
        return this._data.includes(searchElement, fromIndex);
    }

    forEach(callback: (value: T, index: number, array: T[]) => void): void {
        this._data.forEach(callback);
    }

    map<U>(callback: (value: T, index: number, array: T[]) => U): U[] {
        return this._data.map(callback);
    }

    filter(callback: (value: T, index: number, array: T[]) => boolean): T[] {
        return this._data.filter(callback);
    }

    find(
        callback: (value: T, index: number, array: T[]) => boolean
    ): T | undefined {
        return this._data.find(callback);
    }

    // Write operations
    set(index: number, value: T): void {
        this._ensureOwnership();
        this._data[index] = value;
    }

    push(...items: T[]): number {
        this._ensureOwnership();
        return this._data.push(...items);
    }

    pop(): T | undefined {
        this._ensureOwnership();
        return this._data.pop();
    }

    shift(): T | undefined {
        this._ensureOwnership();
        return this._data.shift();
    }

    unshift(...items: T[]): number {
        this._ensureOwnership();
        return this._data.unshift(...items);
    }

    splice(start: number, deleteCount?: number, ...items: T[]): T[] {
        this._ensureOwnership();
        if (deleteCount === undefined) {
            return this._data.splice(
                start,
                this._data.length - start,
                ...items
            );
        }
        return this._data.splice(start, deleteCount, ...items);
    }

    sort(compareFn?: (a: T, b: T) => number): this {
        this._ensureOwnership();
        this._data.sort(compareFn);
        return this;
    }

    reverse(): this {
        this._ensureOwnership();
        this._data.reverse();
        return this;
    }

    // Ensure we own the data before modifying
    private _ensureOwnership(): void {
        if (!this._isOwner) {
            this._data = [...this._data];
            this._isOwner = true;
            this._version++;
        }
    }

    // Get the version number
    get version(): number {
        return this._version;
    }

    // Check if this instance owns its data
    get isOwner(): boolean {
        return this._isOwner;
    }

    // Convert to regular array
    toArray(): T[] {
        return [...this._data];
    }

    // Get raw data reference (use with caution)
    getRawData(): T[] {
        return this._data;
    }

    // Iterator support
    [Symbol.iterator](): IterableIterator<T> {
        return this._data[Symbol.iterator]();
    }
}

/**
 * Copy-on-Write object wrapper for deep data structures
 */
export class CopyOnWriteObject<T extends Record<string, any>> {
    private _data: T;
    private _isOwner: boolean;
    private _version: number;

    constructor(data: T, version = 0) {
        this._data = data;
        this._isOwner = true;
        this._version = version;
    }

    // Create a new CoW reference to the same data
    clone(): CopyOnWriteObject<T> {
        const cloned = new CopyOnWriteObject<T>({} as T);
        cloned._data = this._data;
        cloned._isOwner = false;
        cloned._version = this._version;
        return cloned;
    }

    // Read operations
    get<K extends keyof T>(key: K): T[K] {
        return this._data[key];
    }

    has(key: string): boolean {
        return key in this._data;
    }

    keys(): string[] {
        return Object.keys(this._data);
    }

    values(): any[] {
        return Object.values(this._data);
    }

    entries(): [string, any][] {
        return Object.entries(this._data);
    }

    // Write operations
    set<K extends keyof T>(key: K, value: T[K]): this {
        this._ensureOwnership();
        this._data[key] = value;
        return this;
    }

    delete(key: string): boolean {
        this._ensureOwnership();
        const existed = key in this._data;
        delete (this._data as any)[key];
        return existed;
    }

    assign(source: Partial<T>): this {
        this._ensureOwnership();
        Object.assign(this._data, source);
        return this;
    }

    // Ensure we own the data before modifying
    private _ensureOwnership(): void {
        if (!this._isOwner) {
            this._data = this._deepClone(this._data);
            this._isOwner = true;
            this._version++;
        }
    }

    private _deepClone(obj: any): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this._deepClone(item));
        }

        const cloned: any = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this._deepClone(obj[key]);
            }
        }
        return cloned;
    }

    // Get the version number
    get version(): number {
        return this._version;
    }

    // Check if this instance owns its data
    get isOwner(): boolean {
        return this._isOwner;
    }

    // Convert to plain object
    toObject(): T {
        return this._deepClone(this._data);
    }

    // Get raw data reference (use with caution)
    getRawData(): T {
        return this._data;
    }
}

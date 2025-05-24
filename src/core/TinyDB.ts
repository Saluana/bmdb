import { Table } from './Table';
import { SchemaTable } from './SchemaTable';
import type { Storage, StorageCtor } from '../storage/Storage';
import { JSONStorage } from '../storage/JSONStorage';
import type { Doc, JsonObject } from '../utils/types';
import type { QueryInstance } from '../query/QueryInstance';
import type { BmDbSchema } from '../schema/BmDbSchema';

export class TinyDB {
    // Class variables (can be overridden)
    static tableClass = Table;
    static defaultTableName = '_default';
    static defaultStorageClass = JSONStorage;

    private _storage: Storage;
    private _opened = true;
    private _tables = new Map<string, Table<any>>();

    constructor(
        pathOrOptions: any = 'db.json',
        options: { storage?: any } = {}
    ) {
        // Handle different constructor patterns
        let StorageCls = TinyDB.defaultStorageClass;
        let storageArgs: any[] = [];

        if (options.storage) {
            StorageCls = options.storage;
            storageArgs = [pathOrOptions];
        } else if (typeof pathOrOptions === 'object' && pathOrOptions.storage) {
            StorageCls = pathOrOptions.storage;
            storageArgs = [];
        } else {
            storageArgs = [pathOrOptions];
        }

        this._storage = new StorageCls(...storageArgs);

        // Load existing data
        const data = this._storage.read();
        if (data) {
            for (const [name, tableData] of Object.entries(data)) {
                const table = new TinyDB.tableClass(this._storage, name);
                table._loadData(tableData as any);
                this._tables.set(name, table);
            }
        }

        // Return proxy to forward unknown methods to default table
        return new Proxy(this, {
            get: (target, prop, receiver) => {
                if (Reflect.has(target, prop)) {
                    return Reflect.get(target, prop, receiver);
                }
                // Forward to default table
                const defaultTable = target.table(TinyDB.defaultTableName);
                const val = (defaultTable as any)[prop as any];
                if (typeof val === 'function') {
                    return val.bind(defaultTable);
                }
                return val;
            },
        });
    }

    get storage(): Storage {
        return this._storage;
    }

    table<T extends Record<string, any> = any>(
        name: string,
        options: any = {}
    ): Table<T> {
        if (this._tables.has(name)) {
            return this._tables.get(name)! as Table<T>;
        }

        const table = new TinyDB.tableClass(this._storage, name, options);
        this._tables.set(name, table);
        return table as Table<T>;
    }

    schemaTable<T extends Record<string, any>>(
        schema: BmDbSchema<T>,
        name?: string,
        options: { cacheSize?: number; persistEmpty?: boolean } = {}
    ): SchemaTable<T> {
        const tableName = name || schema.tableName;

        if (this._tables.has(tableName)) {
            const existing = this._tables.get(tableName);
            if (existing instanceof SchemaTable) {
                return existing as SchemaTable<T>;
            }
            throw new Error(
                `Table '${tableName}' already exists as a non-schema table`
            );
        }

        const table = new SchemaTable(
            this._storage,
            schema,
            tableName,
            options
        );
        this._tables.set(tableName, table);
        return table;
    }

    tables(): Set<string> {
        const data = this._storage.read();
        return new Set(data ? Object.keys(data) : []);
    }

    dropTables(): void {
        this._storage.write({});
        this._tables.clear();
    }

    dropTable(name: string): void {
        if (this._tables.has(name)) {
            this._tables.delete(name);
        }

        const data = this._storage.read();
        if (data && data[name]) {
            delete data[name];
            this._storage.write(data);
        }
    }

    close(): void {
        this._opened = false;
        this._storage.close();
    }

    // Context manager support
    __enter__() {
        return this;
    }

    __exit__() {
        if (this._opened) {
            this.close();
        }
    }

    // Magic methods forwarded to default table
    get length(): number {
        return this.table(TinyDB.defaultTableName).length;
    }

    [Symbol.iterator](): Iterator<Doc<any>> {
        return this.table(TinyDB.defaultTableName)[Symbol.iterator]();
    }

    // Forwarded Table methods for the default table
    insert(document: any): number {
        return this.table(TinyDB.defaultTableName).insert(document);
    }

    insertMultiple(documents: any[]): number[] {
        return this.table(TinyDB.defaultTableName).insertMultiple(documents);
    }

    all(): any[] {
        return this.table(TinyDB.defaultTableName).all();
    }

    search(cond: any): any[] {
        return this.table(TinyDB.defaultTableName).search(cond);
    }

    get(cond?: any, docId?: number, docIds?: number[]): any {
        return this.table(TinyDB.defaultTableName).get(cond, docId, docIds);
    }

    contains(cond?: any, docId?: number): boolean {
        return this.table(TinyDB.defaultTableName).contains(cond, docId);
    }

    update(fields: any, cond?: any, docIds?: number[]): number[] {
        return this.table(TinyDB.defaultTableName).update(fields, cond, docIds);
    }

    updateMultiple(updates: any[]): number[] {
        return this.table(TinyDB.defaultTableName).updateMultiple(updates);
    }

    upsert(document: any, cond?: any): number[] {
        return this.table(TinyDB.defaultTableName).upsert(document, cond);
    }

    remove(cond?: any, docIds?: number[]): number[] {
        return this.table(TinyDB.defaultTableName).remove(cond, docIds);
    }

    truncate(): void {
        return this.table(TinyDB.defaultTableName).truncate();
    }

    count(cond: any): number {
        return this.table(TinyDB.defaultTableName).count(cond);
    }

    clearCache(): void {
        return this.table(TinyDB.defaultTableName).clearCache();
    }

    // Representation
    toString(): string {
        const tables = Array.from(this.tables());
        const tablesCounts = tables.map(
            (name) => `${name}=${this.table(name).length}`
        );

        return (
            `<TinyDB tables=[${tables.map((t) => `'${t}'`).join(', ')}], ` +
            `tables_count=${tables.length}, ` +
            `default_table_documents_count=${this.length}, ` +
            `all_tables_documents_count=[${tablesCounts.join(', ')}]>`
        );
    }
}

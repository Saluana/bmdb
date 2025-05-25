import {
    Table,
    type PaginatedResult,
    LazyIterator,
    type LazyIteratorOptions,
    type ParallelQueryOptions,
} from './Table';
import { SchemaTable } from './SchemaTable';
import type { Storage, StorageCtor } from '../storage/Storage';
import { JSONStorage } from '../storage/JSONStorage';
import type { Doc, JsonObject } from '../utils/types';
import type { QueryInstance } from '../query/QueryInstance';
import type { BmDbSchema } from '../schema/BmDbSchema';
import { ConnectionPool, PoolManager } from '../utils/ConnectionPool';

export class TinyDB {
    // Class variables (can be overridden)
    static tableClass = Table;
    static defaultTableName = '_default';
    static defaultStorageClass = JSONStorage;
    static schemaMetadataTableName = '_bmdb_schema_tables';

    private _storage: Storage;
    private _opened = true;
    private _tables = new Map<string, Table<any>>();
    private _connectionPool: ConnectionPool<Table<any>> | null = null;
    private _poolManager = new PoolManager();

    constructor(
        pathOrOptions: string | { storage?: StorageCtor } = 'db.json',
        options: { storage?: StorageCtor } = {}
    ) {
        // Handle different constructor patterns
        let StorageCls = TinyDB.defaultStorageClass;
        let storageArgs: any[] = [];

        // Validate storage class if provided
        if (options.storage) {
            if (typeof options.storage !== 'function') {
                throw new Error(
                    'Storage option must be a constructor function'
                );
            }
            StorageCls = options.storage as any;
            storageArgs = [pathOrOptions];
        } else if (
            typeof pathOrOptions === 'object' &&
            pathOrOptions !== null &&
            pathOrOptions.storage
        ) {
            if (typeof pathOrOptions.storage !== 'function') {
                throw new Error(
                    'Storage option must be a constructor function'
                );
            }
            StorageCls = pathOrOptions.storage as any;
            storageArgs = [];
        } else if (typeof pathOrOptions === 'string') {
            storageArgs = [pathOrOptions];
        } else {
            throw new Error(
                'First argument must be a string path or options object'
            );
        }

        try {
            this._storage = new StorageCls(...storageArgs);
        } catch (error) {
            throw new Error(
                `Failed to initialize storage: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }

        // Load existing data
        try {
            const data = this._storage.read();
            if (data && typeof data === 'object') {
                // First, load schema metadata if it exists
                const schemaMetadata = new Map<string, any>();
                if (data[TinyDB.schemaMetadataTableName]) {
                    const metadataTable = data[TinyDB.schemaMetadataTableName] as Record<string, any>;
                    for (const [docId, metadata] of Object.entries(metadataTable)) {
                        if (metadata && typeof metadata === 'object' && metadata.tableName) {
                            schemaMetadata.set(metadata.tableName, metadata);
                        }
                    }
                }

                // Then load tables, creating SchemaTable instances where appropriate
                for (const [name, tableData] of Object.entries(data)) {
                    if (
                        typeof name === 'string' &&
                        name !== TinyDB.schemaMetadataTableName &&
                        tableData !== null &&
                        typeof tableData === 'object'
                    ) {
                        let table: Table<any>;
                        
                        // Check if this table has schema metadata
                        const metadata = schemaMetadata.get(name);
                        if (metadata && metadata.schemaDefinition) {
                            // This is a schema table - we need to recreate the schema
                            // Note: For now, we'll create a regular table and mark it for later schema restoration
                            // The user will need to call schemaTable() again to properly restore the schema
                            table = new TinyDB.tableClass(this._storage, name);
                            table._loadData(tableData as Record<string, any>);
                            // Mark this table as requiring schema restoration
                            (table as any)._requiresSchemaRestoration = metadata;
                        } else {
                            // Regular table
                            table = new TinyDB.tableClass(this._storage, name);
                            table._loadData(tableData as Record<string, any>);
                        }
                        
                        this._tables.set(name, table);
                    }
                }
            }
        } catch (error) {
            throw new Error(
                `Failed to load existing data: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }

        // Return proxy to forward unknown methods to default table
        return new Proxy(this, {
            get: (target, prop, receiver) => {
                if (Reflect.has(target, prop)) {
                    return Reflect.get(target, prop, receiver);
                }
                // Forward to default table only for string properties
                if (typeof prop === 'string') {
                    const defaultTable = target.table(TinyDB.defaultTableName);
                    const val = (defaultTable as any)[prop];
                    if (typeof val === 'function') {
                        return val.bind(defaultTable);
                    }
                    return val;
                }
                return undefined;
            },
        });
    }

    get storage(): Storage {
        return this._storage;
    }

    private _getSchemaMetadataTable(): Table<any> {
        if (!this._tables.has(TinyDB.schemaMetadataTableName)) {
            const metadataTable = new TinyDB.tableClass(
                this._storage,
                TinyDB.schemaMetadataTableName
            );
            this._tables.set(TinyDB.schemaMetadataTableName, metadataTable);
        }
        return this._tables.get(TinyDB.schemaMetadataTableName)!;
    }

    private _saveSchemaMetadata(tableName: string, schema: BmDbSchema<any>): void {
        const metadataTable = this._getSchemaMetadataTable();
        const metadata = {
            tableName,
            schemaDefinition: schema.serialize(), // We'll need to add this method to BmDbSchema
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        
        // Remove existing metadata for this table
        const existingDocs = metadataTable.search((doc: any) => doc.tableName === tableName);
        if (existingDocs.length > 0) {
            metadataTable.remove((doc: any) => doc.tableName === tableName);
        }
        
        metadataTable.insert(metadata);
    }

    private _removeSchemaMetadata(tableName: string): void {
        const metadataTable = this._getSchemaMetadataTable();
        metadataTable.remove((doc: any) => doc.tableName === tableName);
    }

    table<T extends Record<string, any> = any>(
        name: string,
        options: { cacheSize?: number; persistEmpty?: boolean } = {}
    ): Table<T> {
        if (typeof name !== 'string' || name.trim() === '') {
            throw new Error('Table name must be a non-empty string');
        }

        if (this._tables.has(name)) {
            return this._tables.get(name)! as Table<T>;
        }

        // Validate options
        if (options && typeof options === 'object') {
            if (
                options.cacheSize !== undefined &&
                (typeof options.cacheSize !== 'number' || options.cacheSize < 0)
            ) {
                throw new Error(
                    'cacheSize option must be a non-negative number'
                );
            }
            if (
                options.persistEmpty !== undefined &&
                typeof options.persistEmpty !== 'boolean'
            ) {
                throw new Error('persistEmpty option must be a boolean');
            }
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
            
            // Check if this table was marked for schema restoration
            if ((existing as any)._requiresSchemaRestoration) {
                // Convert the regular table to a schema table
                const schemaTable = new SchemaTable(
                    this._storage,
                    schema,
                    tableName,
                    options
                );
                
                // Copy the existing data
                const existingData = existing!.all();
                if (existingData.length > 0) {
                    // Clear the schema table and insert existing data
                    schemaTable.truncate();
                    for (const doc of existingData) {
                        // Remove the doc_id for reinsertion
                        const { doc_id, ...dataWithoutId } = doc;
                        
                        // Deserialize the data to convert JSON strings back to proper types
                        try {
                            const deserializedData = schema.deserialize(dataWithoutId);
                            const validatedData = schema.validate(deserializedData);
                            schemaTable.insert(validatedData);
                        } catch (restorationError) {
                            console.warn('Failed to restore data for table', tableName, ':', restorationError);
                        }
                    }
                }
                
                // Replace the table in our map
                this._tables.set(tableName, schemaTable);
                
                // Save schema metadata
                this._saveSchemaMetadata(tableName, schema);
                
                return schemaTable;
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
        
        // Save schema metadata
        this._saveSchemaMetadata(tableName, schema);
        
        return table;
    }

    tables(): Set<string> {
        try {
            const data = this._storage.read();
            if (data && typeof data === 'object' && data !== null) {
                return new Set(
                    Object.keys(data).filter((key) => 
                        typeof key === 'string' && key !== TinyDB.schemaMetadataTableName
                    )
                );
            }
            return new Set();
        } catch (error) {
            console.warn('Failed to read table names:', error);
            return new Set();
        }
    }

    dropTables(): void {
        this._storage.write({});
        this._tables.clear();
    }

    dropTable(name: string): void {
        if (typeof name !== 'string' || name.trim() === '') {
            throw new Error('Table name must be a non-empty string');
        }

        // Don't allow dropping the schema metadata table directly
        if (name === TinyDB.schemaMetadataTableName) {
            throw new Error('Cannot drop schema metadata table');
        }

        if (this._tables.has(name)) {
            this._tables.delete(name);
        }

        // Remove schema metadata if it exists
        this._removeSchemaMetadata(name);

        try {
            const data = this._storage.read();
            if (
                data &&
                typeof data === 'object' &&
                data !== null &&
                data[name]
            ) {
                delete data[name];
                this._storage.write(data);
            }
        } catch (error) {
            throw new Error(
                `Failed to drop table '${name}': ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    close(): void {
        this._opened = false;
        this._storage.close();
        if (this._connectionPool) {
            this._connectionPool.close();
        }
        this._poolManager.closeAll();
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
    insert(document: Record<string, any>): number {
        if (!document || typeof document !== 'object') {
            throw new Error('Document must be an object');
        }
        return this.table(TinyDB.defaultTableName).insert(document);
    }

    insertMultiple(documents: Record<string, any>[]): number[] {
        if (!Array.isArray(documents)) {
            throw new Error('Documents must be an array');
        }
        if (documents.some((doc) => !doc || typeof doc !== 'object')) {
            throw new Error('All documents must be objects');
        }
        return this.table(TinyDB.defaultTableName).insertMultiple(documents);
    }

    all(): any[] {
        return this.table(TinyDB.defaultTableName).all();
    }

    search(cond: any): any[] {
        return this.table(TinyDB.defaultTableName).search(cond);
    }

    get(cond?: any, docId?: number, docIds?: number[]): any {
        if (
            docId !== undefined &&
            (typeof docId !== 'number' || !Number.isInteger(docId) || docId < 0)
        ) {
            throw new Error('docId must be a non-negative integer');
        }
        if (
            docIds !== undefined &&
            (!Array.isArray(docIds) ||
                docIds.some(
                    (id) =>
                        typeof id !== 'number' ||
                        !Number.isInteger(id) ||
                        id < 0
                ))
        ) {
            throw new Error('docIds must be an array of non-negative integers');
        }
        return this.table(TinyDB.defaultTableName).get(cond, docId, docIds);
    }

    contains(cond?: any, docId?: number): boolean {
        if (
            docId !== undefined &&
            (typeof docId !== 'number' || !Number.isInteger(docId) || docId < 0)
        ) {
            throw new Error('docId must be a non-negative integer');
        }
        return this.table(TinyDB.defaultTableName).contains(cond, docId);
    }

    update(
        fields: Record<string, any>,
        cond?: any,
        docIds?: number[]
    ): number[] {
        if (!fields || typeof fields !== 'object') {
            throw new Error('Fields must be an object');
        }
        if (
            docIds !== undefined &&
            (!Array.isArray(docIds) ||
                docIds.some(
                    (id) =>
                        typeof id !== 'number' ||
                        !Number.isInteger(id) ||
                        id < 0
                ))
        ) {
            throw new Error('docIds must be an array of non-negative integers');
        }
        return this.table(TinyDB.defaultTableName).update(fields, cond, docIds);
    }

    updateMultiple(
        updates: Array<
            [Partial<any> | ((doc: Record<string, any>) => void), any]
        >
    ): number[] {
        if (!Array.isArray(updates)) {
            throw new Error('Updates must be an array');
        }
        return this.table(TinyDB.defaultTableName).updateMultiple(updates);
    }

    upsert(document: Record<string, any>, cond?: any): number[] {
        if (!document || typeof document !== 'object') {
            throw new Error('Document must be an object');
        }
        return this.table(TinyDB.defaultTableName).upsert(document, cond);
    }

    remove(cond?: any, docIds?: number[]): number[] {
        if (
            docIds !== undefined &&
            (!Array.isArray(docIds) ||
                docIds.some(
                    (id) =>
                        typeof id !== 'number' ||
                        !Number.isInteger(id) ||
                        id < 0
                ))
        ) {
            throw new Error('docIds must be an array of non-negative integers');
        }
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

    // Pagination methods
    searchPaginated(
        cond: any,
        page: number = 1,
        pageSize: number = 50
    ): PaginatedResult<any> {
        return this.table(TinyDB.defaultTableName).searchPaginated(
            cond,
            page,
            pageSize
        );
    }

    allPaginated(
        page: number = 1,
        pageSize: number = 50
    ): PaginatedResult<any> {
        return this.table(TinyDB.defaultTableName).allPaginated(page, pageSize);
    }

    lazy(
        condition?: any,
        options: LazyIteratorOptions = {}
    ): LazyIterator<any> {
        return this.table(TinyDB.defaultTableName).lazy(condition, options);
    }

    // Parallel query methods
    async searchParallel(
        cond: any,
        options: ParallelQueryOptions = {}
    ): Promise<any[]> {
        return this.table(TinyDB.defaultTableName).searchParallel(cond, options);
    }

    async updateParallel(
        updates: Array<{
            fields: Partial<any> | ((doc: Record<string, any>) => void);
            condition: any;
        }>,
        options: ParallelQueryOptions = {}
    ): Promise<number[]> {
        return this.table(TinyDB.defaultTableName).updateParallel(updates, options);
    }

    async aggregateParallel<R>(
        aggregator: (docs: any[]) => R,
        combiner: (results: R[]) => R,
        condition?: any,
        options: ParallelQueryOptions = {}
    ): Promise<R> {
        return this.table(TinyDB.defaultTableName).aggregateParallel(
            aggregator,
            combiner,
            condition,
            options
        );
    }

    // Connection pooling methods
    enableConnectionPool(
        options: {
            maxConnections?: number;
            minConnections?: number;
            maxIdleTime?: number;
        } = {}
    ): void {
        if (this._connectionPool) {
            return; // Already enabled
        }

        this._connectionPool = new ConnectionPool<Table<any>>({
            maxConnections: options.maxConnections || 10,
            minConnections: options.minConnections || 2,
            maxIdleTime: options.maxIdleTime || 30000,
            factory: () => {
                // Create a new isolated table instance
                return new TinyDB.tableClass(
                    this._storage,
                    TinyDB.defaultTableName
                );
            },
            validator: (table) => {
                // Basic validation - ensure table is still valid
                return table && typeof table.search === 'function';
            },
        });
    }

    async withConnection<T>(
        operation: (table: Table<any>) => Promise<T> | T
    ): Promise<T> {
        if (!this._connectionPool) {
            // No pooling, use direct table access
            return operation(this.table(TinyDB.defaultTableName));
        }

        const connection = await this._connectionPool.acquire();
        try {
            return await operation(connection.instance);
        } finally {
            await this._connectionPool.release(connection);
        }
    }

    // Batch operations with connection pooling
    async batchOperation<T>(
        operations: Array<(table: Table<any>) => Promise<T> | T>
    ): Promise<T[]> {
        if (!this._connectionPool) {
            // No pooling, execute sequentially
            const table = this.table(TinyDB.defaultTableName);
            const results: T[] = [];
            for (const op of operations) {
                results.push(await op(table));
            }
            return results;
        }

        // Execute operations concurrently using connection pool
        const promises = operations.map(async (operation) => {
            const connection = await this._connectionPool!.acquire();
            try {
                return await operation(connection.instance);
            } finally {
                await this._connectionPool!.release(connection);
            }
        });

        return Promise.all(promises);
    }

    // Get connection pool statistics
    getPoolStats(): any {
        if (!this._connectionPool) {
            return { poolingEnabled: false };
        }
        return {
            poolingEnabled: true,
            ...this._connectionPool.getStats(),
        };
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

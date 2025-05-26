import type {
    Storage,
    IndexDefinition,
    VectorIndexDefinition,
} from './Storage';
import { deepFreeze } from '../utils/freeze';
import type { JsonObject } from '../utils/types';
import {
    VectorUtils,
    type Vector,
    type VectorSearchResult,
    type VectorIndex,
} from '../utils/VectorUtils';
import { MessagePackUtil } from '../utils/MessagePackUtil';
import { FileSystem } from '../utils/FileSystem';

/**
 * High-performance JSON storage that prioritizes speed over frequent durability.
 * Uses in-memory operations with periodic snapshots for optimal performance.
 */
export class JSONStorage implements Storage {
    private path: string;
    private indexPath: string;

    private lockFd: number | null = null;
    private readLockCount = 0;
    private writeLocked = false;

    private vectorIndexes: Map<string, VectorIndexDefinition> = new Map();
    private vectorData: Map<string, VectorIndex> = new Map();

    private useMsgPack: boolean = false;

    // High-performance in-memory storage
    private memoryData: JsonObject = {};
    private isDirty: boolean = false;

    // Read caching
    private readCache: JsonObject | null = null;
    private cacheValid: boolean = false;

    // Snapshot configuration
    private snapshotInterval: number = 5000; // 5 seconds
    private snapshotTimer: NodeJS.Timeout | null = null;
    private maxDirtyOperations: number = 1000;
    private dirtyOperations: number = 0;
    private snapshotInProgress: boolean = false;

    // Vector index optimization
    private vectorRebuildTimer: NodeJS.Timeout | null = null;
    private vectorRebuildDelay: number = 100; // 100ms delay for batching
    private changedTables: Set<string> = new Set();

    constructor(
        path: string = 'db.json',
        opts: {
            useMsgPack?: boolean;
            snapshotIntervalMs?: number;
            maxDirtyOperations?: number;
        } = {}
    ) {
        this.path = path;
        this.indexPath = path.replace(/\.[^.]+$/, '.idx.json');

        this.useMsgPack = opts.useMsgPack ?? false;
        this.snapshotInterval = opts.snapshotIntervalMs ?? 5000;
        this.maxDirtyOperations = opts.maxDirtyOperations ?? 1000;

        if (this.useMsgPack) {
            this.path = this.path.replace(/\.json$/, '.msgpack');
            this.indexPath = this.indexPath.replace(/\.json$/, '.msgpack');
        }

        this.initializeStorage();
        this.startSnapshotTimer();
    }

    private initializeStorage(): void {
        // Load existing data into memory
        if (FileSystem.exists(this.path)) {
            try {
                if (this.useMsgPack) {
                    const rawData = FileSystem.readSync(this.path) as Buffer;
                    if (rawData && rawData.length > 0) {
                        this.memoryData =
                            (MessagePackUtil.decode(
                                new Uint8Array(rawData)
                            ) as JsonObject) || {};
                    }
                } else {
                    const raw = FileSystem.readSync(this.path, 'utf-8') as string;
                    if (raw && raw.trim() !== '') {
                        this.memoryData = (JSON.parse(raw) as JsonObject) || {};
                    }
                }
            } catch (error) {
                console.warn(
                    'Failed to load existing data, starting fresh:',
                    error
                );
                this.memoryData = {};
            }
        }

        // Create index file if it doesn't exist
        if (!FileSystem.exists(this.indexPath)) {
            if (this.useMsgPack) {
                FileSystem.writeSync(this.indexPath, MessagePackUtil.encode({}));
            } else {
                FileSystem.writeSync(this.indexPath, '{}');
            }
        }
    }

    private startSnapshotTimer(): void {
        this.snapshotTimer = setInterval(() => {
            if (this.isDirty) {
                this.createSnapshot();
            }
        }, this.snapshotInterval);
    }

    private async createSnapshot(): Promise<void> {
        if (!this.isDirty || this.snapshotInProgress) return;

        this.snapshotInProgress = true;

        try {
            const frozen = deepFreeze(this.memoryData);

            if (this.useMsgPack) {
                const data = MessagePackUtil.encode(frozen);
                await FileSystem.write(this.path, data).catch(console.error);
            } else {
                await FileSystem
                    .write(this.path, JSON.stringify(frozen, null, 0))
                    .catch(console.error);
            }

            this.isDirty = false;
            this.dirtyOperations = 0;
        } catch (error) {
            console.error('Error creating snapshot:', error);
        } finally {
            this.snapshotInProgress = false;
        }
    }

    private createSnapshotSync(): void {
        if (!this.isDirty || this.snapshotInProgress) return;

        this.snapshotInProgress = true;

        try {
            const frozen = deepFreeze(this.memoryData);

            if (this.useMsgPack) {
                const data = MessagePackUtil.encode(frozen);
                FileSystem.writeSync(this.path, data);
            } else {
                FileSystem.writeSync(this.path, JSON.stringify(frozen, null, 0));
            }

            this.isDirty = false;
            this.dirtyOperations = 0;
        } catch (error) {
            console.error('Error creating snapshot:', error);
        } finally {
            this.snapshotInProgress = false;
        }
    }

    read(): JsonObject | null {
        // Use cached result if available
        if (this.cacheValid && this.readCache) {
            return this.shallowClone(this.readCache);
        }

        // Create cache with shallow clone
        this.readCache = this.shallowClone(this.memoryData);
        this.cacheValid = true;

        return this.shallowClone(this.readCache);
    }

    private shallowClone(obj: JsonObject): JsonObject {
        if (!obj || typeof obj !== 'object') return obj;

        const result: JsonObject = {};
        for (const [key, value] of Object.entries(obj)) {
            if (Array.isArray(value)) {
                result[key] = [...value];
            } else if (value && typeof value === 'object') {
                // Shallow clone one level deep for table data
                const tableClone: any = {};
                for (const [subKey, subValue] of Object.entries(value)) {
                    if (
                        subValue &&
                        typeof subValue === 'object' &&
                        !Array.isArray(subValue)
                    ) {
                        tableClone[subKey] = { ...subValue };
                    } else {
                        tableClone[subKey] = subValue;
                    }
                }
                result[key] = tableClone;
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    write(obj: JsonObject): void {
        // Replace data completely (not merge) and track changed tables
        this.memoryData = { ...obj };

        // Track which tables changed for selective vector index rebuilding
        for (const tableName of Object.keys(obj)) {
            this.changedTables.add(tableName);
        }

        this.markDirty();

        // Invalidate read cache
        this.cacheValid = false;

        // Schedule deferred vector index rebuilding
        this.scheduleVectorIndexRebuild();

        // Force immediate synchronous snapshot for write() method to ensure file is created
        this.createSnapshotSync();
    }

    private markDirty(): void {
        this.isDirty = true;
        this.dirtyOperations++;

        // Force snapshot if too many dirty operations (async)
        if (this.dirtyOperations >= this.maxDirtyOperations) {
            this.scheduleAsyncSnapshot();
        }
    }

    private scheduleAsyncSnapshot(): void {
        if (this.snapshotInProgress) return;

        setImmediate(() => {
            this.createSnapshot();
        });
    }

    private scheduleVectorIndexRebuild(): void {
        // Clear existing timer
        if (this.vectorRebuildTimer) {
            clearTimeout(this.vectorRebuildTimer);
        }

        // Schedule rebuild with delay to batch multiple writes
        this.vectorRebuildTimer = setTimeout(() => {
            this.rebuildChangedVectorIndexes();
            this.changedTables.clear();
            this.vectorRebuildTimer = null;
        }, this.vectorRebuildDelay);
    }

    close(): void {
        if (this.snapshotTimer) {
            clearInterval(this.snapshotTimer);
            this.snapshotTimer = null;
        }

        if (this.vectorRebuildTimer) {
            clearTimeout(this.vectorRebuildTimer);
            this.vectorRebuildTimer = null;
        }

        // Force any pending vector index rebuilds
        if (this.changedTables.size > 0) {
            this.rebuildChangedVectorIndexes();
            this.changedTables.clear();
        }

        // Final snapshot
        if (this.isDirty) {
            this.createSnapshot();
        }

        if (this.lockFd !== null) {
            FileSystem.closeSync(this.lockFd);
            this.lockFd = null;
        }
    }

    // Index operations
    async createIndex(
        tableName: string,
        field: string,
        options?: { unique?: boolean }
    ): Promise<void> {
        await this.acquireWriteLock();
        try {
            const indexes = this.readIndexes();
            const indexName = `${tableName}_${field}`;

            indexes[indexName] = {
                tableName,
                fields: [field],
                unique: options?.unique ?? false,
                compound: false,
                name: indexName,
            };

            await this.writeIndexes(indexes);
        } finally {
            await this.releaseWriteLock();
        }
    }

    async createCompoundIndex(
        tableName: string,
        fields: string[],
        options?: { unique?: boolean; name?: string }
    ): Promise<void> {
        await this.acquireWriteLock();
        try {
            const indexes = this.readIndexes();
            const indexName =
                options?.name || `${tableName}_${fields.join('_')}`;

            indexes[indexName] = {
                tableName,
                fields,
                unique: options?.unique ?? false,
                compound: true,
                name: indexName,
            };

            await this.writeIndexes(indexes);
        } finally {
            await this.releaseWriteLock();
        }
    }

    async dropIndex(tableName: string, indexName: string): Promise<void> {
        await this.acquireWriteLock();
        try {
            const indexes = this.readIndexes();
            delete indexes[indexName];
            await this.writeIndexes(indexes);
        } finally {
            await this.releaseWriteLock();
        }
    }

    async listIndexes(tableName?: string): Promise<IndexDefinition[]> {
        await this.acquireReadLock();
        try {
            const indexes = this.readIndexes();
            return Object.values(indexes).filter(
                (index) => !tableName || index.tableName === tableName
            );
        } finally {
            await this.releaseReadLock();
        }
    }

    async checkUnique(
        tableName: string,
        field: string,
        value: any,
        excludeDocId?: string
    ): Promise<boolean> {
        await this.acquireReadLock();
        try {
            const table = this.memoryData[tableName];
            if (!table || typeof table !== 'object') return true;

            for (const [docId, doc] of Object.entries(table)) {
                if (excludeDocId && docId === excludeDocId) continue;
                if (
                    typeof doc === 'object' &&
                    doc !== null &&
                    (doc as any)[field] === value
                ) {
                    return false;
                }
            }
            return true;
        } finally {
            await this.releaseReadLock();
        }
    }

    async checkCompoundUnique(
        tableName: string,
        fields: string[],
        values: any[],
        excludeDocId?: string
    ): Promise<boolean> {
        await this.acquireReadLock();
        try {
            const table = this.memoryData[tableName];
            if (!table || typeof table !== 'object') return true;

            for (const [docId, doc] of Object.entries(table)) {
                if (excludeDocId && docId === excludeDocId) continue;
                if (typeof doc === 'object' && doc !== null) {
                    const docValues = fields.map(
                        (field) => (doc as any)[field]
                    );
                    if (JSON.stringify(docValues) === JSON.stringify(values)) {
                        return false;
                    }
                }
            }
            return true;
        } finally {
            await this.releaseReadLock();
        }
    }

    // Vector operations
    async createVectorIndex(
        tableName: string,
        field: string,
        dimensions: number,
        algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine'
    ): Promise<void> {
        await this.acquireWriteLock();
        try {
            const indexName = `${tableName}_${field}_vector`;
            const indexDef: VectorIndexDefinition = {
                tableName,
                field,
                dimensions,
                algorithm,
                name: indexName,
            };

            this.vectorIndexes.set(indexName, indexDef);
            this.buildVectorIndex(indexDef);
        } finally {
            await this.releaseWriteLock();
        }
    }

    async dropVectorIndex(tableName: string, indexName: string): Promise<void> {
        await this.acquireWriteLock();
        try {
            this.vectorIndexes.delete(indexName);
            this.vectorData.delete(indexName);
        } finally {
            await this.releaseWriteLock();
        }
    }

    async listVectorIndexes(
        tableName?: string
    ): Promise<VectorIndexDefinition[]> {
        await this.acquireReadLock();
        try {
            return Array.from(this.vectorIndexes.values()).filter(
                (index) => !tableName || index.tableName === tableName
            );
        } finally {
            await this.releaseReadLock();
        }
    }

    async vectorSearch(
        tableName: string,
        field: string,
        queryVector: Vector,
        options?: { limit?: number; threshold?: number }
    ): Promise<VectorSearchResult[]> {
        await this.acquireReadLock();
        try {
            const indexName = `${tableName}_${field}_vector`;
            const vectorIndex = this.vectorData.get(indexName);

            if (!vectorIndex) {
                throw new Error(
                    `Vector index not found for table '${tableName}', field '${field}'`
                );
            }

            VectorUtils.validateVector(queryVector, vectorIndex.dimensions);

            const searchResults = VectorUtils.searchVectors(
                queryVector,
                vectorIndex.vectors,
                vectorIndex.algorithm,
                options?.limit,
                options?.threshold
            );

            const table = this.memoryData[tableName];
            if (!table || typeof table !== 'object') {
                return [];
            }

            return searchResults.map((result) => ({
                docId: result.docId,
                score: result.score,
                document: (table as any)[result.docId],
            }));
        } finally {
            await this.releaseReadLock();
        }
    }

    supportsFeature(
        feature:
            | 'compoundIndex'
            | 'batch'
            | 'tx'
            | 'async'
            | 'fileLocking'
            | 'vectorSearch'
    ): boolean {
        return [
            'compoundIndex',
            'async',
            'fileLocking',
            'vectorSearch',
        ].includes(feature);
    }

    // Locking operations
    async acquireWriteLock(): Promise<void> {
        if (this.writeLocked) return;

        let waitTime = 0;
        while (this.readLockCount > 0 && waitTime < 1000) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            waitTime += 10;
        }

        if (this.readLockCount > 0) {
            throw new Error('Timeout waiting for read locks to release');
        }

        const lockFile = this.path + '.write.lock';
        let attempts = 0;
        const maxAttempts = 100;

        while (FileSystem.exists(lockFile) && attempts < maxAttempts) {
            try {
                const lockContent = FileSystem.readSync(lockFile, 'utf-8') as string;
                const lockPid = parseInt(lockContent);

                if (lockPid === process.pid) {
                    FileSystem.unlinkSync(lockFile);
                    break;
                }

                const stats = FileSystem.statSync(lockFile);
                const lockAge = Date.now() - stats.mtime.getTime();
                if (lockAge > 5000) {
                    console.warn('Removing stale lock file');
                    FileSystem.unlinkSync(lockFile);
                    break;
                }
            } catch {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 10));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw new Error('Timeout waiting for write lock');
        }

        try {
            FileSystem.writeSync(lockFile, process.pid.toString());
            this.writeLocked = true;
        } catch (error) {
            throw new Error(`Failed to acquire write lock: ${error}`);
        }
    }

    async releaseWriteLock(): Promise<void> {
        if (!this.writeLocked) return;

        const lockFile = this.path + '.write.lock';
        this.cleanupLockFile(lockFile);
        this.writeLocked = false;
    }

    private cleanupLockFile(lockPath: string): void {
        const maxRetries = 3;
        let retries = 0;
        
        while (retries < maxRetries) {
            try {
                if (FileSystem.exists(lockPath)) {
                    FileSystem.unlinkSync(lockPath);
                    return; // Success
                }
                return; // File doesn't exist, nothing to clean
            } catch (error) {
                retries++;
                
                if (retries >= maxRetries) {
                    console.warn(`Failed to cleanup lock file ${lockPath} after ${maxRetries} attempts:`, error);
                    
                    // Mark the lock file for cleanup on next startup if possible
                    try {
                        const staleMarkerPath = `${lockPath}.stale`;
                        FileSystem.writeSync(staleMarkerPath, Date.now().toString());
                    } catch {
                        // If we can't even write a stale marker, the filesystem has serious issues
                    }
                    return;
                }
                
                // Brief delay before retry
                const delay = 50 * retries; // 50ms, 100ms, 150ms
                const start = Date.now();
                while (Date.now() - start < delay) {
                    // Busy wait for very short delay
                }
            }
        }
    }

    async acquireReadLock(): Promise<void> {
        if (this.writeLocked) {
            this.readLockCount++;
            return;
        }

        const lockFile = this.path + '.write.lock';
        let attempts = 0;
        const maxAttempts = 100;

        while (FileSystem.exists(lockFile) && attempts < maxAttempts) {
            try {
                const lockContent = FileSystem.readSync(lockFile, 'utf-8') as string;
                const lockPid = parseInt(lockContent);
                if (lockPid === process.pid) {
                    break;
                }
            } catch {
                // Continue waiting
            }

            await new Promise((resolve) => setTimeout(resolve, 10));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw new Error('Timeout waiting for write lock to release');
        }

        this.readLockCount++;
    }

    async releaseReadLock(): Promise<void> {
        if (this.readLockCount <= 0) return;
        this.readLockCount--;
    }

    private readIndexes(): Record<string, IndexDefinition> {
        try {
            if (this.useMsgPack) {
                const data = FileSystem.readSync(this.indexPath) as Buffer;
                if (!data || data.length === 0) {
                    return {};
                }
                return MessagePackUtil.decode(new Uint8Array(data)) || {};
            } else {
                const raw = FileSystem.readSync(this.indexPath, 'utf-8') as string;
                return JSON.parse(raw) || {};
            }
        } catch {
            return {};
        }
    }

    private async writeIndexes(
        indexes: Record<string, IndexDefinition>
    ): Promise<void> {
        if (this.useMsgPack) {
            const data = MessagePackUtil.encode(indexes);
            await FileSystem.write(this.indexPath, data).catch(console.error);
        } else {
            await FileSystem
                .write(this.indexPath, JSON.stringify(indexes, null, 0))
                .catch(console.error);
        }
    }

    private buildVectorIndex(indexDef: VectorIndexDefinition): void {
        const vectorIndex = VectorUtils.createVectorIndex(
            indexDef.field,
            indexDef.dimensions,
            indexDef.algorithm
        );

        const table = this.memoryData[indexDef.tableName];
        if (table && typeof table === 'object') {
            for (const [docId, doc] of Object.entries(table)) {
                if (typeof doc === 'object' && doc !== null) {
                    const vectorValue = (doc as any)[indexDef.field];
                    if (Array.isArray(vectorValue)) {
                        try {
                            VectorUtils.addToIndex(
                                vectorIndex,
                                docId,
                                vectorValue
                            );
                        } catch (error) {
                            console.warn(
                                `Skipping invalid vector for doc ${docId}: ${error}`
                            );
                        }
                    }
                }
            }
        }

        this.vectorData.set(indexDef.name!, vectorIndex);
    }

    private rebuildVectorIndexes(): void {
        for (const indexDef of this.vectorIndexes.values()) {
            this.buildVectorIndex(indexDef);
        }
    }

    private rebuildChangedVectorIndexes(): void {
        // Only rebuild indexes for tables that have changed
        for (const indexDef of this.vectorIndexes.values()) {
            if (this.changedTables.has(indexDef.tableName)) {
                this.buildVectorIndex(indexDef);
            }
        }
    }

    // Optimized update method
    update(obj: JsonObject): void {
        // Deep merge for incremental updates and track changed tables
        for (const [key, value] of Object.entries(obj)) {
            this.changedTables.add(key);

            if (
                typeof value === 'object' &&
                value !== null &&
                this.memoryData[key] &&
                typeof this.memoryData[key] === 'object'
            ) {
                this.memoryData[key] = {
                    ...(this.memoryData[key] as any),
                    ...value,
                };
            } else {
                this.memoryData[key] = value;
            }
        }

        this.markDirty();

        // Invalidate read cache
        this.cacheValid = false;

        // Schedule deferred vector index rebuilding
        this.scheduleVectorIndexRebuild();
    }

    // Performance monitoring
    getStats(): {
        isDirty: boolean;
        dirtyOperations: number;
        memorySize: number;
        snapshotInterval: number;
    } {
        return {
            isDirty: this.isDirty,
            dirtyOperations: this.dirtyOperations,
            memorySize: JSON.stringify(this.memoryData).length,
            snapshotInterval: this.snapshotInterval,
        };
    }

    // Force snapshot creation
    forceSnapshot(): void {
        this.createSnapshot();
    }
}

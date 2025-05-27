/**
 * Binary storage implementation with memory-mapped B-tree index
 *
 * File format:
 * [Header 32 bytes] [B-tree nodes] [Document data blocks]
 *
 * Header structure:
 * - Magic number (4 bytes): "BMDB"
 * - Version (4 bytes): Format version
 * - Root node offset (4 bytes): Offset to B-tree root
 * - Next node offset (4 bytes): Next available B-tree node offset
 * - Document count (4 bytes): Total number of documents
 * - Free space offset (4 bytes): Start of free space for documents
 * - Reserved (8 bytes): For future use
 */

import type { Storage, VectorIndexDefinition } from './Storage';
import type { JsonObject } from '../utils/types';
import type { Vector, VectorSearchResult } from '../utils/VectorUtils';
import { MessagePackUtil } from '../utils/MessagePackUtil';
import { BTree, type BTreeEntry } from '../utils/BTree';
import { FileSystem } from '../utils/FileSystem';

const MAGIC_NUMBER = 0x424d4442; // "BMDB"
const FORMAT_VERSION = 1;
const HEADER_SIZE = 32;
const MMAP_CHUNK_SIZE = 64 * 1024; // 64KB chunks for memory mapping

interface FileHeader {
    magic: number;
    version: number;
    rootNodeOffset: number;
    nextNodeOffset: number;
    documentCount: number;
    freeSpaceOffset: number;
    reserved1: number;
    reserved2: number;
}

interface MemoryMappedChunk {
    buffer: Buffer;
    offset: number;
    size: number;
    dirty: boolean;
    lastAccessed: number;
}

interface PendingWrite {
    offset: number;
    data: Buffer;
    length: number;
}

export class BinaryStorage implements Storage {
    private fd: number = -1;
    private path: string;
    private btree: BTree;
    private header!: FileHeader;
    private fileSize: number = 0;
    private cleanupRegistered: boolean = false;
    private mmapChunks: Map<number, MemoryMappedChunk> = new Map();
    private maxCacheSize: number = 16; // Maximum number of cached chunks
    private mmapEnabled: boolean = true;
    private headerDirty: boolean = false; // Track if header needs writing

    // Write batching system
    private pendingWrites: PendingWrite[] = [];
    private batchTimer: NodeJS.Timeout | null = null;
    private batchSizeLimit: number = 1000; // Batch up to 1000 writes
    private batchTimeLimit: number = 1000; // Flush after 1000ms
    
    // Performance optimizations
    private preAllocatedSize: number = 0; // Track pre-allocated file size
    private fileExtensionChunkSize: number = 16 * 1024 * 1024; // 16MB chunks for better performance
    
    // Buffer pool for reducing allocations
    private bufferPool: Buffer[] = [];
    private maxPoolSize: number = 50;

    constructor(
        path: string = 'db.bmdb',
        options: {
            maxCacheSize?: number;
            mmapEnabled?: boolean;
            chunkSize?: number;
            batchSize?: number;
            batchTimeMs?: number;
        } = {}
    ) {
        this.path = path;
        this.maxCacheSize = options.maxCacheSize ?? 16;
        this.mmapEnabled = options.mmapEnabled ?? false; // Disable by default for testing
        this.batchSizeLimit = options.batchSize ?? 1000;
        this.batchTimeLimit = options.batchTimeMs ?? 1000;

        // Initialize B-tree with memory-mapped file I/O callbacks and larger cache
        this.btree = new BTree(
            (offset) => this.readNodeFromFile(offset),
            (offset, data) => this.writeNodeToFile(offset, data),
            5000 // Larger cache size for better performance
        );

        this.initializeFile();
        this.registerCleanupHandlers();
    }

    private registerCleanupHandlers(): void {
        if (this.cleanupRegistered) return;
        this.cleanupRegistered = true;

        const cleanup = () => {
            try {
                this.close();
            } catch (error) {
                // Silently handle cleanup errors during shutdown
            }
        };

        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('uncaughtException', cleanup);
        process.on('unhandledRejection', cleanup);
    }

    private scheduleBatchWrite(offset: number, data: Buffer): void {
        this.pendingWrites.push({ offset, data, length: data.length });

        if (this.pendingWrites.length >= this.batchSizeLimit) {
            this.flushBatchWrites();
        } else if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.flushBatchWrites();
            }, this.batchTimeLimit);
        }
    }

    private flushBatchWrites(): void {
        if (this.pendingWrites.length === 0 && !this.headerDirty) return;

        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        try {
            // Flush pending writes if any
            if (this.pendingWrites.length > 0) {
                // Sort writes by offset for better I/O performance
                this.pendingWrites.sort((a, b) => a.offset - b.offset);

                for (const write of this.pendingWrites) {
                    const bytesWritten = FileSystem.writeSyncFd(
                        this.fd,
                        write.data,
                        0,
                        write.length,
                        write.offset
                    );
                    if (bytesWritten !== write.length) {
                        throw new Error(
                            `Expected to write ${write.length} bytes, but wrote ${bytesWritten}`
                        );
                    }
                }
            }

            // Flush header if dirty
            if (this.headerDirty) {
                this.writeHeaderImmediate();
                this.headerDirty = false;
            }
        } finally {
            this.pendingWrites = [];
        }
    }

    read(): JsonObject | null {
        if (this.fd === -1) return null;

        try {
            // Flush any pending writes before reading
            this.flushBatchWrites();

            // Get all entries from B-tree
            const entries = this.btree.getAllEntries();

            if (entries.length === 0) return null;

            const result: JsonObject = {};

            // Read each table's documents
            const tableMap = new Map<string, Record<string, any>>();

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];

                const [tableName, docId] = this.parseEntryKey(entry.key);
                const documentData = this.readDocumentData(
                    entry.offset,
                    entry.length
                );

                if (!tableMap.has(tableName)) {
                    tableMap.set(tableName, {});
                }

                tableMap.get(tableName)![docId] = documentData;
            }

            // Convert to expected format
            tableMap.forEach((documents, tableName) => {
                result[tableName] = documents;
            });

            return result;
        } catch (error) {
            console.error('Error reading from binary storage:', error);
            return null;
        }
    }

    write(obj: JsonObject): void {
        if (this.fd === -1) {
            throw new Error('Storage not initialized');
        }

        try {
            // Clear existing data by reinitializing
            this.clearData();

            // Write each table
            for (const [tableName, tableData] of Object.entries(obj)) {
                if (typeof tableData === 'object' && tableData !== null) {
                    this.writeTable(
                        tableName,
                        tableData as Record<string, any>
                    );
                }
            }

            // Flush any pending batch writes to ensure data is written to disk
            this.flushBatchWrites();

            // Update header
            this.writeHeaderImmediate();
        } catch (error) {
            console.error('Error writing to binary storage:', error);
            throw error;
        }
    }

    close(): void {
        // Flush any pending batch writes first
        this.flushBatchWrites();

        // Flush all dirty memory-mapped chunks
        this.flushAllChunks();

        // Clear memory-mapped chunks cache
        this.mmapChunks.clear();

        if (this.fd !== -1) {
            const fdToClose = this.fd;
            this.fd = -1; // Mark as closed immediately to prevent double-close

            try {
                FileSystem.closeSync(fdToClose);
            } catch (error) {
                console.error(
                    `Error closing file ${this.path} (fd: ${fdToClose}):`,
                    error
                );
                // Don't re-throw during cleanup as it could prevent other cleanup
            }
        }
    }

    // Additional methods for binary storage

    readDocument(tableName: string, docId: string): any | null {
        const key = this.createEntryKey(tableName, docId);
        const entry = this.btree.find(key);

        if (!entry) return null;

        return this.readDocumentData(entry.offset, entry.length);
    }

    writeDocument(tableName: string, docId: string, document: any): void {
        const key = this.createEntryKey(tableName, docId);
        const data = MessagePackUtil.encode(document);

        // Find space for document
        const offset = this.allocateDocumentSpace(data.length);

        // Schedule document data write using batch system
        this.scheduleBatchWrite(offset, Buffer.from(data));

        // Update B-tree index
        const entry: BTreeEntry = {
            key,
            offset,
            length: data.length,
        };

        this.btree.insert(entry);
        this.header.documentCount++;

        // Update root offset in header if it changed
        const newRootOffset = this.btree.getRootOffset();
        if (newRootOffset !== this.header.rootNodeOffset) {
            this.header.rootNodeOffset = newRootOffset;
        }

        // Mark header as dirty but don't write immediately
        this.headerDirty = true;
    }

    removeDocument(tableName: string, docId: string): boolean {
        const key = this.createEntryKey(tableName, docId);
        const removed = this.btree.remove(key);

        if (removed) {
            this.header.documentCount--;
            // Mark header as dirty but don't write immediately
            this.headerDirty = true;
        }

        return removed;
    }

    private initializeFile(): void {
        if (FileSystem.exists(this.path)) {
            // Open existing file
            try {
                this.fd = FileSystem.openSync(this.path, 'r+');
                this.fileSize = FileSystem.fstatSync(this.fd).size;
            } catch (error) {
                throw new Error(
                    `Failed to open existing file '${this.path}': ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }

            if (this.fileSize >= HEADER_SIZE) {
                this.readHeader();

                // Validate file format
                if (this.header.magic !== MAGIC_NUMBER) {
                    throw new Error('Invalid file format');
                }

                if (this.header.version !== FORMAT_VERSION) {
                    throw new Error('Unsupported file version');
                }

                // Initialize B-tree with existing root
                if (this.header.rootNodeOffset !== -1) {
                    this.btree.setRootOffset(this.header.rootNodeOffset);
                }
                this.btree.setNextNodeOffset(this.header.nextNodeOffset);
                
                // Initialize pre-allocated size to current file size
                this.preAllocatedSize = this.fileSize;
            } else {
                // File exists but is invalid, reinitialize
                this.createNewFile();
            }
        } else {
            // Create new file
            try {
                this.fd = FileSystem.openSync(this.path, 'w+');
                this.createNewFile();
            } catch (error) {
                throw new Error(
                    `Failed to create new file '${this.path}': ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }
    }

    private createNewFile(): void {
        // Reserve space for B-tree nodes (1MB initially)
        const btreeAreaSize = 1024 * 1024; // 1MB for B-tree nodes
        const documentAreaStart = HEADER_SIZE + btreeAreaSize;

        this.header = {
            magic: MAGIC_NUMBER,
            version: FORMAT_VERSION,
            rootNodeOffset: -1,
            nextNodeOffset: HEADER_SIZE,
            documentCount: 0,
            freeSpaceOffset: documentAreaStart,
            reserved1: btreeAreaSize, // Store B-tree area size in reserved1
            reserved2: 0,
        };

        this.writeHeaderImmediate();
        this.fileSize = HEADER_SIZE;
        
        // Initialize pre-allocated size to current file size
        this.preAllocatedSize = this.fileSize;
    }

    private readHeader(): void {
        const buffer = Buffer.alloc(HEADER_SIZE);
        try {
            const bytesRead = FileSystem.readSyncFd(
                this.fd,
                buffer,
                0,
                HEADER_SIZE,
                0
            );
            if (bytesRead !== HEADER_SIZE) {
                throw new Error(
                    `Expected to read ${HEADER_SIZE} bytes for header, but got ${bytesRead}`
                );
            }
        } catch (error) {
            throw new Error(
                `Failed to read file header: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }

        const view = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength
        );

        this.header = {
            magic: view.getUint32(0, false),
            version: view.getUint32(4, false),
            rootNodeOffset: view.getInt32(8, false),
            nextNodeOffset: view.getUint32(12, false),
            documentCount: view.getUint32(16, false),
            freeSpaceOffset: view.getUint32(20, false),
            reserved1: view.getUint32(24, false),
            reserved2: view.getUint32(28, false),
        };
    }

    // Force flush all pending writes and header updates
    sync(): void {
        this.flushBatchWrites();
    }

    private writeHeader(): void {
        // Mark header as dirty for deferred writing
        this.headerDirty = true;
    }

    private writeHeaderImmediate(): void {
        const buffer = Buffer.alloc(HEADER_SIZE);
        const view = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength
        );

        view.setUint32(0, this.header.magic, false);
        view.setUint32(4, this.header.version, false);
        view.setInt32(8, this.header.rootNodeOffset, false);
        view.setUint32(12, this.header.nextNodeOffset, false);
        view.setUint32(16, this.header.documentCount, false);
        view.setUint32(20, this.header.freeSpaceOffset, false);
        view.setUint32(24, this.header.reserved1, false);
        view.setUint32(28, this.header.reserved2, false);

        try {
            const bytesWritten = FileSystem.writeSyncFd(
                this.fd,
                buffer,
                0,
                HEADER_SIZE,
                0
            );
            if (bytesWritten !== HEADER_SIZE) {
                throw new Error(
                    `Expected to write ${HEADER_SIZE} bytes for header, but wrote ${bytesWritten}`
                );
            }
        } catch (error) {
            throw new Error(
                `Failed to write file header: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    private readNodeFromFile(offset: number): Uint8Array {
        if (this.mmapEnabled) {
            return this.readFromMappedChunk(offset, 1024);
        } else {
            const buffer = this.getBuffer(1024); // Use buffer pool
            try {
                const bytesRead = FileSystem.readSyncFd(
                    this.fd,
                    buffer,
                    0,
                    1024,
                    offset
                );
                if (bytesRead !== 1024) {
                    throw new Error(
                        `Expected to read 1024 bytes, but got ${bytesRead}`
                    );
                }
                
                // Create copy since we're returning the buffer to pool
                const result = new Uint8Array(buffer.subarray(0, 1024));
                this.returnBuffer(buffer);
                return result;
            } catch (error) {
                this.returnBuffer(buffer);
                throw new Error(
                    `Failed to read node from file at offset ${offset}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }
    }

    private writeNodeToFile(offset: number, data: Uint8Array): void {
        if (this.mmapEnabled) {
            this.writeToMappedChunk(offset, data);

            // Update next node offset if this is a new node
            if (offset >= this.header.nextNodeOffset) {
                this.header.nextNodeOffset = offset + 1024;
                this.headerDirty = true;
            }
        } else {
            // Use pre-allocation strategy for B-tree nodes
            const requiredSize = offset + data.length;
            if (requiredSize > this.preAllocatedSize) {
                // Pre-allocate space for B-tree nodes in larger chunks
                const nodeChunkSize = 256 * 1024; // 256KB chunks for B-tree nodes (256 nodes)
                const chunksNeeded = Math.ceil((requiredSize - this.preAllocatedSize) / nodeChunkSize);
                const newPreAllocatedSize = this.preAllocatedSize + (chunksNeeded * nodeChunkSize);
                const extensionSize = newPreAllocatedSize - this.fileSize;
                
                if (extensionSize > 0) {
                    const padding = Buffer.alloc(extensionSize);
                    const paddingWritten = FileSystem.writeSyncFd(
                        this.fd,
                        padding,
                        0,
                        extensionSize,
                        this.fileSize
                    );
                    if (paddingWritten !== extensionSize) {
                        throw new Error(
                            `Failed to extend file for B-tree nodes: expected to write ${extensionSize} bytes, but wrote ${paddingWritten}`
                        );
                    }
                    this.fileSize = newPreAllocatedSize;
                }
                
                this.preAllocatedSize = newPreAllocatedSize;
            }

            // Use batch system for B-tree node writes
            this.scheduleBatchWrite(offset, Buffer.from(data));

            // Update next node offset if this is a new node
            if (offset >= this.header.nextNodeOffset) {
                this.header.nextNodeOffset = offset + 1024;
                this.headerDirty = true;
            }
        }
    }

    private readDocumentData(offset: number, length: number): any {
        // Validate parameters
        if (offset < 0 || length <= 0) {
            throw new Error(
                `Invalid read parameters: offset=${offset}, length=${length}`
            );
        }

        if (offset + length > this.fileSize) {
            throw new Error(
                `Read would exceed file size: offset=${offset}, length=${length}, fileSize=${
                    this.fileSize
                }, required=${offset + length}`
            );
        }

        const buffer = this.getBuffer(length);
        try {
            const bytesRead = FileSystem.readSyncFd(
                this.fd,
                buffer,
                0,
                length,
                offset
            );

            if (bytesRead !== length) {
                throw new Error(
                    `Expected to read ${length} bytes, but got ${bytesRead}. Offset: ${offset}, File size: ${this.fileSize}`
                );
            }

            const data = new Uint8Array(buffer.subarray(0, length));

            // Show first few bytes for debugging
            const firstBytes = Array.from(data.slice(0, Math.min(20, data.length)))
                .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
                .join(' ');

            // Add validation for suspicious patterns
            if (data.length !== length) {
                console.log(
                    `[WARNING] Buffer length mismatch: expected ${length}, got ${data.length}`
                );
            }

            const result = MessagePackUtil.decode(data);
            this.returnBuffer(buffer);
            return result;
        } catch (error) {
            this.returnBuffer(buffer);
            console.log(
                `[ERROR] MessagePack decode failed for offset=${offset}, length=${length}`
            );
            throw error;
        }
    }

    private writeTable(
        tableName: string,
        tableData: Record<string, any>
    ): void {
        const entries = Object.entries(tableData);
        
        if (entries.length > 10) {
            // Use bulk insert for larger datasets
            this.writeTableBulk(tableName, tableData);
        } else {
            // Use individual inserts for smaller datasets
            for (const [docId, document] of entries) {
                this.writeDocument(tableName, docId, document);
            }
        }
    }
    
    private writeTableBulk(
        tableName: string,
        tableData: Record<string, any>
    ): void {
        const btreeEntries: BTreeEntry[] = [];
        const pendingWrites: PendingWrite[] = [];
        
        for (const [docId, document] of Object.entries(tableData)) {
            const key = this.createEntryKey(tableName, docId);
            const data = MessagePackUtil.encode(document);
            
            // Allocate space for document
            const offset = this.allocateDocumentSpace(data.length);
            
            // Prepare batch write
            pendingWrites.push({
                offset,
                data: Buffer.from(data),
                length: data.length
            });
            
            // Prepare B-tree entry
            btreeEntries.push({
                key,
                offset,
                length: data.length
            });
            
            this.header.documentCount++;
        }
        
        // Batch write all document data
        for (const write of pendingWrites) {
            this.scheduleBatchWrite(write.offset, write.data);
        }
        
        // Bulk insert all B-tree entries
        this.btree.bulkInsert(btreeEntries);
        
        // Update root offset in header if it changed
        const newRootOffset = this.btree.getRootOffset();
        if (newRootOffset !== this.header.rootNodeOffset) {
            this.header.rootNodeOffset = newRootOffset;
        }
        
        // Mark header as dirty
        this.headerDirty = true;
    }

    private allocateDocumentSpace(length: number): number {
        const offset = this.header.freeSpaceOffset;

        // Check if we have enough pre-allocated space
        const requiredSize = offset + length;
        if (requiredSize > this.preAllocatedSize) {
            try {
                // Use smaller, more reasonable pre-allocation for documents
                const baseChunkSize = 4 * 1024 * 1024; // 4MB base chunks
                
                // Scale chunk size based on document size to avoid over-allocation
                const adaptiveChunkSize = Math.max(baseChunkSize, length * 4); // At least 4x the document size
                const actualChunkSize = Math.min(adaptiveChunkSize, this.fileExtensionChunkSize);
                
                // Allocate one chunk ahead to reduce future extensions
                const newPreAllocatedSize = Math.max(requiredSize, this.preAllocatedSize + actualChunkSize);
                const extensionSize = newPreAllocatedSize - this.fileSize;
                
                if (extensionSize > 0) {
                    const padding = Buffer.alloc(extensionSize);
                    const bytesWritten = FileSystem.writeSyncFd(
                        this.fd,
                        padding,
                        0,
                        extensionSize,
                        this.fileSize
                    );
                    if (bytesWritten !== extensionSize) {
                        throw new Error(
                            `Failed to extend file: expected to write ${extensionSize} bytes, but wrote ${bytesWritten}`
                        );
                    }
                    this.fileSize = newPreAllocatedSize;
                }
                
                this.preAllocatedSize = newPreAllocatedSize;
            } catch (error) {
                throw new Error(
                    `Failed to allocate document space: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        this.header.freeSpaceOffset = offset + length;
        return offset;
    }

    private clearData(): void {
        // Reset B-tree with larger cache size
        this.btree = new BTree(
            (offset) => this.readNodeFromFile(offset),
            (offset, data) => this.writeNodeToFile(offset, data),
            5000 // Same larger cache size as in constructor
        );

        // Calculate document area start (B-tree area size stored in reserved1)
        const btreeAreaSize = this.header.reserved1 || 1024 * 1024;
        const documentAreaStart = HEADER_SIZE + btreeAreaSize;

        // Reset header
        this.header.rootNodeOffset = -1;
        this.header.nextNodeOffset = HEADER_SIZE;
        this.header.documentCount = 0;
        this.header.freeSpaceOffset = documentAreaStart;
    }

    private createEntryKey(tableName: string, docId: string): string {
        return `${tableName}:${docId}`;
    }

    private parseEntryKey(key: string): [string, string] {
        const parts = key.split(':');
        if (parts.length !== 2) {
            throw new Error(`Invalid entry key format: ${key}`);
        }
        return [parts[0], parts[1]];
    }

    // Utility methods for debugging and maintenance

    getStats(): {
        fileSize: number;
        documentCount: number;
        btreeNodes: number;
        freeSpaceOffset: number;
        wastedSpace: number;
        fragmentationRatio: number;
    } {
        const btreeNodes = Math.floor(
            (this.header.nextNodeOffset - HEADER_SIZE) / 1024
        );

        // Calculate wasted space (gaps between used areas)
        const usedDocumentSpace =
            this.header.freeSpaceOffset - (HEADER_SIZE + this.header.reserved1);
        const wastedSpace = this.fileSize - this.header.freeSpaceOffset;
        const fragmentationRatio =
            this.fileSize > 0 ? wastedSpace / this.fileSize : 0;

        return {
            fileSize: this.fileSize,
            documentCount: this.header.documentCount,
            btreeNodes,
            freeSpaceOffset: this.header.freeSpaceOffset,
            wastedSpace,
            fragmentationRatio,
        };
    }

    // Compact file by removing fragmentation
    compact(): void {
        if (this.fd === -1) {
            throw new Error('Storage not initialized');
        }

        const backupPath = `${this.path}.backup`;
        let backupCreated = false;

        try {
            // 1. Create backup of the current file
            try {
                FileSystem.copyFileSync(this.path, backupPath);
                backupCreated = true;
            } catch (error) {
                throw new Error(
                    `Failed to create backup: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }

            // 2. Read all existing documents
            const allEntries = this.btree.getAllEntries();
            if (allEntries.length === 0) {
                // No documents to compact, just reset free space
                this.resetToMinimalSize();
                // Clean up backup on success
                if (backupCreated && FileSystem.exists(backupPath)) {
                    FileSystem.unlinkSync(backupPath);
                }
                return;
            }

            // 2. Read document data for all entries
            const documentData = new Map<
                string,
                { data: any; entry: BTreeEntry }
            >();

            for (const entry of allEntries) {
                try {
                    const data = this.readDocumentData(
                        entry.offset,
                        entry.length
                    );
                    documentData.set(entry.key, { data, entry });
                } catch (error) {
                    console.warn(
                        `Failed to read document with key ${entry.key}, skipping:`,
                        error instanceof Error ? error.message : String(error)
                    );
                    // Skip corrupted documents during compaction
                }
            }

            // 3. Calculate B-tree area size needed
            const btreeAreaSize = this.calculateRequiredBTreeSpace(
                documentData.size
            );
            const documentAreaStart = HEADER_SIZE + btreeAreaSize;

            // 4. Create new B-tree for rebuilt file
            const newBTree = new BTree(
                (offset) => this.readNodeFromFile(offset),
                (offset, data) => this.writeNodeToFile(offset, data)
            );

            // 5. Reset file structure
            this.header.rootNodeOffset = -1;
            this.header.nextNodeOffset = HEADER_SIZE;
            this.header.documentCount = 0;
            this.header.freeSpaceOffset = documentAreaStart;
            this.header.reserved1 = btreeAreaSize;

            // 6. Write documents consecutively starting from document area
            let currentOffset = documentAreaStart;
            const newEntries: BTreeEntry[] = [];

            // Sort entries by key for consistent layout
            const sortedEntries = Array.from(documentData.entries()).sort(
                ([a], [b]) => a.localeCompare(b)
            );

            for (const [key, { data }] of sortedEntries) {
                // Serialize document
                const serializedData = MessagePackUtil.encode(data);

                // Ensure file is large enough
                const requiredSize = currentOffset + serializedData.length;
                if (requiredSize > this.fileSize) {
                    const padding = Buffer.alloc(requiredSize - this.fileSize);
                    FileSystem.writeSyncFd(
                        this.fd,
                        padding,
                        0,
                        padding.length,
                        this.fileSize
                    );
                    this.fileSize = requiredSize;
                }

                // Write document data
                const buffer = Buffer.from(serializedData);
                FileSystem.writeSyncFd(
                    this.fd,
                    buffer,
                    0,
                    serializedData.length,
                    currentOffset
                );

                // Create new entry
                const newEntry: BTreeEntry = {
                    key,
                    offset: currentOffset,
                    length: serializedData.length,
                };

                newEntries.push(newEntry);
                currentOffset += serializedData.length;
            }

            // 7. Build new B-tree with consecutive entries
            for (const entry of newEntries) {
                newBTree.insert(entry);
                this.header.documentCount++;
            }

            // 8. Update header with new B-tree root
            const newRootOffset = newBTree.getRootOffset();
            this.header.rootNodeOffset = newRootOffset;
            this.header.nextNodeOffset = newBTree.getNextNodeOffset();
            this.header.freeSpaceOffset = currentOffset;

            // 9. Replace old B-tree with new one
            this.btree = newBTree;

            // 10. Write updated header
            this.writeHeaderImmediate();

            // 11. Truncate file to remove unused space at the end
            this.truncateFile(currentOffset);

            // 12. Clear node cache since offsets have changed
            this.btree.clearCache();

            // 13. Clean up backup on success
            if (backupCreated && FileSystem.exists(backupPath)) {
                FileSystem.unlinkSync(backupPath);
            }

            console.log(
                `Compaction completed. File size reduced from ${this.fileSize} to ${currentOffset} bytes.`
            );
        } catch (error) {
            console.error('Error during file compaction:', error);

            // Rollback to backup if compaction failed
            if (backupCreated && FileSystem.exists(backupPath)) {
                try {
                    // Close current file
                    FileSystem.closeSync(this.fd);

                    // Restore from backup
                    FileSystem.copyFileSync(backupPath, this.path);

                    // Reopen file
                    this.fd = FileSystem.openSync(this.path, 'r+');
                    this.fileSize = FileSystem.fstatSync(this.fd).size;

                    // Reload header
                    this.readHeader();

                    // Reinitialize B-tree
                    this.btree = new BTree(
                        (offset) => this.readNodeFromFile(offset),
                        (offset, data) => this.writeNodeToFile(offset, data)
                    );
                    if (this.header.rootNodeOffset !== -1) {
                        this.btree.setRootOffset(this.header.rootNodeOffset);
                    }
                    this.btree.setNextNodeOffset(this.header.nextNodeOffset);

                    // Clean up backup
                    FileSystem.unlinkSync(backupPath);

                    console.log(
                        'Successfully rolled back to backup after compaction failure.'
                    );
                } catch (rollbackError) {
                    console.error(
                        'Failed to rollback after compaction error:',
                        rollbackError
                    );
                    // Leave backup file for manual recovery
                }
            }

            throw new Error(
                `File compaction failed: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    private resetToMinimalSize(): void {
        // Reset to empty file with just header and minimal B-tree area
        const btreeAreaSize = 1024 * 1024; // 1MB minimal B-tree area
        const documentAreaStart = HEADER_SIZE + btreeAreaSize;

        this.header.rootNodeOffset = -1;
        this.header.nextNodeOffset = HEADER_SIZE;
        this.header.documentCount = 0;
        this.header.freeSpaceOffset = documentAreaStart;
        this.header.reserved1 = btreeAreaSize;

        this.writeHeaderImmediate();
        this.truncateFile(documentAreaStart);

        // Reset B-tree
        this.btree = new BTree(
            (offset) => this.readNodeFromFile(offset),
            (offset, data) => this.writeNodeToFile(offset, data)
        );
    }

    private calculateRequiredBTreeSpace(documentCount: number): number {
        // Estimate B-tree space needed based on document count
        // Each B-tree node can hold up to 15 entries
        // We need roughly log_16(documentCount) levels

        if (documentCount === 0) {
            return 1024 * 1024; // 1MB minimum
        }

        const entriesPerNode = 15;
        const nodeSize = 1024;

        // Calculate number of leaf nodes needed
        const leafNodes = Math.ceil(documentCount / entriesPerNode);

        // Calculate internal nodes (rough estimate for a balanced tree)
        let internalNodes = 0;
        let currentLevel = leafNodes;

        while (currentLevel > 1) {
            currentLevel = Math.ceil(currentLevel / (entriesPerNode + 1));
            internalNodes += currentLevel;
        }

        const totalNodes = leafNodes + internalNodes;
        const requiredSpace = totalNodes * nodeSize;

        // Add 50% buffer for growth and ensure minimum size
        const bufferedSpace = Math.max(requiredSpace * 1.5, 1024 * 1024);

        return Math.ceil(bufferedSpace);
    }

    private truncateFile(newSize: number): void {
        try {
            FileSystem.ftruncateSync(this.fd, newSize);
            this.fileSize = newSize;
        } catch (error) {
            console.warn('File truncation failed:', error);
            // Truncation failure is not critical, file will just be larger than needed
        }
    }

    // Index management (stub implementations for interface compliance)
    async createIndex(
        tableName: string,
        field: string,
        options?: { unique?: boolean }
    ): Promise<void> {
        // TODO: Implement B-tree based indexing for binary storage
        console.warn('BinaryStorage: createIndex not fully implemented');
    }

    async createCompoundIndex(
        tableName: string,
        fields: string[],
        options?: { unique?: boolean; name?: string }
    ): Promise<void> {
        // TODO: Implement compound indexing for binary storage
        console.warn(
            'BinaryStorage: createCompoundIndex not fully implemented'
        );
    }

    async dropIndex(tableName: string, indexName: string): Promise<void> {
        // TODO: Implement index dropping for binary storage
        console.warn('BinaryStorage: dropIndex not fully implemented');
    }

    async listIndexes(
        tableName?: string
    ): Promise<import('./Storage').IndexDefinition[]> {
        // TODO: Implement index listing for binary storage
        return [];
    }

    async checkUnique(
        tableName: string,
        field: string,
        value: any,
        excludeDocId?: string
    ): Promise<boolean> {
        // For now, fall back to linear scan
        const data = this.read();
        const table = data?.[tableName];
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
    }

    async checkCompoundUnique(
        tableName: string,
        fields: string[],
        values: any[],
        excludeDocId?: string
    ): Promise<boolean> {
        // For now, fall back to linear scan
        const data = this.read();
        const table = data?.[tableName];
        if (!table || typeof table !== 'object') return true;

        for (const [docId, doc] of Object.entries(table)) {
            if (excludeDocId && docId === excludeDocId) continue;
            if (typeof doc === 'object' && doc !== null) {
                const docValues = fields.map((field) => (doc as any)[field]);
                if (JSON.stringify(docValues) === JSON.stringify(values)) {
                    return false;
                }
            }
        }
        return true;
    }

    // Vector operations (not supported by binary storage)
    async createVectorIndex(): Promise<void> {
        throw new Error('Vector operations not supported by this storage type');
    }

    async dropVectorIndex(): Promise<void> {
        throw new Error('Vector operations not supported by this storage type');
    }

    async listVectorIndexes(): Promise<VectorIndexDefinition[]> {
        throw new Error('Vector operations not supported by this storage type');
    }

    async vectorSearch(): Promise<VectorSearchResult[]> {
        throw new Error('Vector operations not supported by this storage type');
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
        if (feature === 'vectorSearch') return false;
        return ['async'].includes(feature);
    }

    // Memory-mapped chunk management methods

    private getChunkKey(offset: number): number {
        return Math.floor(offset / MMAP_CHUNK_SIZE);
    }

    private getChunkOffset(offset: number): number {
        return offset % MMAP_CHUNK_SIZE;
    }

    private getMappedChunk(chunkKey: number): MemoryMappedChunk {
        let chunk = this.mmapChunks.get(chunkKey);

        if (!chunk) {
            // Evict LRU chunk if cache is full
            if (this.mmapChunks.size >= this.maxCacheSize) {
                this.evictLRUChunk();
            }

            // Create new chunk
            chunk = this.loadChunk(chunkKey);
            this.mmapChunks.set(chunkKey, chunk);
        }

        chunk.lastAccessed = Date.now();
        return chunk;
    }

    private loadChunk(chunkKey: number): MemoryMappedChunk {
        const offset = chunkKey * MMAP_CHUNK_SIZE;
        const maxSize = Math.min(MMAP_CHUNK_SIZE, this.fileSize - offset);
        const size = Math.max(0, maxSize);

        const buffer = Buffer.alloc(MMAP_CHUNK_SIZE);

        if (size > 0 && this.fd !== -1) {
            try {
                const bytesRead = FileSystem.readSyncFd(
                    this.fd,
                    buffer,
                    0,
                    size,
                    offset
                );
                if (bytesRead !== size) {
                    console.warn(
                        `Expected to read ${size} bytes, but got ${bytesRead} for chunk ${chunkKey}`
                    );
                }
            } catch (error) {
                console.warn(`Failed to load chunk ${chunkKey}:`, error);
            }
        }

        return {
            buffer,
            offset,
            size: MMAP_CHUNK_SIZE,
            dirty: false,
            lastAccessed: Date.now(),
        };
    }

    private evictLRUChunk(): void {
        let oldestTime = Date.now();
        let oldestKey = -1;

        for (const [key, chunk] of this.mmapChunks) {
            if (chunk.lastAccessed < oldestTime) {
                oldestTime = chunk.lastAccessed;
                oldestKey = key;
            }
        }

        if (oldestKey !== -1) {
            const chunk = this.mmapChunks.get(oldestKey);
            if (chunk && chunk.dirty) {
                this.flushChunk(oldestKey, chunk);
            }
            this.mmapChunks.delete(oldestKey);
        }
    }

    private flushChunk(chunkKey: number, chunk: MemoryMappedChunk): void {
        if (!chunk.dirty || this.fd === -1) return;

        try {
            const actualSize = Math.min(
                chunk.size,
                this.fileSize - chunk.offset
            );
            if (actualSize > 0) {
                const bytesWritten = FileSystem.writeSyncFd(
                    this.fd,
                    chunk.buffer,
                    0,
                    actualSize,
                    chunk.offset
                );
                if (bytesWritten !== actualSize) {
                    console.warn(
                        `Expected to write ${actualSize} bytes, but wrote ${bytesWritten} for chunk ${chunkKey}`
                    );
                }
            }
            chunk.dirty = false;
        } catch (error) {
            console.error(`Failed to flush chunk ${chunkKey}:`, error);
        }
    }

    private flushAllChunks(): void {
        for (const [key, chunk] of this.mmapChunks) {
            if (chunk.dirty) {
                this.flushChunk(key, chunk);
            }
        }
    }

    private readFromMappedChunk(offset: number, length: number): Uint8Array {
        // Handle cross-chunk reads
        if (length <= MMAP_CHUNK_SIZE) {
            const chunkKey = this.getChunkKey(offset);
            const chunkOffset = this.getChunkOffset(offset);

            // Check if read spans multiple chunks
            if (chunkOffset + length <= MMAP_CHUNK_SIZE) {
                // Single chunk read
                const chunk = this.getMappedChunk(chunkKey);
                return new Uint8Array(
                    chunk.buffer.subarray(chunkOffset, chunkOffset + length)
                );
            }
        }

        // Multi-chunk read or large read - fallback to direct file access
        const buffer = Buffer.alloc(length);
        try {
            const bytesRead = FileSystem.readSyncFd(
                this.fd,
                buffer,
                0,
                length,
                offset
            );
            if (bytesRead !== length) {
                throw new Error(
                    `Expected to read ${length} bytes, but got ${bytesRead}`
                );
            }
        } catch (error) {
            throw new Error(
                `Failed to read from file at offset ${offset}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
        return new Uint8Array(buffer);
    }

    private writeToMappedChunk(offset: number, data: Uint8Array): void {
        // Ensure file is large enough first
        const requiredSize = offset + data.length;
        if (requiredSize > this.fileSize) {
            this.extendFile(requiredSize);
        }

        // Handle cross-chunk writes
        if (data.length <= MMAP_CHUNK_SIZE) {
            const chunkKey = this.getChunkKey(offset);
            const chunkOffset = this.getChunkOffset(offset);

            // Check if write spans multiple chunks
            if (chunkOffset + data.length <= MMAP_CHUNK_SIZE) {
                // Single chunk write
                const chunk = this.getMappedChunk(chunkKey);
                chunk.buffer.set(data, chunkOffset);
                chunk.dirty = true;
                return;
            }
        }

        // Multi-chunk write or large write - fallback to direct file access
        try {
            const buffer = Buffer.from(data);
            const bytesWritten = FileSystem.writeSyncFd(
                this.fd,
                buffer,
                0,
                data.length,
                offset
            );
            if (bytesWritten !== data.length) {
                throw new Error(
                    `Expected to write ${data.length} bytes, but wrote ${bytesWritten}`
                );
            }

            // Invalidate affected chunks
            const startChunk = this.getChunkKey(offset);
            const endChunk = this.getChunkKey(offset + data.length - 1);
            for (let chunkKey = startChunk; chunkKey <= endChunk; chunkKey++) {
                this.mmapChunks.delete(chunkKey);
            }
        } catch (error) {
            throw new Error(
                `Failed to write to file at offset ${offset}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    private extendFile(newSize: number): void {
        try {
            const padding = Buffer.alloc(newSize - this.fileSize);
            const bytesWritten = FileSystem.writeSyncFd(
                this.fd,
                padding,
                0,
                padding.length,
                this.fileSize
            );
            if (bytesWritten !== padding.length) {
                throw new Error(
                    `Failed to extend file: expected to write ${padding.length} bytes, but wrote ${bytesWritten}`
                );
            }
            this.fileSize = newSize;
        } catch (error) {
            throw new Error(
                `Failed to extend file: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    // Performance monitoring
    getCacheStats(): {
        totalChunks: number;
        dirtyChunks: number;
        cacheHitRatio: number;
        memoryUsage: number;
    } {
        const totalChunks = this.mmapChunks.size;
        const dirtyChunks = Array.from(this.mmapChunks.values()).filter(
            (chunk) => chunk.dirty
        ).length;
        const memoryUsage = totalChunks * MMAP_CHUNK_SIZE;

        return {
            totalChunks,
            dirtyChunks,
            cacheHitRatio: 0, // Would need hit/miss tracking to implement
            memoryUsage,
        };
    }

    // Buffer pool methods for performance optimization
    private getBuffer(size: number): Buffer {
        // Only pool smaller buffers to avoid memory waste
        if (size <= 64 * 1024 && this.bufferPool.length > 0) {
            const buffer = this.bufferPool.pop()!;
            if (buffer.length >= size) {
                return buffer.subarray(0, size);
            }
        }
        return Buffer.alloc(size);
    }
    
    private returnBuffer(buffer: Buffer): void {
        // Only pool reasonable-sized buffers and avoid growing pool too large
        if (buffer.length <= 64 * 1024 && this.bufferPool.length < this.maxPoolSize) {
            this.bufferPool.push(buffer);
        }
    }
}

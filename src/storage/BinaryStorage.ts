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
import {
    existsSync,
    openSync,
    closeSync,
    readSync,
    writeSync,
    fstatSync,
    ftruncateSync,
    copyFileSync,
    unlinkSync,
} from 'fs';

const MAGIC_NUMBER = 0x424d4442; // "BMDB"
const FORMAT_VERSION = 1;
const HEADER_SIZE = 32;

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

export class BinaryStorage implements Storage {
    private fd: number = -1;
    private path: string;
    private btree: BTree;
    private header!: FileHeader;
    private fileSize: number = 0;
    private cleanupRegistered: boolean = false;

    constructor(path: string = 'db.bmdb') {
        this.path = path;

        // Initialize B-tree with file I/O callbacks
        this.btree = new BTree(
            (offset) => this.readNodeFromFile(offset),
            (offset, data) => this.writeNodeToFile(offset, data)
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

    read(): JsonObject | null {
        if (this.fd === -1) return null;

        try {
            // Get all entries from B-tree
            const entries = this.btree.getAllEntries();
            if (entries.length === 0) return null;

            const result: JsonObject = {};

            // Read each table's documents
            const tableMap = new Map<string, Record<string, any>>();

            for (const entry of entries) {
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

            // Update header
            this.writeHeader();
        } catch (error) {
            console.error('Error writing to binary storage:', error);
            throw error;
        }
    }

    close(): void {
        if (this.fd !== -1) {
            const fdToClose = this.fd;
            this.fd = -1; // Mark as closed immediately to prevent double-close
            
            try {
                closeSync(fdToClose);
            } catch (error) {
                console.error(`Error closing file ${this.path} (fd: ${fdToClose}):`, error);
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

        // Write document data
        try {
            const bytesWritten = writeSync(this.fd, data, 0, data.length, offset);
            if (bytesWritten !== data.length) {
                throw new Error(`Expected to write ${data.length} bytes, but wrote ${bytesWritten}`);
            }
        } catch (error) {
            throw new Error(`Failed to write document data: ${error instanceof Error ? error.message : String(error)}`);
        }

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

        this.writeHeader();
    }

    removeDocument(tableName: string, docId: string): boolean {
        const key = this.createEntryKey(tableName, docId);
        const removed = this.btree.remove(key);

        if (removed) {
            this.header.documentCount--;
            this.writeHeader();
        }

        return removed;
    }

    private initializeFile(): void {
        if (existsSync(this.path)) {
            // Open existing file
            try {
                this.fd = openSync(this.path, 'r+');
                this.fileSize = fstatSync(this.fd).size;
            } catch (error) {
                throw new Error(`Failed to open existing file '${this.path}': ${error instanceof Error ? error.message : String(error)}`);
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
            } else {
                // File exists but is invalid, reinitialize
                this.createNewFile();
            }
        } else {
            // Create new file
            try {
                this.fd = openSync(this.path, 'w+');
                this.createNewFile();
            } catch (error) {
                throw new Error(`Failed to create new file '${this.path}': ${error instanceof Error ? error.message : String(error)}`);
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

        this.writeHeader();
        this.fileSize = HEADER_SIZE;
    }

    private readHeader(): void {
        const buffer = Buffer.alloc(HEADER_SIZE);
        try {
            const bytesRead = readSync(this.fd, buffer, 0, HEADER_SIZE, 0);
            if (bytesRead !== HEADER_SIZE) {
                throw new Error(`Expected to read ${HEADER_SIZE} bytes for header, but got ${bytesRead}`);
            }
        } catch (error) {
            throw new Error(`Failed to read file header: ${error instanceof Error ? error.message : String(error)}`);
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

    private writeHeader(): void {
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
            const bytesWritten = writeSync(this.fd, buffer, 0, HEADER_SIZE, 0);
            if (bytesWritten !== HEADER_SIZE) {
                throw new Error(`Expected to write ${HEADER_SIZE} bytes for header, but wrote ${bytesWritten}`);
            }
        } catch (error) {
            throw new Error(`Failed to write file header: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private readNodeFromFile(offset: number): Uint8Array {
        const buffer = Buffer.alloc(1024); // BTreeNode.NODE_SIZE
        try {
            const bytesRead = readSync(this.fd, buffer, 0, 1024, offset);
            if (bytesRead !== 1024) {
                throw new Error(`Expected to read 1024 bytes, but got ${bytesRead}`);
            }
        } catch (error) {
            throw new Error(`Failed to read node from file at offset ${offset}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return new Uint8Array(buffer);
    }

    private writeNodeToFile(offset: number, data: Uint8Array): void {
        try {
            // Ensure file is large enough
            const requiredSize = offset + data.length;
            if (requiredSize > this.fileSize) {
                // Extend file size
                const padding = Buffer.alloc(requiredSize - this.fileSize);
                const paddingWritten = writeSync(this.fd, padding, 0, padding.length, this.fileSize);
                if (paddingWritten !== padding.length) {
                    throw new Error(`Failed to extend file: expected to write ${padding.length} bytes, but wrote ${paddingWritten}`);
                }
                this.fileSize = requiredSize;
            }

            const buffer = Buffer.from(data);
            const bytesWritten = writeSync(this.fd, buffer, 0, data.length, offset);
            if (bytesWritten !== data.length) {
                throw new Error(`Expected to write ${data.length} bytes, but wrote ${bytesWritten}`);
            }

            // Update next node offset if this is a new node
            if (offset >= this.header.nextNodeOffset) {
                this.header.nextNodeOffset = offset + 1024;
            }
        } catch (error) {
            throw new Error(`Failed to write node to file at offset ${offset}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private readDocumentData(offset: number, length: number): any {
        const buffer = Buffer.alloc(length);
        const bytesRead = readSync(this.fd, buffer, 0, length, offset);

        if (bytesRead !== length) {
            throw new Error(
                `Expected to read ${length} bytes, but got ${bytesRead}`
            );
        }

        const data = new Uint8Array(buffer);
        return MessagePackUtil.decode(data);
    }

    private writeTable(
        tableName: string,
        tableData: Record<string, any>
    ): void {
        for (const [docId, document] of Object.entries(tableData)) {
            this.writeDocument(tableName, docId, document);
        }
    }

    private allocateDocumentSpace(length: number): number {
        const offset = this.header.freeSpaceOffset;

        // Ensure file is large enough
        const requiredSize = offset + length;
        if (requiredSize > this.fileSize) {
            try {
                const padding = Buffer.alloc(requiredSize - this.fileSize);
                const bytesWritten = writeSync(this.fd, padding, 0, padding.length, this.fileSize);
                if (bytesWritten !== padding.length) {
                    throw new Error(`Failed to extend file: expected to write ${padding.length} bytes, but wrote ${bytesWritten}`);
                }
                this.fileSize = requiredSize;
            } catch (error) {
                throw new Error(`Failed to allocate document space: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        this.header.freeSpaceOffset = offset + length;
        return offset;
    }

    private clearData(): void {
        // Reset B-tree
        this.btree = new BTree(
            (offset) => this.readNodeFromFile(offset),
            (offset, data) => this.writeNodeToFile(offset, data)
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
        const usedDocumentSpace = this.header.freeSpaceOffset - (HEADER_SIZE + this.header.reserved1);
        const wastedSpace = this.fileSize - this.header.freeSpaceOffset;
        const fragmentationRatio = this.fileSize > 0 ? wastedSpace / this.fileSize : 0;

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
                copyFileSync(this.path, backupPath);
                backupCreated = true;
            } catch (error) {
                throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : String(error)}`);
            }

            // 2. Read all existing documents
            const allEntries = this.btree.getAllEntries();
            if (allEntries.length === 0) {
                // No documents to compact, just reset free space
                this.resetToMinimalSize();
                // Clean up backup on success
                if (backupCreated && existsSync(backupPath)) {
                    unlinkSync(backupPath);
                }
                return;
            }

            // 2. Read document data for all entries
            const documentData = new Map<string, { data: any; entry: BTreeEntry }>();
            
            for (const entry of allEntries) {
                try {
                    const data = this.readDocumentData(entry.offset, entry.length);
                    documentData.set(entry.key, { data, entry });
                } catch (error) {
                    console.warn(`Failed to read document with key ${entry.key}, skipping:`, error instanceof Error ? error.message : String(error));
                    // Skip corrupted documents during compaction
                }
            }

            // 3. Calculate B-tree area size needed
            const btreeAreaSize = this.calculateRequiredBTreeSpace(documentData.size);
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
            const sortedEntries = Array.from(documentData.entries()).sort(([a], [b]) => a.localeCompare(b));

            for (const [key, { data }] of sortedEntries) {
                // Serialize document
                const serializedData = MessagePackUtil.encode(data);
                
                // Ensure file is large enough
                const requiredSize = currentOffset + serializedData.length;
                if (requiredSize > this.fileSize) {
                    const padding = Buffer.alloc(requiredSize - this.fileSize);
                    writeSync(this.fd, padding, 0, padding.length, this.fileSize);
                    this.fileSize = requiredSize;
                }

                // Write document data
                const buffer = Buffer.from(serializedData);
                writeSync(this.fd, buffer, 0, serializedData.length, currentOffset);

                // Create new entry
                const newEntry: BTreeEntry = {
                    key,
                    offset: currentOffset,
                    length: serializedData.length
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
            this.writeHeader();

            // 11. Truncate file to remove unused space at the end
            this.truncateFile(currentOffset);

            // 12. Clear node cache since offsets have changed
            this.btree.clearCache();

            // 13. Clean up backup on success
            if (backupCreated && existsSync(backupPath)) {
                unlinkSync(backupPath);
            }

            console.log(`Compaction completed. File size reduced from ${this.fileSize} to ${currentOffset} bytes.`);

        } catch (error) {
            console.error('Error during file compaction:', error);
            
            // Rollback to backup if compaction failed
            if (backupCreated && existsSync(backupPath)) {
                try {
                    // Close current file
                    closeSync(this.fd);
                    
                    // Restore from backup
                    copyFileSync(backupPath, this.path);
                    
                    // Reopen file
                    this.fd = openSync(this.path, 'r+');
                    this.fileSize = fstatSync(this.fd).size;
                    
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
                    unlinkSync(backupPath);
                    
                    console.log('Successfully rolled back to backup after compaction failure.');
                } catch (rollbackError) {
                    console.error('Failed to rollback after compaction error:', rollbackError);
                    // Leave backup file for manual recovery
                }
            }
            
            throw new Error(`File compaction failed: ${error instanceof Error ? error.message : String(error)}`);
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

        this.writeHeader();
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
            ftruncateSync(this.fd, newSize);
            this.fileSize = newSize;
        } catch (error) {
            console.warn('File truncation failed:', error);
            // Truncation failure is not critical, file will just be larger than needed
        }
    }

    // Index management (stub implementations for interface compliance)
    async createIndex(tableName: string, field: string, options?: { unique?: boolean }): Promise<void> {
        // TODO: Implement B-tree based indexing for binary storage
        console.warn('BinaryStorage: createIndex not fully implemented');
    }

    async createCompoundIndex(tableName: string, fields: string[], options?: { unique?: boolean; name?: string }): Promise<void> {
        // TODO: Implement compound indexing for binary storage
        console.warn('BinaryStorage: createCompoundIndex not fully implemented');
    }

    async dropIndex(tableName: string, indexName: string): Promise<void> {
        // TODO: Implement index dropping for binary storage
        console.warn('BinaryStorage: dropIndex not fully implemented');
    }

    async listIndexes(tableName?: string): Promise<import('./Storage').IndexDefinition[]> {
        // TODO: Implement index listing for binary storage
        return [];
    }

    async checkUnique(tableName: string, field: string, value: any, excludeDocId?: string): Promise<boolean> {
        // For now, fall back to linear scan
        const data = this.read();
        const table = data?.[tableName];
        if (!table || typeof table !== 'object') return true;

        for (const [docId, doc] of Object.entries(table)) {
            if (excludeDocId && docId === excludeDocId) continue;
            if (typeof doc === 'object' && doc !== null && (doc as any)[field] === value) {
                return false;
            }
        }
        return true;
    }

    async checkCompoundUnique(tableName: string, fields: string[], values: any[], excludeDocId?: string): Promise<boolean> {
        // For now, fall back to linear scan
        const data = this.read();
        const table = data?.[tableName];
        if (!table || typeof table !== 'object') return true;

        for (const [docId, doc] of Object.entries(table)) {
            if (excludeDocId && docId === excludeDocId) continue;
            if (typeof doc === 'object' && doc !== null) {
                const docValues = fields.map(field => (doc as any)[field]);
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

    supportsFeature(feature: 'compoundIndex' | 'batch' | 'tx' | 'async' | 'fileLocking' | 'vectorSearch'): boolean {
        if (feature === 'vectorSearch') return false;
        return ['async'].includes(feature);
    }
}

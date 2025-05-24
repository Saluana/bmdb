import type {
    Storage,
    IndexDefinition,
    VectorIndexDefinition,
} from './Storage';
import type { JsonObject } from '../utils/types';
import type { Vector, VectorSearchResult } from '../utils/VectorUtils';
import { MessagePackUtil } from '../utils/MessagePackUtil';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { Transform, Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';

export interface StreamingOptions {
    chunkSize?: number;
    maxMemory?: number;
    compression?: boolean;
    bufferSize?: number;
}

export interface DocumentStream {
    tableName: string;
    docId: string;
    document: any;
}

/**
 * Streaming storage implementation for handling large datasets
 * Provides efficient streaming read/write operations for big data processing
 */
export class StreamingStorage implements Storage {
    private basePath: string;
    private options: Required<StreamingOptions>;
    private isStreaming: boolean = false;

    constructor(basePath: string, options: StreamingOptions = {}) {
        this.basePath = basePath;
        this.options = {
            chunkSize: options.chunkSize ?? 1024 * 1024, // 1MB chunks
            maxMemory: options.maxMemory ?? 64 * 1024 * 1024, // 64MB memory limit
            compression: options.compression ?? false,
            bufferSize: options.bufferSize ?? 64 * 1024, // 64KB buffer
        };
    }

    // Basic Storage interface implementation
    read(): JsonObject | null {
        if (this.isStreaming) {
            throw new Error(
                'Cannot perform synchronous read while streaming operations are active'
            );
        }

        // For large datasets, this should be used sparingly
        console.warn(
            'StreamingStorage.read() loads entire dataset into memory - consider using streamRead() for large datasets'
        );

        const dataPath = `${this.basePath}.stream.data`;
        if (!existsSync(dataPath)) {
            return null;
        }

        try {
            const data = require('fs').readFileSync(dataPath);
            return MessagePackUtil.decode(new Uint8Array(data)) as JsonObject;
        } catch (error) {
            console.error('Failed to read streaming storage:', error);
            return null;
        }
    }

    write(obj: JsonObject): void {
        if (this.isStreaming) {
            throw new Error(
                'Cannot perform synchronous write while streaming operations are active'
            );
        }

        const dataPath = `${this.basePath}.stream.data`;
        try {
            const data = MessagePackUtil.encode(obj);
            require('fs').writeFileSync(dataPath, data);
        } catch (error) {
            throw new Error(
                `Failed to write streaming storage: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    close(): void {
        // No persistent connections to close for file-based streaming
    }

    // Streaming operations

    /**
     * Stream read all documents with optional filtering
     */
    async *streamRead(
        filter?: (tableName: string, docId: string, doc: any) => boolean
    ): AsyncGenerator<DocumentStream, void, unknown> {
        const dataPath = `${this.basePath}.stream.data`;
        if (!existsSync(dataPath)) {
            return;
        }

        this.isStreaming = true;
        try {
            const readStream = createReadStream(dataPath, {
                highWaterMark: this.options.bufferSize,
            });

            let buffer = Buffer.alloc(0);
            let bytesProcessed = 0;

            for await (const chunk of readStream) {
                buffer = Buffer.concat([buffer, chunk]);

                // Try to decode complete MessagePack objects
                while (buffer.length > 0) {
                    try {
                        const decoded = MessagePackUtil.decode(
                            new Uint8Array(buffer)
                        ) as JsonObject;

                        // Process each table
                        for (const [tableName, tableData] of Object.entries(
                            decoded
                        )) {
                            if (
                                typeof tableData === 'object' &&
                                tableData !== null
                            ) {
                                for (const [docId, document] of Object.entries(
                                    tableData
                                )) {
                                    if (
                                        !filter ||
                                        filter(tableName, docId, document)
                                    ) {
                                        yield { tableName, docId, document };
                                    }
                                }
                            }
                        }

                        buffer = Buffer.alloc(0); // Clear buffer after successful decode
                        break;
                    } catch (error) {
                        // Incomplete MessagePack data, wait for more chunks
                        break;
                    }
                }

                bytesProcessed += chunk.length;

                // Memory pressure check
                if (buffer.length > this.options.maxMemory) {
                    throw new Error(
                        `Memory limit exceeded: ${buffer.length} bytes > ${this.options.maxMemory} bytes`
                    );
                }
            }
        } finally {
            this.isStreaming = false;
        }
    }

    /**
     * Stream write documents in chunks
     */
    async streamWrite(
        documentStream: AsyncIterable<DocumentStream>
    ): Promise<void> {
        const dataPath = `${this.basePath}.stream.data`;
        this.isStreaming = true;

        try {
            const writeStream = createWriteStream(dataPath, {
                highWaterMark: this.options.bufferSize,
            });

            const tables: Record<string, Record<string, any>> = {};
            let chunkSize = 0;

            for await (const { tableName, docId, document } of documentStream) {
                if (!tables[tableName]) {
                    tables[tableName] = {};
                }

                tables[tableName][docId] = document;
                chunkSize += JSON.stringify(document).length; // Rough size estimate

                // Flush chunk when size limit is reached
                if (chunkSize >= this.options.chunkSize) {
                    const encoded = MessagePackUtil.encode(tables);
                    await this.writeToStream(writeStream, encoded);

                    // Clear tables for next chunk
                    Object.keys(tables).forEach((key) => delete tables[key]);
                    chunkSize = 0;
                }
            }

            // Write remaining data
            if (Object.keys(tables).length > 0) {
                const encoded = MessagePackUtil.encode(tables);
                await this.writeToStream(writeStream, encoded);
            }

            await this.closeWriteStream(writeStream);
        } finally {
            this.isStreaming = false;
        }
    }

    /**
     * Stream process documents with transformation
     */
    async streamProcess<T>(
        transformer: (doc: DocumentStream) => T | Promise<T>,
        filter?: (doc: DocumentStream) => boolean
    ): Promise<T[]> {
        const results: T[] = [];

        const adaptedFilter = filter
            ? (tableName: string, docId: string, document: any) =>
                  filter({ tableName, docId, document })
            : undefined;

        for await (const doc of this.streamRead(adaptedFilter)) {
            const transformed = await transformer(doc);
            results.push(transformed);

            // Memory pressure check
            if (results.length * 1000 > this.options.maxMemory) {
                // Rough estimate
                throw new Error(
                    'Memory limit exceeded during streaming processing'
                );
            }
        }

        return results;
    }

    /**
     * Streaming batch operations
     */
    async streamBatch(
        operations: AsyncIterable<{
            type: 'insert' | 'update' | 'delete';
            tableName: string;
            docId: string;
            document?: any;
        }>
    ): Promise<{ processed: number; errors: Error[] }> {
        const tempPath = `${this.basePath}.stream.temp`;
        const dataPath = `${this.basePath}.stream.data`;

        let processed = 0;
        const errors: Error[] = [];

        this.isStreaming = true;

        try {
            // Read existing data in streaming fashion
            const existingData: Record<string, Record<string, any>> = {};

            if (existsSync(dataPath)) {
                for await (const {
                    tableName,
                    docId,
                    document,
                } of this.streamRead()) {
                    if (!existingData[tableName]) {
                        existingData[tableName] = {};
                    }
                    existingData[tableName][docId] = document;
                }
            }

            // Apply operations
            for await (const operation of operations) {
                try {
                    if (!existingData[operation.tableName]) {
                        existingData[operation.tableName] = {};
                    }

                    switch (operation.type) {
                        case 'insert':
                        case 'update':
                            if (operation.document) {
                                existingData[operation.tableName][
                                    operation.docId
                                ] = operation.document;
                            }
                            break;
                        case 'delete':
                            delete existingData[operation.tableName][
                                operation.docId
                            ];
                            break;
                    }

                    processed++;
                } catch (error) {
                    errors.push(
                        error instanceof Error
                            ? error
                            : new Error(String(error))
                    );
                }
            }

            // Write back to file using streaming
            const writeStream = createWriteStream(tempPath, {
                highWaterMark: this.options.bufferSize,
            });

            const encoded = MessagePackUtil.encode(existingData);
            await this.writeToStream(writeStream, encoded);
            await this.closeWriteStream(writeStream);

            // Atomic rename
            require('fs').renameSync(tempPath, dataPath);
        } finally {
            this.isStreaming = false;
            // Cleanup temp file if it exists
            if (existsSync(tempPath)) {
                require('fs').unlinkSync(tempPath);
            }
        }

        return { processed, errors };
    }

    /**
     * Export data in streaming fashion
     */
    async exportStream(
        outputPath: string,
        format: 'json' | 'msgpack' = 'json'
    ): Promise<void> {
        const writeStream = createWriteStream(outputPath, {
            highWaterMark: this.options.bufferSize,
        });

        this.isStreaming = true;

        try {
            if (format === 'json') {
                // Stream as JSON
                await writeStream.write('{\n');

                let firstTable = true;
                for await (const {
                    tableName,
                    docId,
                    document,
                } of this.streamRead()) {
                    if (firstTable) {
                        await writeStream.write(`  "${tableName}": {\n`);
                        firstTable = false;
                    }

                    const jsonDoc = JSON.stringify(document);
                    await writeStream.write(`    "${docId}": ${jsonDoc},\n`);
                }

                await writeStream.write('  }\n}\n');
            } else {
                // Stream as MessagePack
                const allData: Record<string, Record<string, any>> = {};

                for await (const {
                    tableName,
                    docId,
                    document,
                } of this.streamRead()) {
                    if (!allData[tableName]) {
                        allData[tableName] = {};
                    }
                    allData[tableName][docId] = document;
                }

                const encoded = MessagePackUtil.encode(allData);
                await this.writeToStream(writeStream, encoded);
            }

            await this.closeWriteStream(writeStream);
        } finally {
            this.isStreaming = false;
        }
    }

    // Helper methods
    private async writeToStream(
        stream: Writable,
        data: Uint8Array
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            stream.write(Buffer.from(data), (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    private async closeWriteStream(stream: Writable): Promise<void> {
        return new Promise((resolve, reject) => {
            stream.end((error: any) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    // Storage interface stubs
    async createIndex(): Promise<void> {
        console.warn('StreamingStorage: Index operations not yet implemented');
    }

    async createCompoundIndex(): Promise<void> {
        console.warn(
            'StreamingStorage: Compound index operations not yet implemented'
        );
    }

    async dropIndex(): Promise<void> {
        console.warn('StreamingStorage: Index operations not yet implemented');
    }

    async listIndexes(): Promise<IndexDefinition[]> {
        return [];
    }

    async checkUnique(): Promise<boolean> {
        return true;
    }

    async checkCompoundUnique(): Promise<boolean> {
        return true;
    }

    async createVectorIndex(): Promise<void> {
        throw new Error('Vector operations not supported by streaming storage');
    }

    async dropVectorIndex(): Promise<void> {
        throw new Error('Vector operations not supported by streaming storage');
    }

    async listVectorIndexes(): Promise<VectorIndexDefinition[]> {
        throw new Error('Vector operations not supported by streaming storage');
    }

    async vectorSearch(): Promise<VectorSearchResult[]> {
        throw new Error('Vector operations not supported by streaming storage');
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
        return ['async', 'batch'].includes(feature);
    }

    // Streaming-specific utilities
    getStreamingStats(): {
        isStreaming: boolean;
        chunkSize: number;
        maxMemory: number;
        bufferSize: number;
    } {
        return {
            isStreaming: this.isStreaming,
            chunkSize: this.options.chunkSize,
            maxMemory: this.options.maxMemory,
            bufferSize: this.options.bufferSize,
        };
    }
}

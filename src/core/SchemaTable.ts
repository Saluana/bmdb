import { Table, Document } from './Table';
import type { Storage } from '../storage/Storage';
import { BmDbSchema } from '../schema/BmDbSchema';
import { createUniqueConstraintError } from '../schema/errors';
import { VectorUtils, type Vector, type VectorSearchResult } from '../utils/VectorUtils';

export class SchemaTable<T extends Record<string, any>> extends Table<T> {
    private _schema: BmDbSchema<T>;

    constructor(
        storage: Storage,
        schema: BmDbSchema<T>,
        name?: string,
        options: { cacheSize?: number; persistEmpty?: boolean } = {}
    ) {
        super(storage, name || schema.tableName, options);
        this._schema = schema;
    }

    get schema(): BmDbSchema<T> {
        return this._schema;
    }

    // Override insert to add validation
    insert(document: T | Document): number {
        const data =
            document instanceof Document ? (document.toJSON() as T) : document;

        // Validate schema
        const validatedData = this._schema.validate(data);

        // Validate vector fields
        this.validateVectorFields(validatedData);

        // Check uniqueness constraints synchronously (fallback to basic implementation)
        const uniqueFields = this._schema.getUniqueFields();
        for (const field of uniqueFields) {
            const value = validatedData[field];
            if (value === undefined || value === null) continue;

            const table = this._readTable();
            for (const doc of Object.values(table)) {
                if (doc[field as string] === value) {
                    throw createUniqueConstraintError(String(field), value);
                }
            }
        }

        // Check compound unique constraints synchronously
        const compoundGroups = this._schema.getCompoundIndexGroups();
        for (const [groupName, fields] of Object.entries(compoundGroups)) {
            const values = fields.map(field => validatedData[field]);
            if (values.some(v => v === undefined || v === null)) continue;

            const table = this._readTable();
            for (const doc of Object.values(table)) {
                const docValues = fields.map(field => (doc as any)[field]);
                if (JSON.stringify(docValues) === JSON.stringify(values)) {
                    throw createUniqueConstraintError(`compound(${fields.join(',')})`, values);
                }
            }
        }

        return super.insert(validatedData);
    }

    // Override insertMultiple to add validation
    insertMultiple(documents: Array<T | Document>): number[] {
        const validatedDocs: T[] = [];

        // Validate all documents first
        for (const document of documents) {
            const data =
                document instanceof Document
                    ? (document.toJSON() as T)
                    : document;
            const validatedData = this._schema.validate(data);
            this.validateVectorFields(validatedData);
            validatedDocs.push(validatedData);
        }

        // Check uniqueness for all documents synchronously
        const table = this._readTable();
        const uniqueFields = this._schema.getUniqueFields();
        const compoundGroups = this._schema.getCompoundIndexGroups();

        for (const data of validatedDocs) {
            // Check single field uniqueness
            for (const field of uniqueFields) {
                const value = data[field];
                if (value === undefined || value === null) continue;

                for (const doc of Object.values(table)) {
                    if (doc[field as string] === value) {
                        throw createUniqueConstraintError(String(field), value);
                    }
                }
            }

            // Check compound uniqueness
            for (const [groupName, fields] of Object.entries(compoundGroups)) {
                const values = fields.map(field => data[field]);
                if (values.some(v => v === undefined || v === null)) continue;

                for (const doc of Object.values(table)) {
                    const docValues = fields.map(field => (doc as any)[field]);
                    if (JSON.stringify(docValues) === JSON.stringify(values)) {
                        throw createUniqueConstraintError(`compound(${fields.join(',')})`, values);
                    }
                }
            }
        }

        return super.insertMultiple(validatedDocs);
    }

    // Override update to add validation
    update(
        fields: Partial<T> | ((doc: Record<string, any>) => void),
        cond?: any,
        docIds?: number[]
    ): number[] {
        // For function-based updates, we can't pre-validate, so just proceed
        if (typeof fields === 'function') {
            return super.update(fields, cond, docIds);
        }

        // Validate partial data
        if (Object.keys(fields).length > 0) {
            try {
                this._schema.validatePartial(fields);
            } catch (error) {
                throw error; // Re-throw the validation error as-is
            }
        }

        return super.update(fields, cond, docIds);
    }

    // Override upsert to add validation
    upsert(document: T | Document, cond?: any): number[] {
        const data =
            document instanceof Document ? (document.toJSON() as T) : document;
        const validatedData = this._schema.validate(data);
        this.validateVectorFields(validatedData);

        return super.upsert(validatedData, cond);
    }

    // Utility methods for schema introspection
    getFieldMeta(field: keyof T) {
        return this._schema.getFieldMeta(field);
    }

    isPrimaryKey(field: keyof T): boolean {
        return this._schema.getFieldMeta(field)?.isPrimaryKey ?? false;
    }

    isUnique(field: keyof T): boolean {
        return this._schema.getFieldMeta(field)?.isUnique ?? false;
    }

    getUniqueFields(): Array<keyof T> {
        return this._schema.getUniqueFields();
    }

    getPrimaryKey(): keyof T | undefined {
        return this._schema.getPrimaryKey();
    }

    getVectorFields(): Array<keyof T> {
        return this._schema.getVectorFields();
    }

    private validateVectorFields(data: T): void {
        const vectorFields = this._schema.getVectorFields();
        for (const field of vectorFields) {
            const fieldMeta = this._schema.getFieldMeta(field);
            const value = data[field];
            
            if (value !== undefined && value !== null && fieldMeta?.isVector && fieldMeta.vectorDimensions) {
                VectorUtils.validateVector(value, fieldMeta.vectorDimensions);
            }
        }
    }

    // Index management methods
    async createIndex(field: keyof T, options?: { unique?: boolean }): Promise<void> {
        return this.storage.createIndex(this.name, String(field), options);
    }

    async createCompoundIndex(fields: Array<keyof T>, options?: { unique?: boolean; name?: string }): Promise<void> {
        return this.storage.createCompoundIndex(this.name, fields.map(String), options);
    }

    async dropIndex(indexName: string): Promise<void> {
        return this.storage.dropIndex(this.name, indexName);
    }

    async listIndexes(): Promise<import('../storage/Storage').IndexDefinition[]> {
        return this.storage.listIndexes(this.name);
    }

    // Vector operations
    async createVectorIndex(field: keyof T, options?: { algorithm?: 'cosine' | 'euclidean' | 'dot' | 'manhattan' }): Promise<void> {
        const fieldMeta = this._schema.getFieldMeta(field);
        if (!fieldMeta?.isVector) {
            throw new Error(`Field '${String(field)}' is not a vector field`);
        }
        
        if (!fieldMeta.vectorDimensions) {
            throw new Error(`Vector field '${String(field)}' does not specify dimensions`);
        }

        const algorithm = options?.algorithm || fieldMeta.vectorSearchAlgorithm || 'cosine';
        return this.storage.createVectorIndex(this.name, String(field), fieldMeta.vectorDimensions, algorithm);
    }

    async dropVectorIndex(field: keyof T): Promise<void> {
        const indexName = `${this.name}_${String(field)}_vector`;
        return this.storage.dropVectorIndex(this.name, indexName);
    }

    async vectorSearch(field: keyof T, queryVector: Vector, options?: { limit?: number; threshold?: number }): Promise<VectorSearchResult[]> {
        const fieldMeta = this._schema.getFieldMeta(field);
        if (!fieldMeta?.isVector) {
            throw new Error(`Field '${String(field)}' is not a vector field`);
        }

        if (!fieldMeta.vectorDimensions) {
            throw new Error(`Vector field '${String(field)}' does not specify dimensions`);
        }

        VectorUtils.validateVector(queryVector, fieldMeta.vectorDimensions);
        return this.storage.vectorSearch(this.name, String(field), queryVector, options);
    }

    // Auto-create indexes based on schema metadata
    async autoCreateIndexes(): Promise<void> {
        // Create indexes for unique fields
        const uniqueFields = this.getUniqueFields();
        for (const field of uniqueFields) {
            await this.createIndex(field, { unique: true });
        }

        // Create compound indexes
        const compoundGroups = this._schema.getCompoundIndexGroups();
        for (const [groupName, fields] of Object.entries(compoundGroups)) {
            await this.createCompoundIndex(fields, { 
                unique: true, 
                name: `${this.name}_compound_${groupName}` 
            });
        }

        // Create vector indexes
        const allFields = this._schema.getAllFields();
        for (const field of allFields) {
            const meta = this._schema.getFieldMeta(field);
            if (meta?.isVector) {
                await this.createVectorIndex(field);
            }
        }
    }

    // String representation
    toString(): string {
        const uniqueFields = this.getUniqueFields();
        const primaryKey = this.getPrimaryKey();

        return (
            `<SchemaTable name='${this.name}', total=${this.length}, ` +
            `schema='${this._schema.tableName}', ` +
            `primaryKey=${primaryKey ? `'${String(primaryKey)}'` : 'none'}, ` +
            `uniqueFields=[${uniqueFields
                .map((f) => `'${String(f)}'`)
                .join(', ')}], ` +
            `storage=${this.storage}>`
        );
    }
}

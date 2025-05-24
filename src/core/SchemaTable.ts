import { Table, Document } from './Table';
import type { Storage } from '../storage/Storage';
import { BmDbSchema } from '../schema/BmDbSchema';
import { createUniqueConstraintError } from '../schema/errors';

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

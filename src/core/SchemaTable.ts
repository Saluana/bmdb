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

        // Check uniqueness constraints synchronously
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

        // Check uniqueness for all documents
        const table = this._readTable();
        const uniqueFields = this._schema.getUniqueFields();

        for (const data of validatedDocs) {
            for (const field of uniqueFields) {
                const value = data[field];
                if (value === undefined || value === null) continue;

                for (const doc of Object.values(table)) {
                    if (doc[field as string] === value) {
                        throw createUniqueConstraintError(String(field), value);
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

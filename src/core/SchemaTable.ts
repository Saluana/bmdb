import { Table, Document } from './Table';
import type { Storage } from '../storage/Storage';
import { BmDbSchema } from '../schema/BmDbSchema';
import { createUniqueConstraintError } from '../schema/errors';
import { VectorUtils, type Vector, type VectorSearchResult } from '../utils/VectorUtils';

interface RelationshipConfig {
    parentField: string;      // Field in this table that points to parent
    childTable: string;       // Name of child table
    childField: string;       // Field in child table that points back to this table
    cascadeDelete: boolean;   // Whether to delete children when parent is deleted
}

export class SchemaTable<T extends Record<string, any>> extends Table<T> {
    private _schema: BmDbSchema<T>;
    private _db?: any; // TinyDB instance for cascade operations
    private _relationships: RelationshipConfig[] = [];

    constructor(
        storage: Storage,
        schema: BmDbSchema<T>,
        name?: string,
        options: { cacheSize?: number; persistEmpty?: boolean } = {},
        db?: any
    ) {
        super(storage, name || schema.tableName, options);
        this._schema = schema;
        this._db = db;
    }

    get schema(): BmDbSchema<T> {
        return this._schema;
    }

    /**
     * Define a relationship where this table has children in another table
     * @param parentField - Field in this table that serves as the parent key (usually 'id')
     * @param childTable - Name of the child table
     * @param childField - Field in child table that references this table (e.g. 'user_id')
     * @param cascadeDelete - Whether to delete children when parent is deleted (default: true)
     */
    hasMany(parentField: keyof T, childTable: string, childField: string, cascadeDelete: boolean = true): this {
        this._relationships.push({
            parentField: parentField as string,
            childTable,
            childField,
            cascadeDelete
        });
        return this;
    }

    /**
     * Get all relationships defined for this table
     */
    getRelationships(): RelationshipConfig[] {
        return [...this._relationships];
    }

    /**
     * Get only relationships that have cascade delete enabled
     */
    getCascadeDeleteRelationships(): RelationshipConfig[] {
        return this._relationships.filter(rel => rel.cascadeDelete);
    }


    // Override insert to add validation
    insert(document: T | Document): number {
        const data =
            document instanceof Document ? (document.toJSON() as T) : document;

        // Validate schema
        const validatedData = this._schema.validate(data);

        // Validate vector fields
        this.validateVectorFields(validatedData);

        // Check uniqueness constraints using storage indexes when available
        const uniqueFields = this._schema.getUniqueFields();
        for (const field of uniqueFields) {
            const value = validatedData[field];
            if (value === undefined || value === null) continue;

            // Use storage index-based checking if available, otherwise fallback to linear scan with early termination
            // TODO: Consider making insert async to leverage indexed uniqueness checking
            const table = this._readTable();
            for (const doc of Object.values(table)) {
                if (doc[field as string] === value) {
                    throw createUniqueConstraintError(String(field), value, this._schema.tableName);
                }
            }
        }

        // Check compound unique constraints with optimization
        const compoundGroups = this._schema.getCompoundIndexGroups();
        for (const [groupName, fields] of Object.entries(compoundGroups)) {
            const values = fields.map(field => validatedData[field]);
            if (values.some(v => v === undefined || v === null)) continue;

            // Optimized compound uniqueness checking with early termination
            const table = this._readTable();
            const valuesStr = JSON.stringify(values);
            for (const doc of Object.values(table)) {
                const docValues = fields.map(field => (doc as any)[field]);
                if (JSON.stringify(docValues) === valuesStr) {
                    throw createUniqueConstraintError(`compound(${fields.join(',')})`, values, this._schema.tableName);
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

        // Check uniqueness for all documents with optimizations
        const table = this._readTable();
        const uniqueFields = this._schema.getUniqueFields();
        const compoundGroups = this._schema.getCompoundIndexGroups();

        // Create value sets for faster duplicate checking within the batch
        const batchUniqueValues = new Map<string, Set<any>>();
        const batchCompoundValues = new Map<string, Set<string>>();

        for (const field of uniqueFields) {
            batchUniqueValues.set(String(field), new Set());
        }
        for (const groupName of Object.keys(compoundGroups)) {
            batchCompoundValues.set(groupName, new Set());
        }

        for (const data of validatedDocs) {
            // Check single field uniqueness
            for (const field of uniqueFields) {
                const value = data[field];
                if (value === undefined || value === null) continue;

                const fieldStr = String(field);
                const batchSet = batchUniqueValues.get(fieldStr)!;
                
                // Check for duplicates within the batch first
                if (batchSet.has(value)) {
                    throw createUniqueConstraintError(fieldStr, value, this._schema.tableName);
                }
                batchSet.add(value);

                // Check against existing data with early termination
                let found = false;
                for (const doc of Object.values(table)) {
                    if (doc[fieldStr] === value) {
                        found = true;
                        break;
                    }
                }
                if (found) {
                    throw createUniqueConstraintError(fieldStr, value, this._schema.tableName);
                }
            }

            // Check compound uniqueness
            for (const [groupName, fields] of Object.entries(compoundGroups)) {
                const values = fields.map(field => data[field]);
                if (values.some(v => v === undefined || v === null)) continue;

                const valuesStr = JSON.stringify(values);
                const batchSet = batchCompoundValues.get(groupName)!;
                
                // Check for duplicates within the batch first
                if (batchSet.has(valuesStr)) {
                    throw createUniqueConstraintError(`compound(${fields.join(',')})`, values, this._schema.tableName);
                }
                batchSet.add(valuesStr);

                // Check against existing data with early termination
                let found = false;
                for (const doc of Object.values(table)) {
                    const docValues = fields.map(field => (doc as any)[field]);
                    if (JSON.stringify(docValues) === valuesStr) {
                        found = true;
                        break;
                    }
                }
                if (found) {
                    throw createUniqueConstraintError(`compound(${fields.join(',')})`, values, this._schema.tableName);
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

    // Override remove to handle cascade deletes
    remove(cond?: any, docIds?: number[]): number[] {
        // First get the documents that will be deleted for cascade operations
        let docsToDelete: any[] = [];
        
        if (docIds) {
            const docs = this.get(undefined, undefined, docIds);
            docsToDelete = Array.isArray(docs) ? docs : (docs ? [docs] : []);
        } else if (cond) {
            docsToDelete = this.search(cond);
        }

        // Perform cascade deletes BEFORE removing the parent records
        if (this._db && docsToDelete.length > 0) {
            this._handleCascadeDeletes(docsToDelete);
        }

        // Then perform the actual deletion
        const removedIds = super.remove(cond, docIds);

        return removedIds;
    }

    // Override truncate to handle cascade deletes for all records
    truncate(): void {
        // Get all documents before truncating for cascade operations
        const allDocs = this._db ? this.all() : [];

        // Handle cascade deletes BEFORE truncating
        if (this._db && allDocs.length > 0) {
            this._handleCascadeDeletes(allDocs);
        }

        // Then perform the actual truncation
        super.truncate();
    }

    private _handleCascadeDeletes(deletedDocs: any[]): void {
        if (!this._db) return;

        const cascadeRelations = this.getCascadeDeleteRelationships();
        
        for (const relationship of cascadeRelations) {
            try {
                // Get the child table (must be a schema table)
                const childTable = this._db._tables?.get(relationship.childTable);
                if (!childTable) {
                    console.warn(`Child table '${relationship.childTable}' not found for cascade delete`);
                    continue;
                }

                // Check if it's a schema table (has the remove method we expect)
                if (typeof childTable.remove !== 'function') {
                    console.warn(`Child table '${relationship.childTable}' is not a schema table, skipping cascade`);
                    continue;
                }

                for (const parentDoc of deletedDocs) {
                    const parentValue = parentDoc[relationship.parentField];
                    if (parentValue === undefined || parentValue === null) continue;

                    // Find all child records that reference this parent
                    const childrenToDelete = childTable.search((childDoc: any) => 
                        childDoc[relationship.childField] === parentValue
                    );

                    if (childrenToDelete.length > 0) {
                        const childIds = childrenToDelete.map((child: any) => child.doc_id);
                        childTable.remove(undefined, childIds);
                        console.log(`Cascade deleted ${childrenToDelete.length} records from ${relationship.childTable}`);
                    }
                }
            } catch (error) {
                console.warn(`Error during cascade delete for table '${relationship.childTable}':`, error);
            }
        }
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

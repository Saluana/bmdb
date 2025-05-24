import { Table, Document } from './Table';
import type { Storage } from '../storage/Storage';
import { BmDbSchema } from '../schema/BmDbSchema';
import { createUniqueConstraintError } from '../schema/errors';

export class SchemaTable<T extends Record<string, any>> extends Table<T> {
  private _schema: BmDbSchema<T>;
  private _isAsync: boolean;

  constructor(
    storage: Storage,
    schema: BmDbSchema<T>,
    name?: string,
    options: { cacheSize?: number; persistEmpty?: boolean } = {}
  ) {
    super(storage, name || schema.tableName, options);
    this._schema = schema;
    this._isAsync = storage.supportsFeature?.('async') ?? false;
  }

  get schema(): BmDbSchema<T> {
    return this._schema;
  }

  private async validateUniqueness(data: T, excludeDocId?: number): Promise<void> {
    const uniqueFields = this._schema.getUniqueFields();
    
    for (const field of uniqueFields) {
      const value = data[field];
      if (value === undefined || value === null) continue;

      const isUnique = await this.checkFieldUniqueness(
        String(field), 
        value, 
        excludeDocId ? String(excludeDocId) : undefined
      );
      
      if (!isUnique) {
        throw createUniqueConstraintError(String(field), value);
      }
    }
  }

  private async checkFieldUniqueness(
    field: string, 
    value: any, 
    excludeDocId?: string
  ): Promise<boolean> {
    // Use storage-level uniqueness check if available
    if (this.storage.checkUnique) {
      return await this.storage.checkUnique(this.name, field, value, excludeDocId);
    }
    
    // Fallback to table-level check
    const table = this._readTable();
    for (const [docIdStr, doc] of Object.entries(table)) {
      if (excludeDocId && docIdStr === excludeDocId) continue;
      if (doc[field] === value) {
        return false;
      }
    }
    return true;
  }

  // Override insert to add validation
  insert(document: T | Document): number | Promise<number> {
    if (this._isAsync) {
      return this.insertAsync(document);
    }
    return this.insertSync(document);
  }

  private async insertAsync(document: T | Document): Promise<number> {
    const data = document instanceof Document ? document.toJSON() as T : document;
    
    // Validate schema
    const validatedData = this._schema.validate(data);
    
    // Check uniqueness constraints
    await this.validateUniqueness(validatedData);
    
    // Proceed with insertion using parent implementation
    return super.insert(validatedData);
  }

  private insertSync(document: T | Document): number {
    const data = document instanceof Document ? document.toJSON() as T : document;
    
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
  insertMultiple(documents: Array<T | Document>): number[] | Promise<number[]> {
    if (this._isAsync) {
      return this.insertMultipleAsync(documents);
    }
    return this.insertMultipleSync(documents);
  }

  private async insertMultipleAsync(documents: Array<T | Document>): Promise<number[]> {
    const validatedDocs: T[] = [];
    
    // Validate all documents first
    for (const document of documents) {
      const data = document instanceof Document ? document.toJSON() as T : document;
      const validatedData = this._schema.validate(data);
      validatedDocs.push(validatedData);
    }
    
    // Check uniqueness for all documents
    for (const data of validatedDocs) {
      await this.validateUniqueness(data);
    }
    
    // Proceed with insertion
    return super.insertMultiple(validatedDocs);
  }

  private insertMultipleSync(documents: Array<T | Document>): number[] {
    const validatedDocs: T[] = [];
    
    // Validate all documents first
    for (const document of documents) {
      const data = document instanceof Document ? document.toJSON() as T : document;
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
  ): number[] | Promise<number[]> {
    if (this._isAsync && typeof fields === 'object') {
      return this.updateAsync(fields, cond, docIds);
    }
    return this.updateSync(fields, cond, docIds);
  }

  private async updateAsync(
    fields: Partial<T>,
    cond?: any,
    docIds?: number[]
  ): Promise<number[]> {
    // For updates, we need to validate the partial data and check uniqueness
    // This is a simplified version - full implementation would merge existing data
    if (Object.keys(fields).length > 0) {
      try {
        // Validate partial data structure (won't catch all issues but basic validation)
        this._schema.zodSchema.partial().parse(fields);
      } catch (error) {
        throw createUniqueConstraintError('validation', fields);
      }
      
      // Check uniqueness for updated fields
      const uniqueFields = this._schema.getUniqueFields();
      for (const field of uniqueFields) {
        if (field in fields) {
          const value = fields[field];
          if (value !== undefined && value !== null) {
            // Get existing documents that would be updated
            const docsToUpdate = docIds ? 
              docIds.map(String) : 
              Object.keys(this._readTable());
            
            for (const excludeDocId of docsToUpdate) {
              const isUnique = await this.checkFieldUniqueness(
                String(field), 
                value, 
                excludeDocId
              );
              if (!isUnique) {
                throw createUniqueConstraintError(String(field), value);
              }
            }
          }
        }
      }
    }
    
    return super.update(fields, cond, docIds);
  }

  private updateSync(
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
        this._schema.zodSchema.partial().parse(fields);
      } catch (error) {
        throw createUniqueConstraintError('validation', fields);
      }
    }
    
    return super.update(fields, cond, docIds);
  }

  // Override upsert to add validation
  upsert(document: T | Document, cond?: any): number[] | Promise<number[]> {
    if (this._isAsync) {
      return this.upsertAsync(document, cond);
    }
    return this.upsertSync(document, cond);
  }

  private async upsertAsync(document: T | Document, cond?: any): Promise<number[]> {
    const data = document instanceof Document ? document.toJSON() as T : document;
    const validatedData = this._schema.validate(data);
    
    let docIds: number[] | undefined;
    if (document instanceof Document) {
      docIds = [document.docId];
    }

    if (!docIds && !cond) {
      throw new Error("If you don't specify a search query, you must specify a doc_id. " +
                     "Hint: use a Document object.");
    }

    try {
      const updated = await this.updateAsync(validatedData, cond, docIds);
      if (updated.length > 0) {
        return updated;
      }
    } catch (error) {
      // Document with docId doesn't exist or update failed
    }

    // Insert as new document
    const insertResult = await this.insertAsync(validatedData);
    return [insertResult];
  }

  private upsertSync(document: T | Document, cond?: any): number[] {
    const data = document instanceof Document ? document.toJSON() as T : document;
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
    
    return `<SchemaTable name='${this.name}', total=${this.length}, ` +
           `schema='${this._schema.tableName}', ` +
           `primaryKey=${primaryKey ? `'${String(primaryKey)}'` : 'none'}, ` +
           `uniqueFields=[${uniqueFields.map(f => `'${String(f)}'`).join(', ')}], ` +
           `storage=${this.storage}>`;
  }
}
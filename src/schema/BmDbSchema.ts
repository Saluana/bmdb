import { type ZodType, type ZodSchema, type ZodObject, type infer as ZodInfer } from 'zod';
import type { BmDbFieldMeta, BmDbSchemaMeta } from './types';
import { getFieldMeta } from './helpers';
import { createValidationError } from './errors';

export class BmDbSchema<T extends Record<string, any>> {
  public readonly zodSchema: ZodSchema<T>;
  public readonly tableName: string;
  private _fieldCache: Map<keyof T, BmDbFieldMeta | undefined> = new Map();

  constructor(zodSchema: ZodSchema<T>, tableName?: string) {
    this.zodSchema = zodSchema;
    this.tableName = tableName || 'default';
  }

  get zodShape(): any {
    const zodType = this.zodSchema as any;
    // Handle ZodObject shape
    if (zodType._def?.typeName === 'ZodObject') {
      return zodType._def.shape();
    }
    // Fallback for other types
    return zodType._def?.shape || zodType.shape || {};
  }

  validate(data: unknown): T {
    try {
      return this.zodSchema.parse(data);
    } catch (zodError: any) {
      const message = zodError.message || 'Schema validation failed';
      const path = zodError.path || [];
      throw createValidationError(message, path, zodError);
    }
  }

  safeValidate(data: unknown): { success: true; data: T } | { success: false; error: any } {
    const result = this.zodSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, error: result.error };
    }
  }

  validatePartial(data: unknown): Partial<T> {
    try {
      // Check if the schema is a ZodObject, which has the partial() method
      const zodType = this.zodSchema as any;
      if (zodType._def?.typeName === 'ZodObject') {
        return (zodType as ZodObject<any>).partial().parse(data) as Partial<T>;
      } else {
        // For non-object schemas, just validate as-is
        return this.zodSchema.parse(data) as Partial<T>;
      }
    } catch (zodError: any) {
      const message = zodError.message || 'Partial schema validation failed';
      const path = zodError.path || [];
      throw createValidationError(message, path, zodError);
    }
  }

  safeValidatePartial(data: unknown): { success: true; data: Partial<T> } | { success: false; error: any } {
    try {
      const validatedData = this.validatePartial(data);
      return { success: true, data: validatedData };
    } catch (error) {
      return { success: false, error };
    }
  }

  getFieldMeta(field: keyof T): BmDbFieldMeta | undefined {
    if (this._fieldCache.has(field)) {
      return this._fieldCache.get(field);
    }

    const fieldSchema = this.zodShape[field as string];
    if (!fieldSchema) {
      this._fieldCache.set(field, undefined);
      return undefined;
    }

    const meta = getFieldMeta(fieldSchema);
    this._fieldCache.set(field, meta);
    return meta;
  }

  getUniqueFields(): Array<keyof T> {
    const uniqueFields: Array<keyof T> = [];
    
    for (const field of Object.keys(this.zodShape) as Array<keyof T>) {
      const meta = this.getFieldMeta(field);
      if (meta?.isUnique) {
        uniqueFields.push(field);
      }
    }
    
    return uniqueFields;
  }

  getPrimaryKey(): keyof T | undefined {
    for (const field of Object.keys(this.zodShape) as Array<keyof T>) {
      const meta = this.getFieldMeta(field);
      if (meta?.isPrimaryKey) {
        return field;
      }
    }
    return undefined;
  }

  getCompoundIndexGroups(): Record<string, Array<keyof T>> {
    const groups: Record<string, Array<keyof T>> = {};
    
    for (const field of Object.keys(this.zodShape) as Array<keyof T>) {
      const meta = this.getFieldMeta(field);
      if (meta?.compoundIndexGroup) {
        if (!groups[meta.compoundIndexGroup]) {
          groups[meta.compoundIndexGroup] = [];
        }
        groups[meta.compoundIndexGroup].push(field);
      }
    }
    
    return groups;
  }

  getVectorFields(): Array<keyof T> {
    const vectorFields: Array<keyof T> = [];
    
    for (const field of Object.keys(this.zodShape) as Array<keyof T>) {
      const meta = this.getFieldMeta(field);
      if (meta?.isVector) {
        vectorFields.push(field);
      }
    }
    
    return vectorFields;
  }

  getAllFields(): Array<keyof T> {
    return Object.keys(this.zodShape) as Array<keyof T>;
  }

  hasField(field: string): boolean {
    return field in this.zodShape;
  }

  clone(newTableName?: string): BmDbSchema<T> {
    return new BmDbSchema(this.zodSchema, newTableName || this.tableName);
  }
}

export function createSchema<T extends Record<string, any>>(
  zodSchema: ZodSchema<T>, 
  tableName?: string
): BmDbSchema<T> {
  return new BmDbSchema(zodSchema, tableName);
}
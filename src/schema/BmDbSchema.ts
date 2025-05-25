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
      throw createValidationError(message, path, zodError, this.tableName);
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

  getRelationships(): Record<string, BmDbFieldMeta['relationship']> {
    const relationships: Record<string, BmDbFieldMeta['relationship']> = {};
    
    for (const field of Object.keys(this.zodShape) as Array<keyof T>) {
      const meta = this.getFieldMeta(field);
      if (meta?.relationship) {
        relationships[field as string] = meta.relationship;
      }
    }
    
    return relationships;
  }

  getCascadeDeleteRelationships(): Record<string, BmDbFieldMeta['relationship']> {
    const relationships = this.getRelationships();
    const cascadeDeletes: Record<string, BmDbFieldMeta['relationship']> = {};
    
    for (const [field, rel] of Object.entries(relationships)) {
      if (rel && rel.cascadeDelete) {
        cascadeDeletes[field] = rel;
      }
    }
    
    return cascadeDeletes;
  }

  clone(newTableName?: string): BmDbSchema<T> {
    return new BmDbSchema(this.zodSchema, newTableName || this.tableName);
  }

  serialize(): any {
    // For now, we'll serialize basic schema information
    // In a full implementation, you might want to serialize the entire Zod schema
    const fields: Record<string, any> = {};
    
    for (const field of Object.keys(this.zodShape) as Array<keyof T>) {
      const meta = this.getFieldMeta(field);
      const zodField = this.zodShape[field];
      
      fields[field as string] = {
        meta: meta || {},
        // Store basic type information (this is simplified)
        type: zodField?._def?.typeName || 'unknown',
        // Store other relevant zod properties as needed
      };
    }
    
    return {
      tableName: this.tableName,
      fields,
      schemaVersion: '1.0.0', // For future schema evolution
    };
  }

  /**
   * Serialize data for storage, converting complex types to JSON-safe values
   */
  serializeData(data: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = { ...data };
    
    for (const field of Object.keys(this.zodShape) as Array<keyof T>) {
      const zodField = this.zodShape[field];
      const value = result[field as string];
      
      if (value !== undefined && value !== null) {
        result[field as string] = this._serializeValue(zodField, value);
      }
    }
    
    return result;
  }

  /**
   * Deserialize data from storage, converting JSON-serialized values back to their proper types
   */
  deserialize(data: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = { ...data };
    
    for (const field of Object.keys(this.zodShape) as Array<keyof T>) {
      const zodField = this.zodShape[field];
      const value = result[field as string];
      
      if (value !== undefined && value !== null) {
        result[field as string] = this._deserializeValue(zodField, value);
      }
    }
    
    return result;
  }

  private _serializeValue(zodField: any, value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    const typeName = zodField?._def?.typeName;
    
    switch (typeName) {
      case 'ZodDate':
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
        
      case 'ZodBigInt':
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
        
      case 'ZodSet':
        if (value instanceof Set) {
          const elementType = zodField?._def?.valueType;
          return Array.from(value).map(item => this._serializeValue(elementType, item));
        }
        return value;
        
      case 'ZodMap':
        if (value instanceof Map) {
          const keyType = zodField?._def?.keyType;
          const valueType = zodField?._def?.valueType;
          const result: Record<string, any> = {};
          for (const [k, v] of value.entries()) {
            const serializedKey = this._serializeValue(keyType, k);
            const serializedValue = this._serializeValue(valueType, v);
            result[serializedKey] = serializedValue;
          }
          return result;
        }
        return value;
        
      case 'ZodArray':
        if (Array.isArray(value)) {
          const elementType = zodField?._def?.type;
          return value.map(item => this._serializeValue(elementType, item));
        }
        return value;
        
      case 'ZodObject':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const shape = zodField?._def?.shape();
          const result: Record<string, any> = {};
          for (const [key, val] of Object.entries(value)) {
            if (shape && shape[key]) {
              result[key] = this._serializeValue(shape[key], val);
            } else {
              result[key] = val;
            }
          }
          return result;
        }
        return value;
        
      case 'ZodOptional':
        const optionalInnerType = zodField?._def?.innerType;
        return this._serializeValue(optionalInnerType, value);
        
      case 'ZodNullable':
        const nullableInnerType = zodField?._def?.innerType;
        return this._serializeValue(nullableInnerType, value);
        
      case 'ZodDefault':
        const defaultInnerType = zodField?._def?.innerType;
        return this._serializeValue(defaultInnerType, value);
        
      case 'ZodUnion':
      case 'ZodDiscriminatedUnion':
        // For unions, find the matching type and serialize accordingly
        const options = zodField?._def?.options || [];
        for (const option of options) {
          try {
            const result = option.safeParse(value);
            if (result.success) {
              return this._serializeValue(option, value);
            }
          } catch (e) {
            // Continue to next option
          }
        }
        return value;
        
      case 'ZodTuple':
        if (Array.isArray(value)) {
          const items = zodField?._def?.items || [];
          return value.map((item, index) => {
            if (index < items.length) {
              return this._serializeValue(items[index], item);
            }
            return item;
          });
        }
        return value;
        
      case 'ZodRecord':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const valueType = zodField?._def?.valueType;
          const result: Record<string, any> = {};
          for (const [key, val] of Object.entries(value)) {
            result[key] = this._serializeValue(valueType, val);
          }
          return result;
        }
        return value;
        
      // Primitive types that don't need serialization
      case 'ZodString':
      case 'ZodNumber':
      case 'ZodBoolean':
      case 'ZodLiteral':
      case 'ZodEnum':
      case 'ZodNativeEnum':
      case 'ZodUndefined':
      case 'ZodNull':
      case 'ZodVoid':
      case 'ZodAny':
      case 'ZodUnknown':
      case 'ZodNever':
        return value;
        
      default:
        // Unknown type, return as-is
        return value;
    }
  }

  private _deserializeValue(zodField: any, value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    const typeName = zodField?._def?.typeName;
    
    switch (typeName) {
      case 'ZodDate':
        if (typeof value === 'string') {
          try {
            return new Date(value);
          } catch (e) {
            return value;
          }
        }
        return value;
        
      case 'ZodBigInt':
        if (typeof value === 'string') {
          try {
            return BigInt(value);
          } catch (e) {
            return value;
          }
        }
        return value;
        
      case 'ZodSet':
        if (Array.isArray(value)) {
          const elementType = zodField?._def?.valueType;
          const deserializedArray = value.map(item => this._deserializeValue(elementType, item));
          return new Set(deserializedArray);
        }
        return value;
        
      case 'ZodMap':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const keyType = zodField?._def?.keyType;
          const valueType = zodField?._def?.valueType;
          const map = new Map();
          for (const [k, v] of Object.entries(value)) {
            const deserializedKey = this._deserializeValue(keyType, k);
            const deserializedValue = this._deserializeValue(valueType, v);
            map.set(deserializedKey, deserializedValue);
          }
          return map;
        }
        return value;
        
      case 'ZodArray':
        if (Array.isArray(value)) {
          const elementType = zodField?._def?.type;
          return value.map(item => this._deserializeValue(elementType, item));
        }
        return value;
        
      case 'ZodObject':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const shape = zodField?._def?.shape();
          const result: Record<string, any> = {};
          for (const [key, val] of Object.entries(value)) {
            if (shape && shape[key]) {
              result[key] = this._deserializeValue(shape[key], val);
            } else {
              result[key] = val;
            }
          }
          return result;
        }
        return value;
        
      case 'ZodOptional':
        const optionalInnerType = zodField?._def?.innerType;
        return this._deserializeValue(optionalInnerType, value);
        
      case 'ZodNullable':
        const nullableInnerType = zodField?._def?.innerType;
        return this._deserializeValue(nullableInnerType, value);
        
      case 'ZodDefault':
        const defaultInnerType = zodField?._def?.innerType;
        return this._deserializeValue(defaultInnerType, value);
        
      case 'ZodUnion':
      case 'ZodDiscriminatedUnion':
        // For unions, try each option until one works
        const options = zodField?._def?.options || [];
        for (const option of options) {
          try {
            const deserializedValue = this._deserializeValue(option, value);
            // Try to validate with this option to see if it's the right type
            const result = option.safeParse(deserializedValue);
            if (result.success) {
              return deserializedValue;
            }
          } catch (e) {
            // Continue to next option
          }
        }
        return value;
        
      case 'ZodTuple':
        if (Array.isArray(value)) {
          const items = zodField?._def?.items || [];
          return value.map((item, index) => {
            if (index < items.length) {
              return this._deserializeValue(items[index], item);
            }
            return item;
          });
        }
        return value;
        
      case 'ZodRecord':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const valueType = zodField?._def?.valueType;
          const result: Record<string, any> = {};
          for (const [key, val] of Object.entries(value)) {
            result[key] = this._deserializeValue(valueType, val);
          }
          return result;
        }
        return value;
        
      // Primitive types that don't need deserialization
      case 'ZodString':
      case 'ZodNumber':
      case 'ZodBoolean':
      case 'ZodLiteral':
      case 'ZodEnum':
      case 'ZodNativeEnum':
      case 'ZodUndefined':
      case 'ZodNull':
      case 'ZodVoid':
      case 'ZodAny':
      case 'ZodUnknown':
      case 'ZodNever':
        return value;
        
      default:
        // Unknown type, return as-is
        return value;
    }
  }
}

export function createSchema<T extends Record<string, any>>(
  zodSchema: ZodSchema<T>, 
  tableName?: string
): BmDbSchema<T> {
  return new BmDbSchema(zodSchema, tableName);
}
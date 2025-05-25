import type { ZodType, ZodTypeAny } from 'zod';
import type { BmDbFieldMeta, BmDbRelationship } from './types';

// Use a symbol to attach metadata without corrupting Zod's internal structure
const BMDB_META_SYMBOL = Symbol('bmdb_field_meta');

function withMeta<T extends ZodTypeAny>(schema: T, meta: Partial<BmDbFieldMeta>): T {
  const existingMeta = ((schema as any)[BMDB_META_SYMBOL] || {}) as Partial<BmDbFieldMeta>;
  const newMeta: BmDbFieldMeta = { 
    bmDbType: 'field',
    ...existingMeta, 
    ...meta
  };
  
  // Attach metadata to the schema object itself
  (schema as any)[BMDB_META_SYMBOL] = newMeta;
  return schema;
}

export function getFieldMeta(schema: ZodTypeAny): BmDbFieldMeta | undefined {
  if (!schema) return undefined;
  return (schema as any)[BMDB_META_SYMBOL];
}

export function unique<T extends ZodTypeAny>(schema: T): T {
  return withMeta(schema, { isUnique: true });
}

export function primaryKey<T extends ZodTypeAny>(schema: T): T {
  return withMeta(schema, { isPrimaryKey: true, isUnique: true });
}

export function compoundIndex<T extends ZodTypeAny>(schema: T, groupName: string): T {
  return withMeta(schema, { compoundIndexGroup: groupName });
}

export function field<T extends ZodTypeAny>(schema: T, meta: Partial<BmDbFieldMeta> = {}): T {
  return withMeta(schema, meta);
}

export function vector<T extends ZodTypeAny>(
  schema: T, 
  dimensions: number, 
  algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine'
): T {
  return withMeta(schema, { 
    isVector: true, 
    vectorDimensions: dimensions,
    vectorSearchAlgorithm: algorithm 
  });
}

// Relationship helpers
export function belongsTo<T extends ZodTypeAny>(
  schema: T, 
  targetTable: string, 
  options: {
    foreignKey?: string;
    cascadeDelete?: boolean;
    cascadeUpdate?: boolean;
  } = {}
): T {
  return withMeta(schema, {
    relationship: {
      type: 'belongsTo',
      targetTable,
      foreignKey: options.foreignKey,
      cascadeDelete: options.cascadeDelete ?? false,
      cascadeUpdate: options.cascadeUpdate ?? false,
    }
  });
}

export function hasMany<T extends ZodTypeAny>(
  schema: T, 
  targetTable: string, 
  options: {
    localKey?: string;
    cascadeDelete?: boolean;
    cascadeUpdate?: boolean;
  } = {}
): T {
  return withMeta(schema, {
    relationship: {
      type: 'hasMany',
      targetTable,
      localKey: options.localKey,
      cascadeDelete: options.cascadeDelete ?? true, // Default true for hasMany
      cascadeUpdate: options.cascadeUpdate ?? false,
    }
  });
}

export function hasOne<T extends ZodTypeAny>(
  schema: T, 
  targetTable: string, 
  options: {
    localKey?: string;
    cascadeDelete?: boolean;
    cascadeUpdate?: boolean;
  } = {}
): T {
  return withMeta(schema, {
    relationship: {
      type: 'hasOne',
      targetTable,
      localKey: options.localKey,
      cascadeDelete: options.cascadeDelete ?? true, // Default true for hasOne
      cascadeUpdate: options.cascadeUpdate ?? false,
    }
  });
}
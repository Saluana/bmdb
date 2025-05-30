import type { ZodType } from 'zod';

export interface BmDbFieldMeta {
  bmDbType: 'field';
  isUnique?: boolean;
  isPrimaryKey?: boolean;
  compoundIndexGroup?: string;
  isVector?: boolean;
  vectorDimensions?: number;
  vectorSearchAlgorithm?: 'cosine' | 'euclidean' | 'dot' | 'manhattan';
  relationship?: BmDbRelationship;
}

export interface BmDbRelationship {
  type: 'belongsTo' | 'hasMany' | 'hasOne';
  targetTable: string;
  foreignKey?: string; // For belongsTo relationships
  localKey?: string;   // For hasMany/hasOne relationships
  cascadeDelete?: boolean;
  cascadeUpdate?: boolean;
}

export interface BmDbSchemaMeta {
  bmDbType: 'schema';
  tableName?: string;
  version?: number;
}

export function hasBmDbFieldMeta(def: any): def is { meta: BmDbFieldMeta } {
  return def?.meta?.bmDbType === 'field';
}

export function hasBmDbSchemaMeta(def: any): def is { meta: BmDbSchemaMeta } {
  return def?.meta?.bmDbType === 'schema';
}

export type SchemaValidationError = {
  code: 'ERR_VALIDATION_FAILED';
  message: string;
  path: string[];
  zodError: any;
};

export type UniqueConstraintError = {
  code: 'ERR_UNIQUE_CONSTRAINT';
  message: string;
  field: string;
  value: any;
};

export type SchemaError = SchemaValidationError | UniqueConstraintError;
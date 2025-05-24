import type { BmDbSchema } from './BmDbSchema';
import type { BmDbFieldMeta } from './types';

export function getSchemaFieldMeta<T extends Record<string, any>>(
  schema: BmDbSchema<T>, 
  field: keyof T
): BmDbFieldMeta | undefined {
  return schema.getFieldMeta(field);
}

export function isPrimaryKey<T extends Record<string, any>>(
  schema: BmDbSchema<T>, 
  field: keyof T
): boolean {
  return getSchemaFieldMeta(schema, field)?.isPrimaryKey ?? false;
}

export function isUnique<T extends Record<string, any>>(
  schema: BmDbSchema<T>, 
  field: keyof T
): boolean {
  return getSchemaFieldMeta(schema, field)?.isUnique ?? false;
}

export function getUniqueFields<T extends Record<string, any>>(
  schema: BmDbSchema<T>
): Array<keyof T> {
  return schema.getUniqueFields();
}

export function getPrimaryKey<T extends Record<string, any>>(
  schema: BmDbSchema<T>
): keyof T | undefined {
  return schema.getPrimaryKey();
}

export function getCompoundIndexGroups<T extends Record<string, any>>(
  schema: BmDbSchema<T>
): Record<string, Array<keyof T>> {
  return schema.getCompoundIndexGroups();
}

export function validateSchemaData<T extends Record<string, any>>(
  schema: BmDbSchema<T>,
  data: unknown
): T {
  return schema.validate(data);
}

export function safeValidateSchemaData<T extends Record<string, any>>(
  schema: BmDbSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: any } {
  return schema.safeValidate(data);
}
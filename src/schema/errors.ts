import type { SchemaError, UniqueConstraintError, SchemaValidationError } from './types';

export class BmDbSchemaError extends Error {
  public readonly code: string;
  public readonly bmDbError: SchemaError;

  constructor(error: SchemaError) {
    super(error.message);
    this.name = 'BmDbSchemaError';
    this.code = error.code;
    this.bmDbError = error;
  }
}

export class BmDbValidationError extends BmDbSchemaError {
  public readonly path: string[];
  public readonly zodError: any;

  constructor(error: SchemaValidationError) {
    super(error);
    this.path = error.path;
    this.zodError = error.zodError;
  }
}

export class BmDbUniqueConstraintError extends BmDbSchemaError {
  public readonly field: string;
  public readonly value: any;

  constructor(error: UniqueConstraintError) {
    super(error);
    this.field = error.field;
    this.value = error.value;
  }
}

export function createValidationError(message: string, path: string[], zodError: any): BmDbValidationError {
  return new BmDbValidationError({
    code: 'ERR_VALIDATION_FAILED',
    message,
    path,
    zodError
  });
}

export function createUniqueConstraintError(field: string, value: any): BmDbUniqueConstraintError {
  return new BmDbUniqueConstraintError({
    code: 'ERR_UNIQUE_CONSTRAINT',
    message: `Unique constraint violation: field '${field}' with value '${value}' already exists`,
    field,
    value
  });
}
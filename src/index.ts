// Core exports - matching Python TinyDB
import { TinyDB } from './core/TinyDB';
export { TinyDB } from './core/TinyDB';
export { Table, Document } from './core/Table';
export { SchemaTable } from './core/SchemaTable';

// Storage exports
export type { Storage, StorageCtor } from './storage/Storage';
export { JSONStorage } from './storage/JSONStorage';
export { MemoryStorage } from './storage/MemoryStorage';
export { BinaryStorage } from './storage/BinaryStorage';
export { WALStorage } from './storage/WALStorage';
export { WALJSONStorage } from './storage/WALJSONStorage';
export type { WALOperation, Transaction } from './storage/WALStorage';

// Query exports
export { QueryInstance } from './query/QueryInstance';
export { Query, QueryFactory, where } from './query/where';
export { IndexManager } from './query/IndexManager';
export type {
    IndexableCondition,
    QueryPlan,
    CostEstimate,
    FieldStatistics,
} from './query/IndexManager';

// Operations exports
export * as operations from './operations';
export {
    deleteOp as delete,
    add,
    subtract,
    set,
    increment,
    decrement,
} from './operations';

// Middleware exports
export { Middleware, CachingMiddleware } from './middlewares';

// Utility exports
export type {
    Doc,
    JsonObject,
    JsonValue,
    JsonPrimitive,
    JsonArray,
} from './utils/types';
export { LRUCache } from './utils/LRUCache';
export { MessagePackUtil } from './utils/MessagePackUtil';
export { VectorUtils } from './utils/VectorUtils';
export type {
    Vector,
    VectorSearchResult,
    VectorIndex,
} from './utils/VectorUtils';
export { IndexedBTree, BitmapUtils } from './utils/IndexedBTree';
export type { IndexedBTreeEntry, BitmapSet } from './utils/IndexedBTree';

// Schema exports (V2)
export { BmDbSchema, createSchema } from './schema/BmDbSchema';
export type {
    BmDbFieldMeta,
    BmDbSchemaMeta,
    SchemaError,
} from './schema/types';
export {
    BmDbSchemaError,
    BmDbValidationError,
    BmDbUniqueConstraintError,
    createValidationError,
    createUniqueConstraintError,
} from './schema/errors';
export {
    unique,
    primaryKey,
    compoundIndex,
    field,
    vector,
    getFieldMeta,
} from './schema/helpers';
export {
    getSchemaFieldMeta,
    isPrimaryKey,
    isUnique,
    getUniqueFields,
    getPrimaryKey,
    getCompoundIndexGroups,
    validateSchemaData,
    safeValidateSchemaData,
    validatePartialSchemaData,
    safeValidatePartialSchemaData,
} from './schema/utils';

// Default export for convenience
export default TinyDB;

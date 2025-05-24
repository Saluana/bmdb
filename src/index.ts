// Core exports - matching Python TinyDB
import { TinyDB } from './core/TinyDB';
export { TinyDB } from './core/TinyDB';
export { Table, Document } from './core/Table';

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

// Default export for convenience
export default TinyDB;

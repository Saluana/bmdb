/**
 * A collection of update operations for TinyDB.
 * 
 * They are used for updates like this:
 * 
 * db.update(deleteOp('foo'), where('foo').eq(2))
 * 
 * This would delete the `foo` field from all documents where `foo` equals 2.
 */

/**
 * Delete a given field from the document.
 */
export function deleteOp(field: string) {
  return function transform(doc: Record<string, any>) {
    delete doc[field];
  };
}

// For Python compatibility
export const delete_ = deleteOp;

/**
 * Add `n` to a given field in the document.
 */
export function add(field: string, n: number) {
  return function transform(doc: Record<string, any>) {
    doc[field] += n;
  };
}

/**
 * Subtract `n` from a given field in the document.
 */
export function subtract(field: string, n: number) {
  return function transform(doc: Record<string, any>) {
    doc[field] -= n;
  };
}

/**
 * Set a given field to `val`.
 */
export function set(field: string, val: any) {
  return function transform(doc: Record<string, any>) {
    doc[field] = val;
  };
}

/**
 * Increment a given field in the document by 1.
 */
export function increment(field: string) {
  return function transform(doc: Record<string, any>) {
    doc[field] += 1;
  };
}

/**
 * Decrement a given field in the document by 1.
 */
export function decrement(field: string) {
  return function transform(doc: Record<string, any>) {
    doc[field] -= 1;
  };
}
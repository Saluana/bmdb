import { QueryInstance } from "./QueryInstance";

// Helper functions
function isSequence(obj: any): boolean {
  return obj && typeof obj[Symbol.iterator] === 'function';
}

function freeze(obj: any): any {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return Object.freeze(obj.map(freeze));
    } else if (obj.constructor === Object) {
      const frozen: any = {};
      for (const [key, value] of Object.entries(obj)) {
        frozen[key] = freeze(value);
      }
      return Object.freeze(frozen);
    } else if (obj instanceof Set) {
      return Object.freeze(new Set([...obj].map(freeze)));
    }
  }
  return obj;
}

export class Query {
  protected _path: Array<string | Function>;
  protected _hash: any;

  constructor() {
    this._path = [];
    this._hash = [null];
  }

  toString(): string {
    return 'Query()';
  }

  isCacheable(): boolean {
    return this._hash !== null && this._hash !== undefined;
  }

  // Property access
  __getattr__(item: string): Query {
    const query = new Query();
    query._path = [...this._path, item];
    query._hash = this.isCacheable() ? ['path', query._path] : null;
    return query;
  }

  // Bracket access
  __getitem__(item: string): Query {
    return this.__getattr__(item);
  }

  // Call the query to test a document
  __call__(value: Record<string, any>): boolean {
    if (!this._path.length) {
      throw new Error('Empty query was evaluated');
    }
    return this._generateTest(() => true, null).test(value);
  }

  // Make it callable as a function
  call(value: Record<string, any>): boolean {
    return this.__call__(value);
  }

  // For direct function calls - different from QueryInstance.test
  testDocument(value: Record<string, any>): boolean {
    return this.__call__(value);
  }

  // Generate a test function that resolves the query path
  private _generateTest(
    test: (value: any) => boolean,
    hashval: any,
    allowEmptyPath: boolean = false
  ): QueryInstance {
    if (!this._path.length && !allowEmptyPath) {
      throw new Error('Query has no path');
    }

    const runner = (value: Record<string, any>): boolean => {
      try {
        let current = value;
        // Resolve the path
        for (const part of this._path) {
          if (typeof part === 'string') {
            current = current[part];
          } else {
            current = part(current);
          }
        }
        // Perform the test
        return test(current);
      } catch (error) {
        return false;
      }
    };

    return new QueryInstance(
      runner,
      this.isCacheable() ? hashval : null
    );
  }

  // Comparison operations - generate index-friendly hashes
  __eq__(rhs: any): QueryInstance {
    return this._generateTest(
      (value) => value === rhs,
      this._createFieldOpHash('=', rhs)
    );
  }

  __ne__(rhs: any): QueryInstance {
    return this._generateTest(
      (value) => value !== rhs,
      this._createFieldOpHash('!=', rhs)
    );
  }

  __lt__(rhs: any): QueryInstance {
    return this._generateTest(
      (value) => value < rhs,
      this._createFieldOpHash('<', rhs)
    );
  }

  __le__(rhs: any): QueryInstance {
    return this._generateTest(
      (value) => value <= rhs,
      this._createFieldOpHash('<=', rhs)
    );
  }

  __gt__(rhs: any): QueryInstance {
    return this._generateTest(
      (value) => value > rhs,
      this._createFieldOpHash('>', rhs)
    );
  }

  __ge__(rhs: any): QueryInstance {
    return this._generateTest(
      (value) => value >= rhs,
      this._createFieldOpHash('>=', rhs)
    );
  }

  // Create index-friendly hash for field operations
  private _createFieldOpHash(operator: string, value: any, value2?: any): any[] {
    // For single field access, create simple hash
    if (this._path.length === 1 && typeof this._path[0] === 'string') {
      const baseHash = ['field_op', this._path[0], operator, freeze(value)];
      if (value2 !== undefined) {
        baseHash.push(freeze(value2));
      }
      return baseHash;
    }
    
    // For complex paths, fall back to original format
    const baseHash = [operator, this._path, freeze(value)];
    if (value2 !== undefined) {
      baseHash.push(freeze(value2));
    }
    return baseHash;
  }

  // Existence check
  exists(): QueryInstance {
    return this._generateTest(
      () => true,
      ['exists', this._path]
    );
  }

  // Regex matching
  matches(regex: string | RegExp, flags?: string): QueryInstance {
    const regexObj = typeof regex === 'string' ? new RegExp(regex, flags) : regex;
    
    const test = (value: any): boolean => {
      if (typeof value !== 'string') {
        return false;
      }
      return regexObj.test(value);
    };

    return this._generateTest(test, ['matches', this._path, regex.toString()]);
  }

  // Regex search
  search(regex: string | RegExp, flags?: string): QueryInstance {
    const regexObj = typeof regex === 'string' ? new RegExp(regex, flags) : regex;
    
    const test = (value: any): boolean => {
      if (typeof value !== 'string') {
        return false;
      }
      return regexObj.test(value);
    };

    return this._generateTest(test, ['search', this._path, regex.toString()]);
  }

  // Custom test function
  test(func: Function, ...args: any[]): QueryInstance {
    return this._generateTest(
      (value) => func(value, ...args),
      ['test', this._path, func, args]
    );
  }

  // Any condition
  any(cond: QueryInstance | Function | any[] | any): QueryInstance {
    let testFunc: (value: any) => boolean;
    
    if (cond instanceof QueryInstance) {
      testFunc = (value: any): boolean => {
        return isSequence(value) && Array.from(value).some((e: any) => 
          cond.test(e)
        );
      };
    } else if (typeof cond === 'function') {
      testFunc = (value: any): boolean => {
        return isSequence(value) && Array.from(value).some((e: any) => 
          cond(e)
        );
      };
    } else if (Array.isArray(cond)) {
      testFunc = (value: any): boolean => {
        return isSequence(value) && Array.from(value).some((e: any) => 
          cond.includes(e)
        );
      };
    } else {
      testFunc = (value: any): boolean => {
        return isSequence(value) && Array.from(value).some((e: any) => 
          cond === e
        );
      };
    }

    return this._generateTest(testFunc, ['any', this._path, freeze(cond)]);
  }

  // All condition
  all(cond: QueryInstance | Function | any[] | any): QueryInstance {
    let testFunc: (value: any) => boolean;
    
    if (cond instanceof QueryInstance) {
      testFunc = (value: any): boolean => {
        return isSequence(value) && Array.from(value).every((e: any) => 
          cond.test(e)
        );
      };
    } else if (typeof cond === 'function') {
      testFunc = (value: any): boolean => {
        return isSequence(value) && Array.from(value).every((e: any) => 
          cond(e)
        );
      };
    } else if (Array.isArray(cond)) {
      testFunc = (value: any): boolean => {
        return isSequence(value) && 
               cond.every((e: any) => Array.from(value).includes(e));
      };
    } else {
      testFunc = (value: any): boolean => {
        return isSequence(value) && Array.from(value).every((e: any) => e === cond);
      };
    }

    return this._generateTest(testFunc, ['all', this._path, freeze(cond)]);
  }

  // One of condition - index-friendly IN clause
  oneOf(items: any[]): QueryInstance {
    return this._generateTest(
      (value) => items.includes(value),
      this._createFieldOpHash('in', items)
    );
  }

  // IN clause alias
  in(items: any[]): QueryInstance {
    return this.oneOf(items);
  }

  // Range query (BETWEEN)
  between(min: any, max: any): QueryInstance {
    return this._generateTest(
      (value) => value >= min && value <= max,
      this._createFieldOpHash('between', min, max)
    );
  }

  // Fragment matching
  fragment(document: Record<string, any>): QueryInstance {
    const testFunc = (value: any): boolean => {
      for (const key in document) {
        if (!(key in value) || value[key] !== document[key]) {
          return false;
        }
      }
      return true;
    };

    return this._generateTest(
      testFunc,
      ['fragment', freeze(document)],
      true
    );
  }

  // No-op query
  noop(): QueryInstance {
    return new QueryInstance(() => true, []);
  }

  // Map transformation
  map(fn: Function): Query {
    const query = new Query();
    query._path = [...this._path, fn];
    query._hash = null; // Callable objects can be mutable, so no caching
    return query;
  }

  // Friendly alias methods for comparison operations
  equals(rhs: any): QueryInstance {
    return this.__eq__(rhs);
  }

  notEquals(rhs: any): QueryInstance {
    return this.__ne__(rhs);
  }

  lessThan(rhs: any): QueryInstance {
    return this.__lt__(rhs);
  }

  lessThanOrEqual(rhs: any): QueryInstance {
    return this.__le__(rhs);
  }

  lte(rhs: any): QueryInstance {
    return this.__le__(rhs);
  }

  greaterThan(rhs: any): QueryInstance {
    return this.__gt__(rhs);
  }

  greaterThanOrEqual(rhs: any): QueryInstance {
    return this.__ge__(rhs);
  }

  gte(rhs: any): QueryInstance {
    return this.__ge__(rhs);
  }
}

// Create a proxy to handle property access
function createQueryProxy(): Query {
  const query = new Query();
  
  return new Proxy(query, {
    get(target, prop) {
      if (typeof prop === 'string' && !(prop in target)) {
        return target.__getattr__(prop);
      }
      return Reflect.get(target, prop);
    }
  });
}

// Export a function that creates a new Query
export function QueryFactory(): Query {
  return createQueryProxy();
}

// where function as shorthand
export function where(key: string): Query {
  return createQueryProxy().__getitem__(key);
}

// For backwards compatibility, also export individual methods
export function eq(field: string, value: any): QueryInstance {
  return where(field).__eq__(value);
}

export function ne(field: string, value: any): QueryInstance {
  return where(field).__ne__(value);
}

export function gt(field: string, value: any): QueryInstance {
  return where(field).__gt__(value);
}

export function gte(field: string, value: any): QueryInstance {
  return where(field).__ge__(value);
}

export function lt(field: string, value: any): QueryInstance {
  return where(field).__lt__(value);
}

export function lte(field: string, value: any): QueryInstance {
  return where(field).__le__(value);
}

export function contains(field: string, value: any): QueryInstance {
  return where(field).any([value]);
}
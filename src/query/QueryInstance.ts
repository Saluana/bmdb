export class QueryInstance<T = any> {
  protected _test: (doc: Record<string, any>) => boolean;
  protected _hash: any;

  constructor(test: (doc: Record<string, any>) => boolean, hashval: any) {
    this._test = test;
    this._hash = hashval;
  }

  isCacheable(): boolean {
    return this._hash !== null && this._hash !== undefined;
  }

  // Call the query to test a document
  __call__(value: Record<string, any>): boolean {
    return this._test(value);
  }

  // Make it callable as a function
  call(value: Record<string, any>): boolean {
    return this._test(value);
  }

  // For direct function calls
  test(value: Record<string, any>): boolean {
    return this._test(value);
  }

  __hash__(): string {
    return JSON.stringify(this._hash);
  }

  hash(): string {
    return this.__hash__();
  }

  toString(): string {
    return `QueryImpl${JSON.stringify(this._hash)}`;
  }

  __eq__(other: any): boolean {
    if (other instanceof QueryInstance) {
      return JSON.stringify(this._hash) === JSON.stringify(other._hash);
    }
    return false;
  }

  // Query modifiers
  __and__(other: QueryInstance<T>): QueryInstance<T> {
    const hashval = this.isCacheable() && other.isCacheable() ? 
      ['and', new Set([this._hash, other._hash])] : null;
    return new QueryInstance<T>(
      (value) => this._test(value) && other._test(value), 
      hashval
    );
  }

  and(other: QueryInstance<T>): QueryInstance<T> {
    return this.__and__(other);
  }

  __or__(other: QueryInstance<T>): QueryInstance<T> {
    const hashval = this.isCacheable() && other.isCacheable() ? 
      ['or', new Set([this._hash, other._hash])] : null;
    return new QueryInstance<T>(
      (value) => this._test(value) || other._test(value), 
      hashval
    );
  }

  or(other: QueryInstance<T>): QueryInstance<T> {
    return this.__or__(other);
  }

  __invert__(): QueryInstance<T> {
    const hashval = this.isCacheable() ? ['not', this._hash] : null;
    return new QueryInstance<T>((value) => !this._test(value), hashval);
  }

  not(): QueryInstance<T> {
    return this.__invert__();
  }
}
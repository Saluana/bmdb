class DoublyLinkedNode<K, V> {
  constructor(
    public key: K,
    public value: V,
    public prev: DoublyLinkedNode<K, V> | null = null,
    public next: DoublyLinkedNode<K, V> | null = null
  ) {}
}

export class LRUCache<K, V> {
  private map = new Map<K, DoublyLinkedNode<K, V>>();
  private head: DoublyLinkedNode<K, V>;
  private tail: DoublyLinkedNode<K, V>;
  private _hits = 0;
  private _misses = 0;

  constructor(private capacity: number) {
    this.head = new DoublyLinkedNode(null as any, null as any);
    this.tail = new DoublyLinkedNode(null as any, null as any);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  private addToHead(node: DoublyLinkedNode<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    
    if (this.head.next) {
      this.head.next.prev = node;
    }
    this.head.next = node;
  }

  private removeNode(node: DoublyLinkedNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
  }

  private moveToHead(node: DoublyLinkedNode<K, V>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private removeTail(): DoublyLinkedNode<K, V> | null {
    const lastNode = this.tail.prev;
    if (lastNode && lastNode !== this.head) {
      this.removeNode(lastNode);
      return lastNode;
    }
    return null;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (node) {
      this._hits++;
      this.moveToHead(node);
      return node.value;
    }
    this._misses++;
    return undefined;
  }

  set(key: K, value: V): void {
    const existingNode = this.map.get(key);
    
    if (existingNode) {
      existingNode.value = value;
      this.moveToHead(existingNode);
    } else {
      const newNode = new DoublyLinkedNode(key, value);
      
      if (this.map.size >= this.capacity) {
        const tail = this.removeTail();
        if (tail) {
          this.map.delete(tail.key);
        }
      }
      
      this.addToHead(newNode);
      this.map.set(key, newNode);
    }
  }

  clear(): void {
    this.map.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this._hits = 0;
    this._misses = 0;
  }

  // Selective cache invalidation - remove entries by key pattern
  invalidate(keyPattern: string | RegExp | ((key: K) => boolean)): number {
    let removed = 0;
    const keysToRemove: K[] = [];
    
    for (const key of this.map.keys()) {
      let shouldRemove = false;
      
      if (typeof keyPattern === 'string') {
        shouldRemove = String(key).includes(keyPattern);
      } else if (keyPattern instanceof RegExp) {
        shouldRemove = keyPattern.test(String(key));
      } else if (typeof keyPattern === 'function') {
        shouldRemove = keyPattern(key);
      }
      
      if (shouldRemove) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      const node = this.map.get(key);
      if (node) {
        this.removeNode(node);
        this.map.delete(key);
        removed++;
      }
    }
    
    return removed;
  }

  // Remove specific keys without affecting LRU order of remaining items
  delete(key: K): boolean {
    const node = this.map.get(key);
    if (node) {
      this.removeNode(node);
      this.map.delete(key);
      return true;
    }
    return false;
  }

  // Cache statistics
  get hitRate(): number {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }

  get hits(): number {
    return this._hits;
  }

  get misses(): number {
    return this._misses;
  }

  get size(): number {
    return this.map.size;
  }

  get maxSize(): number {
    return this.capacity;
  }

  // Check if cache contains key without affecting LRU order
  has(key: K): boolean {
    return this.map.has(key);
  }

  // Get all keys in LRU order (most recent first)
  keys(): K[] {
    const keys: K[] = [];
    let current = this.head.next;
    while (current && current !== this.tail) {
      keys.push(current.key);
      current = current.next;
    }
    return keys;
  }

  // Get cache statistics
  getStats(): { hits: number; misses: number; hitRate: number; size: number; maxSize: number } {
    return {
      hits: this._hits,
      misses: this._misses,
      hitRate: this.hitRate,
      size: this.size,
      maxSize: this.maxSize
    };
  }

  // Get memory usage estimation
  getMemoryUsage(): { estimatedBytes: number; nodeCount: number } {
    return {
      estimatedBytes: this.map.size * 150, // Rough estimate per node
      nodeCount: this.map.size
    };
  }
}
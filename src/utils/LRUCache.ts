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
      this.moveToHead(node);
      return node.value;
    }
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
  }
}
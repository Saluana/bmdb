/**
 * Index-aware B-tree implementation for fast document lookups
 * Replaces Map<key, Set<docId>> with O(log n) lookups and bitmap operations
 */

export interface IndexedBTreeEntry {
  key: string;       // Field value as string
  docIds: Set<number>; // Document IDs with this value
}

export interface BitmapSet {
  bits: Uint32Array;
  size: number;
  maxDocId: number;
}

export class BitmapUtils {
  // Create bitmap from docId set
  static fromSet(docIds: Set<number>): BitmapSet {
    const maxDocId = Math.max(...docIds, 0);
    const arraySize = Math.ceil((maxDocId + 1) / 32);
    const bits = new Uint32Array(arraySize);
    
    for (const docId of docIds) {
      const arrayIndex = Math.floor(docId / 32);
      const bitIndex = docId % 32;
      bits[arrayIndex] |= (1 << bitIndex);
    }
    
    return { bits, size: docIds.size, maxDocId };
  }

  // Convert bitmap back to Set
  static toSet(bitmap: BitmapSet): Set<number> {
    const result = new Set<number>();
    
    for (let arrayIndex = 0; arrayIndex < bitmap.bits.length; arrayIndex++) {
      const chunk = bitmap.bits[arrayIndex];
      if (chunk === 0) continue;
      
      for (let bitIndex = 0; bitIndex < 32; bitIndex++) {
        if ((chunk & (1 << bitIndex)) !== 0) {
          const docId = arrayIndex * 32 + bitIndex;
          if (docId <= bitmap.maxDocId) {
            result.add(docId);
          }
        }
      }
    }
    
    return result;
  }

  // Intersect two bitmaps (AND operation)
  static intersect(a: BitmapSet, b: BitmapSet): BitmapSet {
    const maxLen = Math.max(a.bits.length, b.bits.length);
    const result = new Uint32Array(maxLen);
    let size = 0;
    
    for (let i = 0; i < maxLen; i++) {
      const aChunk = i < a.bits.length ? a.bits[i] : 0;
      const bChunk = i < b.bits.length ? b.bits[i] : 0;
      const intersection = aChunk & bChunk;
      result[i] = intersection;
      
      // Count bits
      size += this.popcount(intersection);
    }
    
    return { 
      bits: result, 
      size, 
      maxDocId: Math.max(a.maxDocId, b.maxDocId) 
    };
  }

  // Union two bitmaps (OR operation)
  static union(a: BitmapSet, b: BitmapSet): BitmapSet {
    const maxLen = Math.max(a.bits.length, b.bits.length);
    const result = new Uint32Array(maxLen);
    let size = 0;
    
    for (let i = 0; i < maxLen; i++) {
      const aChunk = i < a.bits.length ? a.bits[i] : 0;
      const bChunk = i < b.bits.length ? b.bits[i] : 0;
      const union = aChunk | bChunk;
      result[i] = union;
      
      // Count bits
      size += this.popcount(union);
    }
    
    return { 
      bits: result, 
      size, 
      maxDocId: Math.max(a.maxDocId, b.maxDocId) 
    };
  }

  // Count set bits in a 32-bit integer
  private static popcount(n: number): number {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0xF0F0F0F) * 0x1010101) >>> 24;
  }

  // Check if bitmap is empty
  static isEmpty(bitmap: BitmapSet): boolean {
    return bitmap.size === 0;
  }

  // Get first docId in bitmap (for single results)
  static getFirst(bitmap: BitmapSet): number | null {
    for (let arrayIndex = 0; arrayIndex < bitmap.bits.length; arrayIndex++) {
      const chunk = bitmap.bits[arrayIndex];
      if (chunk === 0) continue;
      
      for (let bitIndex = 0; bitIndex < 32; bitIndex++) {
        if ((chunk & (1 << bitIndex)) !== 0) {
          return arrayIndex * 32 + bitIndex;
        }
      }
    }
    return null;
  }
}

export class IndexedBTreeNode {
  static readonly MAX_KEYS = 15;
  static readonly MIN_KEYS = 7;

  isLeaf: boolean;
  keys: string[] = [];
  entries: IndexedBTreeEntry[] = []; // For leaf nodes
  children: IndexedBTreeNode[] = []; // For internal nodes
  parent: IndexedBTreeNode | null = null;
  nextLeaf: IndexedBTreeNode | null = null; // Linked list of leaves

  constructor(isLeaf: boolean = true) {
    this.isLeaf = isLeaf;
  }

  // Find entry in leaf node
  findEntry(key: string): IndexedBTreeEntry | null {
    if (!this.isLeaf) return null;
    
    const index = this.keys.indexOf(key);
    return index >= 0 ? this.entries[index] : null;
  }

  // Find all entries with keys in range [minKey, maxKey]
  findRange(minKey: string, maxKey: string): IndexedBTreeEntry[] {
    if (!this.isLeaf) return [];
    
    const results: IndexedBTreeEntry[] = [];
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      if (key >= minKey && key <= maxKey) {
        results.push(this.entries[i]);
      }
    }
    return results;
  }

  // Find child index for key in internal node
  findChildIndex(key: string): number {
    let i = 0;
    while (i < this.keys.length && key.localeCompare(this.keys[i]) >= 0) {
      i++;
    }
    return i;
  }

  // Insert entry into leaf node
  insertEntry(entry: IndexedBTreeEntry): boolean {
    if (!this.isLeaf) return false;

    // Check if key already exists
    const existingIndex = this.keys.indexOf(entry.key);
    if (existingIndex >= 0) {
      // Merge docIds
      for (const docId of entry.docIds) {
        this.entries[existingIndex].docIds.add(docId);
      }
      return true;
    }

    if (this.keys.length >= IndexedBTreeNode.MAX_KEYS) {
      return false; // Node is full
    }

    // Find insertion point
    let i = 0;
    while (i < this.keys.length && entry.key.localeCompare(this.keys[i]) > 0) {
      i++;
    }

    // Insert at position i
    this.keys.splice(i, 0, entry.key);
    this.entries.splice(i, 0, entry);
    
    return true;
  }

  // Remove docId from entry, remove entry if empty
  removeDocId(key: string, docId: number): boolean {
    if (!this.isLeaf) return false;

    const index = this.keys.indexOf(key);
    if (index < 0) return false;

    const entry = this.entries[index];
    entry.docIds.delete(docId);
    
    // Remove entry if no more docIds
    if (entry.docIds.size === 0) {
      this.keys.splice(index, 1);
      this.entries.splice(index, 1);
    }
    
    return true;
  }

  // Split node when full
  split(): { leftNode: IndexedBTreeNode; rightNode: IndexedBTreeNode; middleKey: string } {
    const midIndex = Math.floor(this.keys.length / 2);
    const middleKey = this.keys[midIndex];

    const rightNode = new IndexedBTreeNode(this.isLeaf);
    
    if (this.isLeaf) {
      // For leaf nodes, middle key goes to right node
      rightNode.keys = this.keys.slice(midIndex);
      rightNode.entries = this.entries.slice(midIndex);
      rightNode.nextLeaf = this.nextLeaf;
      
      this.keys = this.keys.slice(0, midIndex);
      this.entries = this.entries.slice(0, midIndex);
      this.nextLeaf = rightNode;
    } else {
      // For internal nodes, middle key is promoted
      rightNode.keys = this.keys.slice(midIndex + 1);
      rightNode.children = this.children.slice(midIndex + 1);
      
      this.keys = this.keys.slice(0, midIndex);
      this.children = this.children.slice(0, midIndex + 1);
      
      // Update parent pointers
      for (const child of rightNode.children) {
        child.parent = rightNode;
      }
    }

    return { leftNode: this, rightNode, middleKey };
  }

  // Check if node needs rebalancing
  needsRebalancing(): boolean {
    return this.keys.length < IndexedBTreeNode.MIN_KEYS;
  }
}

export class IndexedBTree {
  private root: IndexedBTreeNode | null = null;
  private fieldName: string;

  constructor(fieldName: string) {
    this.fieldName = fieldName;
  }

  // Get bitmap of docIds for exact value match
  getExact(value: any): BitmapSet | null {
    const key = String(value);
    const entry = this.findEntry(key);
    return entry ? BitmapUtils.fromSet(entry.docIds) : null;
  }

  // Get bitmap of docIds for range query [minValue, maxValue]
  getRange(minValue: any, maxValue: any): BitmapSet | null {
    const minKey = String(minValue);
    const maxKey = String(maxValue);
    
    if (!this.root) return null;

    const allEntries = this.getRangeEntries(minKey, maxKey);
    if (allEntries.length === 0) return null;

    // Union all docId sets
    let result: BitmapSet | null = null;
    for (const entry of allEntries) {
      const bitmap = BitmapUtils.fromSet(entry.docIds);
      result = result ? BitmapUtils.union(result, bitmap) : bitmap;
    }

    return result;
  }

  // Get bitmap for greater than comparison
  getGreaterThan(value: any, inclusive: boolean = false): BitmapSet | null {
    const key = String(value);
    
    if (!this.root) return null;

    // Find all entries > key (or >= key if inclusive)
    const allEntries: IndexedBTreeEntry[] = [];
    this.collectGreaterThan(this.root, key, inclusive, allEntries);

    if (allEntries.length === 0) return null;

    // Union all docId sets
    let result: BitmapSet | null = null;
    for (const entry of allEntries) {
      const bitmap = BitmapUtils.fromSet(entry.docIds);
      result = result ? BitmapUtils.union(result, bitmap) : bitmap;
    }

    return result;
  }

  // Get bitmap for less than comparison
  getLessThan(value: any, inclusive: boolean = false): BitmapSet | null {
    const key = String(value);
    
    if (!this.root) return null;

    // Find all entries < key (or <= key if inclusive)
    const allEntries: IndexedBTreeEntry[] = [];
    this.collectLessThan(this.root, key, inclusive, allEntries);

    if (allEntries.length === 0) return null;

    // Union all docId sets
    let result: BitmapSet | null = null;
    for (const entry of allEntries) {
      const bitmap = BitmapUtils.fromSet(entry.docIds);
      result = result ? BitmapUtils.union(result, bitmap) : bitmap;
    }

    return result;
  }

  // Insert or update entry
  insert(value: any, docId: number): void {
    const key = String(value);
    const entry: IndexedBTreeEntry = {
      key,
      docIds: new Set([docId])
    };

    if (!this.root) {
      this.root = new IndexedBTreeNode(true);
      this.root.insertEntry(entry);
      return;
    }

    const targetLeaf = this.findLeafNode(key);
    
    if (targetLeaf.insertEntry(entry)) {
      // Entry inserted successfully
      return;
    }

    // Node is full, need to split
    this.splitAndInsert(targetLeaf, entry);
  }

  // Remove docId from index
  remove(value: any, docId: number): boolean {
    const key = String(value);
    
    if (!this.root) return false;

    const targetLeaf = this.findLeafNode(key);
    return targetLeaf.removeDocId(key, docId);
  }

  // Get all docIds (for full scans)
  getAllDocIds(): BitmapSet | null {
    if (!this.root) return null;

    // Find leftmost leaf and traverse
    let current = this.root;
    while (!current.isLeaf) {
      current = current.children[0];
    }

    let result: BitmapSet | null = null;
    while (current) {
      for (const entry of current.entries) {
        const bitmap = BitmapUtils.fromSet(entry.docIds);
        result = result ? BitmapUtils.union(result, bitmap) : bitmap;
      }
      current = current.nextLeaf!;
    }

    return result;
  }

  private findEntry(key: string): IndexedBTreeEntry | null {
    if (!this.root) return null;

    let current = this.root;
    
    while (current) {
      if (current.isLeaf) {
        return current.findEntry(key);
      } else {
        const childIndex = current.findChildIndex(key);
        current = current.children[childIndex];
      }
    }

    return null;
  }

  private getRangeEntries(minKey: string, maxKey: string): IndexedBTreeEntry[] {
    if (!this.root) return [];

    // Find leftmost leaf that might contain minKey
    let current = this.root;
    while (!current.isLeaf) {
      const childIndex = current.findChildIndex(minKey);
      current = current.children[childIndex];
    }

    const results: IndexedBTreeEntry[] = [];
    
    // Traverse leaves collecting entries in range
    while (current) {
      const rangeEntries = current.findRange(minKey, maxKey);
      results.push(...rangeEntries);
      
      // Stop if we've passed maxKey
      if (current.keys.length > 0 && current.keys[current.keys.length - 1] > maxKey) {
        break;
      }
      
      current = current.nextLeaf!;
    }

    return results;
  }

  private collectGreaterThan(node: IndexedBTreeNode, key: string, inclusive: boolean, results: IndexedBTreeEntry[]): void {
    if (node.isLeaf) {
      for (const entry of node.entries) {
        const matches = inclusive ? entry.key >= key : entry.key > key;
        if (matches) {
          results.push(entry);
        }
      }
    } else {
      const childIndex = node.findChildIndex(key);
      
      // Collect from appropriate children
      for (let i = childIndex; i < node.children.length; i++) {
        this.collectGreaterThan(node.children[i], key, inclusive, results);
      }
    }
  }

  private collectLessThan(node: IndexedBTreeNode, key: string, inclusive: boolean, results: IndexedBTreeEntry[]): void {
    if (node.isLeaf) {
      for (const entry of node.entries) {
        const matches = inclusive ? entry.key <= key : entry.key < key;
        if (matches) {
          results.push(entry);
        }
      }
    } else {
      const childIndex = node.findChildIndex(key);
      
      // Collect from appropriate children
      for (let i = 0; i <= childIndex && i < node.children.length; i++) {
        this.collectLessThan(node.children[i], key, inclusive, results);
      }
    }
  }

  private findLeafNode(key: string): IndexedBTreeNode {
    if (!this.root) {
      throw new Error('Tree is empty');
    }

    let current = this.root;
    
    while (!current.isLeaf) {
      const childIndex = current.findChildIndex(key);
      current = current.children[childIndex];
    }

    return current;
  }

  private splitAndInsert(node: IndexedBTreeNode, entry: IndexedBTreeEntry): void {
    // Add entry to node temporarily
    node.keys.push(entry.key);
    node.entries.push(entry);
    
    // Sort by key
    const combined = node.keys.map((key, i) => ({ key, entry: node.entries[i] }));
    combined.sort((a, b) => a.key.localeCompare(b.key));
    
    node.keys = combined.map(item => item.key);
    node.entries = combined.map(item => item.entry);

    // Split the node
    const { leftNode, rightNode, middleKey } = node.split();
    
    // Save both nodes and propagate split up
    this.insertIntoParent(leftNode, rightNode, middleKey);
  }

  private insertIntoParent(leftNode: IndexedBTreeNode, rightNode: IndexedBTreeNode, middleKey: string): void {
    if (!leftNode.parent) {
      // Create new root
      const newRoot = new IndexedBTreeNode(false);
      newRoot.keys.push(middleKey);
      newRoot.children.push(leftNode, rightNode);
      
      leftNode.parent = newRoot;
      rightNode.parent = newRoot;
      this.root = newRoot;
    } else {
      // Insert into existing parent
      const parent = leftNode.parent;
      rightNode.parent = parent;
      
      if (parent.keys.length < IndexedBTreeNode.MAX_KEYS) {
        // Parent has space
        const insertIndex = parent.findChildIndex(middleKey);
        parent.keys.splice(insertIndex, 0, middleKey);
        parent.children.splice(insertIndex + 1, 0, rightNode);
      } else {
        // Parent is full, need to split it too
        this.splitInternalNodeAndInsert(parent, middleKey, rightNode);
      }
    }
  }

  private splitInternalNodeAndInsert(node: IndexedBTreeNode, newKey: string, newChild: IndexedBTreeNode): void {
    // Add the new key and child to the node temporarily
    const insertIndex = node.findChildIndex(newKey);
    node.keys.splice(insertIndex, 0, newKey);
    node.children.splice(insertIndex + 1, 0, newChild);

    // Split the internal node
    const { leftNode, rightNode, middleKey } = node.split();
    
    // Update parent pointers
    for (const child of rightNode.children) {
      child.parent = rightNode;
    }

    // Propagate split up the tree
    this.insertIntoParent(leftNode, rightNode, middleKey);
  }

  // Clear all entries
  clear(): void {
    this.root = null;
  }

  // Get statistics
  getStats(): {
    totalEntries: number;
    totalDocIds: number;
    height: number;
    leafCount: number;
  } {
    if (!this.root) {
      return { totalEntries: 0, totalDocIds: 0, height: 0, leafCount: 0 };
    }

    let totalEntries = 0;
    let totalDocIds = 0;
    let leafCount = 0;
    
    // Find leftmost leaf and traverse
    let current = this.root;
    while (!current.isLeaf) {
      current = current.children[0];
    }

    let height = 0;
    let temp: IndexedBTreeNode | null = this.root;
    while (temp) {
      height++;
      temp = temp.isLeaf ? null : temp.children[0];
    }

    while (current) {
      leafCount++;
      totalEntries += current.entries.length;
      for (const entry of current.entries) {
        totalDocIds += entry.docIds.size;
      }
      current = current.nextLeaf!;
    }

    return { totalEntries, totalDocIds, height, leafCount };
  }
}
/**
 * B-tree implementation for binary storage indexing
 * Provides fast lookups for document locations in the binary file
 */

// Cached encoder/decoder instances for performance optimization
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface BTreeEntry {
  key: string;     // Document ID
  offset: number;  // File offset where document starts
  length: number;  // Length of document data
}

export interface BTreeNodeHeader {
  isLeaf: boolean;
  keyCount: number;
  parentOffset: number;
  nextLeafOffset: number; // For leaf nodes, points to next leaf
}

export class BTreeNode {
  static readonly MAX_KEYS = 15; // B-tree order of 16
  static readonly MIN_KEYS = 7;  // Half of MAX_KEYS
  static readonly NODE_SIZE = 1024; // Fixed node size for mmap

  isLeaf: boolean;
  keys: string[] = [];
  entries: BTreeEntry[] = []; // For leaf nodes
  children: number[] = [];    // File offsets to child nodes
  parentOffset: number = -1;
  nextLeafOffset: number = -1;
  offset: number = -1; // This node's offset in file

  constructor(isLeaf: boolean = true) {
    this.isLeaf = isLeaf;
  }

  // Serialize node to binary format
  serialize(): Uint8Array {
    const buffer = new ArrayBuffer(BTreeNode.NODE_SIZE);
    const view = new DataView(buffer);
    let offset = 0;

    // Header
    view.setUint8(offset++, this.isLeaf ? 1 : 0);
    view.setUint16(offset, this.keys.length, false);
    offset += 2;
    view.setUint32(offset, this.parentOffset, false);
    offset += 4;
    view.setUint32(offset, this.nextLeafOffset, false);
    offset += 4;

    // Keys and entries/children
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      const keyBytes = textEncoder.encode(key);
      
      // Key length and key data
      view.setUint16(offset, keyBytes.length, false);
      offset += 2;
      new Uint8Array(buffer, offset, keyBytes.length).set(keyBytes);
      offset += keyBytes.length;

      if (this.isLeaf) {
        // Entry data
        const entry = this.entries[i];
        view.setUint32(offset, entry.offset, false);
        offset += 4;
        view.setUint32(offset, entry.length, false);
        offset += 4;
      } else {
        // Child offset
        view.setUint32(offset, this.children[i], false);
        offset += 4;
      }
    }

    // Last child for internal nodes
    if (!this.isLeaf && this.children.length > this.keys.length) {
      view.setUint32(offset, this.children[this.children.length - 1], false);
    }

    return new Uint8Array(buffer);
  }

  // Deserialize node from binary format
  static deserialize(data: Uint8Array, nodeOffset: number): BTreeNode {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    const isLeaf = view.getUint8(offset++) === 1;
    const keyCount = view.getUint16(offset, false);
    offset += 2;
    const parentOffset = view.getUint32(offset, false);
    offset += 4;
    const nextLeafOffset = view.getUint32(offset, false);
    offset += 4;

    const node = new BTreeNode(isLeaf);
    node.parentOffset = parentOffset === 0xffffffff ? -1 : parentOffset;
    node.nextLeafOffset = nextLeafOffset === 0xffffffff ? -1 : nextLeafOffset;
    node.offset = nodeOffset;

    // Read keys and entries/children
    for (let i = 0; i < keyCount; i++) {
      const keyLength = view.getUint16(offset, false);
      offset += 2;
      const keyBytes = data.slice(offset, offset + keyLength);
      const key = textDecoder.decode(keyBytes);
      offset += keyLength;

      node.keys.push(key);

      if (isLeaf) {
        const entryOffset = view.getUint32(offset, false);
        offset += 4;
        const entryLength = view.getUint32(offset, false);
        offset += 4;

        node.entries.push({
          key,
          offset: entryOffset,
          length: entryLength
        });
      } else {
        const childOffset = view.getUint32(offset, false);
        offset += 4;
        node.children.push(childOffset);
      }
    }

    // Last child for internal nodes
    if (!isLeaf) {
      const lastChild = view.getUint32(offset, false);
      if (lastChild !== 0) {
        node.children.push(lastChild);
      }
    }

    return node;
  }

  // Find entry in leaf node
  findEntry(key: string): BTreeEntry | null {
    if (!this.isLeaf) return null;
    
    const index = this.keys.indexOf(key);
    return index >= 0 ? this.entries[index] : null;
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
  insertEntry(entry: BTreeEntry): boolean {
    if (!this.isLeaf || this.keys.length >= BTreeNode.MAX_KEYS) {
      return false;
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

  // Split node when full
  split(): { leftNode: BTreeNode; rightNode: BTreeNode; middleKey: string } {
    const midIndex = Math.floor(this.keys.length / 2);
    const middleKey = this.keys[midIndex];

    const rightNode = new BTreeNode(this.isLeaf);
    
    if (this.isLeaf) {
      // For leaf nodes, middle key goes to right node
      rightNode.keys = this.keys.slice(midIndex);
      rightNode.entries = this.entries.slice(midIndex);
      rightNode.nextLeafOffset = this.nextLeafOffset;
      
      this.keys = this.keys.slice(0, midIndex);
      this.entries = this.entries.slice(0, midIndex);
      this.nextLeafOffset = -1; // Will be set when right node is written
    } else {
      // For internal nodes, middle key is promoted
      rightNode.keys = this.keys.slice(midIndex + 1);
      rightNode.children = this.children.slice(midIndex + 1);
      
      this.keys = this.keys.slice(0, midIndex);
      this.children = this.children.slice(0, midIndex + 1);
    }

    return { leftNode: this, rightNode, middleKey };
  }

  // Remove entry from leaf node
  removeEntry(key: string): boolean {
    if (!this.isLeaf) return false;

    const index = this.keys.indexOf(key);
    if (index < 0) return false;

    this.keys.splice(index, 1);
    this.entries.splice(index, 1);
    return true;
  }

  // Check if node needs rebalancing
  needsRebalancing(): boolean {
    return this.keys.length < BTreeNode.MIN_KEYS;
  }

  // Merge with sibling node
  mergeWith(sibling: BTreeNode, separatorKey?: string): void {
    if (this.isLeaf && sibling.isLeaf) {
      this.keys = this.keys.concat(sibling.keys);
      this.entries = this.entries.concat(sibling.entries);
      this.nextLeafOffset = sibling.nextLeafOffset;
    } else if (!this.isLeaf && !sibling.isLeaf && separatorKey) {
      this.keys.push(separatorKey);
      this.keys = this.keys.concat(sibling.keys);
      this.children = this.children.concat(sibling.children);
    }
  }
}

export class BTree {
  private rootOffset: number = -1;
  private nodeCache = new Map<number, BTreeNode>();
  private nodeCacheAccessOrder = new Map<number, number>(); // LRU tracking
  private cacheAccessCounter = 0;
  private readonly maxCacheSize = 1000; // Maximum nodes to cache
  private freeNodeOffsets: number[] = [];
  private nextNodeOffset: number = 32; // Start after header

  constructor(private readNode: (offset: number) => Uint8Array, 
              private writeNode: (offset: number, data: Uint8Array) => void) {}

  // Set root offset (called when loading from file)
  setRootOffset(offset: number): void {
    this.rootOffset = offset;
  }

  getRootOffset(): number {
    return this.rootOffset;
  }

  // Find entry by key
  find(key: string): BTreeEntry | null {
    if (this.rootOffset === -1) return null;

    let currentOffset = this.rootOffset;
    
    while (currentOffset !== -1) {
      const node = this.loadNode(currentOffset);
      
      if (node.isLeaf) {
        return node.findEntry(key);
      } else {
        const childIndex = node.findChildIndex(key);
        currentOffset = node.children[childIndex] || -1;
      }
    }

    return null;
  }

  // Insert entry
  insert(entry: BTreeEntry): void {
    if (this.rootOffset === -1) {
      // Create root node
      const root = new BTreeNode(true);
      root.insertEntry(entry);
      this.rootOffset = this.allocateNodeOffset();
      root.offset = this.rootOffset;
      this.saveNode(root);
      return;
    }

    const { node: targetLeaf } = this.findLeafNode(entry.key);
    
    if (targetLeaf.insertEntry(entry)) {
      this.saveNode(targetLeaf);
    } else {
      // Node is full, need to split
      this.splitAndInsert(targetLeaf, entry);
    }
  }

  // Remove entry
  remove(key: string): boolean {
    if (this.rootOffset === -1) return false;

    const { node: targetLeaf } = this.findLeafNode(key);
    
    if (!targetLeaf.removeEntry(key)) {
      return false;
    }

    this.saveNode(targetLeaf);

    // Handle underflow if necessary
    if (targetLeaf.needsRebalancing() && targetLeaf.offset !== this.rootOffset) {
      this.rebalanceNode(targetLeaf);
    }

    return true;
  }

  // Get all entries (for full table scans)
  getAllEntries(): BTreeEntry[] {
    if (this.rootOffset === -1) return [];

    // Find leftmost leaf
    let currentOffset = this.rootOffset;
    let node = this.loadNode(currentOffset);
    
    while (!node.isLeaf) {
      currentOffset = node.children[0];
      node = this.loadNode(currentOffset);
    }

    // Traverse all leaf nodes
    const entries: BTreeEntry[] = [];
    while (node) {
      entries.push(...node.entries);
      
      if (node.nextLeafOffset === -1) break;
      node = this.loadNode(node.nextLeafOffset);
    }

    return entries;
  }

  private findLeafNode(key: string): { node: BTreeNode; path: number[] } {
    const path: number[] = [];
    let currentOffset = this.rootOffset;
    
    while (currentOffset !== -1) {
      path.push(currentOffset);
      const node = this.loadNode(currentOffset);
      
      if (node.isLeaf) {
        return { node, path };
      } else {
        const childIndex = node.findChildIndex(key);
        currentOffset = node.children[childIndex] || -1;
      }
    }

    throw new Error('Failed to find leaf node');
  }

  private splitAndInsert(node: BTreeNode, entry: BTreeEntry): void {
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
    
    // Allocate offset for right node
    rightNode.offset = this.allocateNodeOffset();
    
    // Update next leaf pointers
    if (leftNode.isLeaf) {
      leftNode.nextLeafOffset = rightNode.offset;
    }

    // Save both nodes
    this.saveNode(leftNode);
    this.saveNode(rightNode);

    // Propagate split up the tree
    this.insertIntoParent(leftNode, rightNode, middleKey);
  }

  private splitInternalNodeAndInsert(node: BTreeNode, newKey: string, newChildOffset: number): void {
    // Add the new key and child to the node temporarily
    const insertIndex = node.findChildIndex(newKey);
    node.keys.splice(insertIndex, 0, newKey);
    node.children.splice(insertIndex + 1, 0, newChildOffset);

    // Split the internal node
    const { leftNode, rightNode, middleKey } = node.split();
    
    // Allocate offset for right node
    rightNode.offset = this.allocateNodeOffset();
    rightNode.parentOffset = leftNode.parentOffset;

    // Update parent pointers for all children in both nodes
    this.updateChildrenParents(leftNode);
    this.updateChildrenParents(rightNode);

    // Save both nodes
    this.saveNode(leftNode);
    this.saveNode(rightNode);

    // Propagate split up the tree
    this.insertIntoParent(leftNode, rightNode, middleKey);
  }

  private updateChildrenParents(node: BTreeNode): void {
    if (!node.isLeaf) {
      for (const childOffset of node.children) {
        const child = this.loadNode(childOffset);
        child.parentOffset = node.offset;
        this.saveNode(child);
      }
    }
  }

  private insertIntoParent(leftNode: BTreeNode, rightNode: BTreeNode, middleKey: string): void {
    if (leftNode.parentOffset === -1) {
      // Create new root
      const newRoot = new BTreeNode(false);
      newRoot.keys.push(middleKey);
      newRoot.children.push(leftNode.offset, rightNode.offset);
      
      const rootOffset = this.allocateNodeOffset();
      newRoot.offset = rootOffset;
      this.rootOffset = rootOffset;
      
      leftNode.parentOffset = rootOffset;
      rightNode.parentOffset = rootOffset;
      
      this.saveNode(newRoot);
      this.saveNode(leftNode);
      this.saveNode(rightNode);
    } else {
      // Insert into existing parent
      const parent = this.loadNode(leftNode.parentOffset);
      rightNode.parentOffset = parent.offset;
      
      if (parent.keys.length < BTreeNode.MAX_KEYS) {
        // Parent has space
        const insertIndex = parent.findChildIndex(middleKey);
        parent.keys.splice(insertIndex, 0, middleKey);
        parent.children.splice(insertIndex + 1, 0, rightNode.offset);
        
        this.saveNode(parent);
        this.saveNode(rightNode);
      } else {
        // Parent is full, need to split it too
        this.splitInternalNodeAndInsert(parent, middleKey, rightNode.offset);
        this.saveNode(rightNode);
      }
    }
  }

  private rebalanceNode(node: BTreeNode): void {
    const parent = this.loadNode(node.parentOffset);
    const nodeIndex = parent.children.indexOf(node.offset);
    
    // Try to borrow from left sibling
    if (nodeIndex > 0) {
      const leftSiblingOffset = parent.children[nodeIndex - 1];
      const leftSibling = this.loadNode(leftSiblingOffset);
      
      if (leftSibling.keys.length > BTreeNode.MIN_KEYS) {
        this.borrowFromLeftSibling(node, leftSibling, parent, nodeIndex - 1);
        return;
      }
    }
    
    // Try to borrow from right sibling
    if (nodeIndex < parent.children.length - 1) {
      const rightSiblingOffset = parent.children[nodeIndex + 1];
      const rightSibling = this.loadNode(rightSiblingOffset);
      
      if (rightSibling.keys.length > BTreeNode.MIN_KEYS) {
        this.borrowFromRightSibling(node, rightSibling, parent, nodeIndex);
        return;
      }
    }
    
    // Merge with sibling
    if (nodeIndex > 0) {
      // Merge with left sibling
      const leftSiblingOffset = parent.children[nodeIndex - 1];
      const leftSibling = this.loadNode(leftSiblingOffset);
      this.mergeNodes(leftSibling, node, parent, nodeIndex - 1);
    } else if (nodeIndex < parent.children.length - 1) {
      // Merge with right sibling
      const rightSiblingOffset = parent.children[nodeIndex + 1];
      const rightSibling = this.loadNode(rightSiblingOffset);
      this.mergeNodes(node, rightSibling, parent, nodeIndex);
    }
  }

  private borrowFromLeftSibling(node: BTreeNode, leftSibling: BTreeNode, parent: BTreeNode, separatorIndex: number): void {
    if (node.isLeaf && leftSibling.isLeaf) {
      // Move last key/entry from left sibling to beginning of node
      const lastKey = leftSibling.keys.pop()!;
      const lastEntry = leftSibling.entries.pop()!;
      
      node.keys.unshift(lastKey);
      node.entries.unshift(lastEntry);
      
      // Update parent separator
      parent.keys[separatorIndex] = lastKey;
    } else if (!node.isLeaf && !leftSibling.isLeaf) {
      // Move separator down and last key from left sibling up
      const separatorKey = parent.keys[separatorIndex];
      const lastKey = leftSibling.keys.pop()!;
      const lastChild = leftSibling.children.pop()!;
      
      node.keys.unshift(separatorKey);
      node.children.unshift(lastChild);
      
      // Update parent separator
      parent.keys[separatorIndex] = lastKey;
      
      // Update child parent pointer
      const child = this.loadNode(lastChild);
      child.parentOffset = node.offset;
      this.saveNode(child);
    }
    
    this.saveNode(leftSibling);
    this.saveNode(node);
    this.saveNode(parent);
  }

  private borrowFromRightSibling(node: BTreeNode, rightSibling: BTreeNode, parent: BTreeNode, separatorIndex: number): void {
    if (node.isLeaf && rightSibling.isLeaf) {
      // Move first key/entry from right sibling to end of node
      const firstKey = rightSibling.keys.shift()!;
      const firstEntry = rightSibling.entries.shift()!;
      
      node.keys.push(firstKey);
      node.entries.push(firstEntry);
      
      // Update parent separator
      parent.keys[separatorIndex] = rightSibling.keys[0] || firstKey;
    } else if (!node.isLeaf && !rightSibling.isLeaf) {
      // Move separator down and first key from right sibling up
      const separatorKey = parent.keys[separatorIndex];
      const firstKey = rightSibling.keys.shift()!;
      const firstChild = rightSibling.children.shift()!;
      
      node.keys.push(separatorKey);
      node.children.push(firstChild);
      
      // Update parent separator
      parent.keys[separatorIndex] = firstKey;
      
      // Update child parent pointer
      const child = this.loadNode(firstChild);
      child.parentOffset = node.offset;
      this.saveNode(child);
    }
    
    this.saveNode(rightSibling);
    this.saveNode(node);
    this.saveNode(parent);
  }

  private mergeNodes(leftNode: BTreeNode, rightNode: BTreeNode, parent: BTreeNode, separatorIndex: number): void {
    if (leftNode.isLeaf && rightNode.isLeaf) {
      // Merge leaf nodes
      leftNode.keys = leftNode.keys.concat(rightNode.keys);
      leftNode.entries = leftNode.entries.concat(rightNode.entries);
      leftNode.nextLeafOffset = rightNode.nextLeafOffset;
    } else if (!leftNode.isLeaf && !rightNode.isLeaf) {
      // Merge internal nodes with separator
      const separatorKey = parent.keys[separatorIndex];
      leftNode.keys.push(separatorKey);
      leftNode.keys = leftNode.keys.concat(rightNode.keys);
      leftNode.children = leftNode.children.concat(rightNode.children);
      
      // Update children parent pointers
      for (const childOffset of rightNode.children) {
        const child = this.loadNode(childOffset);
        child.parentOffset = leftNode.offset;
        this.saveNode(child);
      }
    }
    
    // Remove separator and right child from parent
    parent.keys.splice(separatorIndex, 1);
    parent.children.splice(separatorIndex + 1, 1);
    
    // Mark right node as free
    this.freeNodeOffsets.push(rightNode.offset);
    this.nodeCache.delete(rightNode.offset);
    this.nodeCacheAccessOrder.delete(rightNode.offset);
    
    this.saveNode(leftNode);
    this.saveNode(parent);
    
    // Check if parent needs rebalancing
    if (parent.needsRebalancing() && parent.offset !== this.rootOffset) {
      this.rebalanceNode(parent);
    } else if (parent.keys.length === 0 && parent.offset === this.rootOffset) {
      // Root is empty, make left child the new root
      this.rootOffset = leftNode.offset;
      leftNode.parentOffset = -1;
      this.saveNode(leftNode);
      this.freeNodeOffsets.push(parent.offset);
      this.nodeCache.delete(parent.offset);
      this.nodeCacheAccessOrder.delete(parent.offset);
    }
  }

  private loadNode(offset: number): BTreeNode {
    if (this.nodeCache.has(offset)) {
      // Update access time for LRU
      this.nodeCacheAccessOrder.set(offset, ++this.cacheAccessCounter);
      return this.nodeCache.get(offset)!;
    }

    const data = this.readNode(offset);
    const node = BTreeNode.deserialize(data, offset);
    
    // Check cache size and evict if necessary
    this.evictCacheIfNeeded();
    
    this.nodeCache.set(offset, node);
    this.nodeCacheAccessOrder.set(offset, ++this.cacheAccessCounter);
    
    return node;
  }

  private saveNode(node: BTreeNode): void {
    const data = node.serialize();
    this.writeNode(node.offset, data);
    
    // Check cache size and evict if necessary
    this.evictCacheIfNeeded();
    
    this.nodeCache.set(node.offset, node);
    this.nodeCacheAccessOrder.set(node.offset, ++this.cacheAccessCounter);
  }

  private allocateNodeOffset(): number {
    // Clean up free node offsets periodically
    if (this.freeNodeOffsets.length > 1000) {
      this.cleanupFreeNodeOffsets();
    }
    
    if (this.freeNodeOffsets.length > 0) {
      return this.freeNodeOffsets.pop()!;
    }
    
    const offset = this.nextNodeOffset;
    this.nextNodeOffset += BTreeNode.NODE_SIZE;
    return offset;
  }

  // Get cache statistics for monitoring
  getCacheStats(): {
    cacheSize: number;
    maxCacheSize: number;
    freeNodeOffsetsCount: number;
    cacheHitRatio?: number;
  } {
    return {
      cacheSize: this.nodeCache.size,
      maxCacheSize: this.maxCacheSize,
      freeNodeOffsetsCount: this.freeNodeOffsets.length
    };
  }

  // Update next node offset when loading from existing file
  setNextNodeOffset(offset: number): void {
    this.nextNodeOffset = offset;
  }

  // Get next node offset for compaction
  getNextNodeOffset(): number {
    return this.nextNodeOffset;
  }

  // Clear node cache (useful after compaction when offsets change)
  clearCache(): void {
    this.nodeCache.clear();
    this.nodeCacheAccessOrder.clear();
    this.cacheAccessCounter = 0;
  }

  // Evict least recently used nodes if cache is too large
  private evictCacheIfNeeded(): void {
    // Evict multiple nodes to maintain cache size well below limit
    const targetSize = Math.floor(this.maxCacheSize * 0.8); // 80% of max size
    
    while (this.nodeCache.size >= targetSize) {
      // Find least recently used node
      let lruOffset = -1;
      let lruAccessTime = Infinity;
      
      for (const [offset, accessTime] of this.nodeCacheAccessOrder) {
        if (accessTime < lruAccessTime) {
          lruAccessTime = accessTime;
          lruOffset = offset;
        }
      }

      if (lruOffset !== -1) {
        this.nodeCache.delete(lruOffset);
        this.nodeCacheAccessOrder.delete(lruOffset);
      } else {
        // Safety break if no LRU node found
        break;
      }
    }
  }

  // Cleanup free node offsets list to prevent unbounded growth
  private cleanupFreeNodeOffsets(): void {
    // Keep only the most recent free nodes to avoid memory bloat
    const maxFreeNodes = 1000;
    if (this.freeNodeOffsets.length > maxFreeNodes) {
      this.freeNodeOffsets = this.freeNodeOffsets.slice(-maxFreeNodes);
    }
  }
}
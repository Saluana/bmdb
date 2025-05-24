/**
 * B-tree implementation for binary storage indexing
 * Provides fast lookups for document locations in the binary file
 */

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
      const keyBytes = new TextEncoder().encode(key);
      
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
      const key = new TextDecoder().decode(keyBytes);
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
    while (i < this.keys.length && key > this.keys[i]) {
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
    while (i < this.keys.length && entry.key > this.keys[i]) {
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
        // This would require more complex logic for internal node splitting
        throw new Error('Parent node splitting not implemented');
      }
    }
  }

  private rebalanceNode(node: BTreeNode): void {
    // Simplified rebalancing - in a full implementation, this would
    // involve borrowing from siblings or merging nodes
    console.warn('Node rebalancing not fully implemented');
  }

  private loadNode(offset: number): BTreeNode {
    if (this.nodeCache.has(offset)) {
      return this.nodeCache.get(offset)!;
    }

    const data = this.readNode(offset);
    const node = BTreeNode.deserialize(data, offset);
    this.nodeCache.set(offset, node);
    
    return node;
  }

  private saveNode(node: BTreeNode): void {
    const data = node.serialize();
    this.writeNode(node.offset, data);
    this.nodeCache.set(node.offset, node);
  }

  private allocateNodeOffset(): number {
    if (this.freeNodeOffsets.length > 0) {
      return this.freeNodeOffsets.pop()!;
    }
    
    const offset = this.nextNodeOffset;
    this.nextNodeOffset += BTreeNode.NODE_SIZE;
    return offset;
  }

  // Update next node offset when loading from existing file
  setNextNodeOffset(offset: number): void {
    this.nextNodeOffset = offset;
  }
}
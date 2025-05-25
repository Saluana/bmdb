/**
 * B-tree implementation for binary storage indexing
 * Provides fast lookups for document locations in the binary file
 */

// Cached encoder/decoder instances for performance optimization
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface BTreeEntry {
    key: string; // Document ID
    offset: number; // File offset where document starts
    length: number; // Length of document data
}

export interface BTreeNodeHeader {
    isLeaf: boolean;
    keyCount: number;
    parentOffset: number;
    nextLeafOffset: number; // For leaf nodes, points to next leaf
}

export class BTreeNode {
    static readonly MAX_KEYS = 15; // B-tree order of 16
    static readonly MIN_KEYS = 7; // Half of MAX_KEYS
    static readonly NODE_SIZE = 1024; // Fixed node size for mmap

    isLeaf: boolean;
    keys: string[] = [];
    entries: BTreeEntry[] = []; // For leaf nodes
    children: number[] = []; // File offsets to child nodes
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
        view.setUint32(
            offset,
            this.parentOffset === -1 ? 0xffffffff : this.parentOffset,
            false
        );
        offset += 4;
        view.setUint32(
            offset,
            this.nextLeafOffset === -1 ? 0xffffffff : this.nextLeafOffset,
            false
        );
        offset += 4;

        // Keys and entries/children
        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i];
            const keyBytes = textEncoder.encode(key);

            // Check bounds before writing
            const requiredSpace = 2 + keyBytes.length + (this.isLeaf ? 8 : 4);
            if (offset + requiredSpace > BTreeNode.NODE_SIZE) {
                throw new Error(
                    `Node serialization would exceed NODE_SIZE: required ${
                        offset + requiredSpace
                    }, max ${BTreeNode.NODE_SIZE}`
                );
            }

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
                const childOffset =
                    this.children[i] === -1 ? 0xffffffff : this.children[i];
                view.setUint32(offset, childOffset, false);
                offset += 4;
            }
        }

        // Last child for internal nodes (ensure B-tree invariant)
        if (!this.isLeaf) {
            // Validate B-tree invariant before serialization
            if (this.children.length !== this.keys.length + 1) {
                throw new Error(
                    `B-tree invariant violation during serialization: internal node has ${
                        this.children.length
                    } children but ${this.keys.length} keys (expected ${
                        this.keys.length + 1
                    } children)`
                );
            }

            if (this.children.length > this.keys.length) {
                if (offset + 4 > BTreeNode.NODE_SIZE) {
                    throw new Error(
                        `Node serialization would exceed NODE_SIZE for last child: required ${
                            offset + 4
                        }, max ${BTreeNode.NODE_SIZE}`
                    );
                }
                const lastChildOffset =
                    this.children[this.children.length - 1] === -1
                        ? 0xffffffff
                        : this.children[this.children.length - 1];
                view.setUint32(offset, lastChildOffset, false);
            }
        }

        return new Uint8Array(buffer);
    }

    // Deserialize node from binary format
    static deserialize(data: Uint8Array, nodeOffset: number): BTreeNode {
        const view = new DataView(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );
        let offset = 0;

        // Check minimum header size
        if (data.length < 11) {
            throw new Error(
                `Node data too small: ${data.length} bytes, expected at least 11`
            );
        }

        const isLeaf = view.getUint8(offset++) === 1;
        const keyCount = view.getUint16(offset, false);
        offset += 2;
        const parentOffset = view.getUint32(offset, false);
        offset += 4;
        const nextLeafOffset = view.getUint32(offset, false);
        offset += 4;

        // Validate keyCount
        if (keyCount < 0 || keyCount > BTreeNode.MAX_KEYS) {
            throw new Error(
                `Invalid keyCount: ${keyCount}, max allowed: ${BTreeNode.MAX_KEYS}`
            );
        }

        const node = new BTreeNode(isLeaf);
        node.parentOffset = parentOffset === 0xffffffff ? -1 : parentOffset;
        node.nextLeafOffset =
            nextLeafOffset === 0xffffffff ? -1 : nextLeafOffset;
        node.offset = nodeOffset;

        // Read keys and entries/children
        for (let i = 0; i < keyCount; i++) {
            // Check bounds for key length
            if (offset + 2 > data.length) {
                throw new Error(
                    `Out of bounds reading key length at offset ${offset}, data length: ${data.length}`
                );
            }

            const keyLength = view.getUint16(offset, false);
            offset += 2;

            // Validate key length
            if (keyLength < 0 || keyLength > 1000) {
                throw new Error(`Invalid key length: ${keyLength}`);
            }

            // Check bounds for key data
            if (offset + keyLength > data.length) {
                throw new Error(
                    `Out of bounds reading key data at offset ${offset}, key length: ${keyLength}, data length: ${data.length}`
                );
            }

            const keyBytes = data.slice(offset, offset + keyLength);
            const key = textDecoder.decode(keyBytes);
            offset += keyLength;

            node.keys.push(key);

            if (isLeaf) {
                // Check bounds for entry data
                if (offset + 8 > data.length) {
                    throw new Error(
                        `Out of bounds reading entry data at offset ${offset}, data length: ${data.length}`
                    );
                }

                const entryOffset = view.getUint32(offset, false);
                offset += 4;
                const entryLength = view.getUint32(offset, false);
                offset += 4;

                node.entries.push({
                    key,
                    offset: entryOffset,
                    length: entryLength,
                });
            } else {
                // Check bounds for child offset
                if (offset + 4 > data.length) {
                    throw new Error(
                        `Out of bounds reading child offset at offset ${offset}, data length: ${data.length}`
                    );
                }

                const rawChildOffset = view.getUint32(offset, false);
                offset += 4;
                node.children.push(
                    rawChildOffset === 0xffffffff ? -1 : rawChildOffset
                );
            }
        }

        // Last child for internal nodes (ensure proper B-tree invariant)
        if (!isLeaf) {
            // For internal nodes, we need exactly keyCount + 1 children
            if (
                node.children.length === keyCount &&
                offset + 4 <= data.length
            ) {
                const rawLastChild = view.getUint32(offset, false);
                if (rawLastChild !== 0) {
                    node.children.push(
                        rawLastChild === 0xffffffff ? -1 : rawLastChild
                    );
                }
            }

            // Ensure B-tree invariant: internal nodes must have keyCount + 1 children
            if (node.children.length !== node.keys.length + 1) {
                throw new Error(
                    `B-tree invariant violation during deserialization: internal node at offset ${nodeOffset} has ${
                        node.children.length
                    } children but ${node.keys.length} keys (expected ${
                        node.keys.length + 1
                    } children)`
                );
            }
        } else {
            // For leaf nodes, ensure we have matching keys and entries
            if (node.entries.length !== node.keys.length) {
                throw new Error(
                    `B-tree invariant violation during deserialization: leaf node at offset ${nodeOffset} has ${node.entries.length} entries but ${node.keys.length} keys`
                );
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
        while (
            i < this.keys.length &&
            entry.key.localeCompare(this.keys[i]) > 0
        ) {
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

            // Ensure children arrays are correct length
            while (this.children.length < this.keys.length + 1)
                this.children.push(-1);
            while (rightNode.children.length < rightNode.keys.length + 1)
                rightNode.children.push(-1);
        }

        assertInternalNodeChildren(this, 'split-left');
        assertInternalNodeChildren(rightNode, 'split-right');

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
            // Ensure children array is correct length after merge
            while (this.children.length < this.keys.length + 1)
                this.children.push(-1);
            while (this.children.length > this.keys.length + 1)
                this.children.pop();
            assertInternalNodeChildren(this, 'mergeWith');
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

    constructor(
        private readNode: (offset: number) => Uint8Array,
        private writeNode: (offset: number, data: Uint8Array) => void
    ) {}

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

    // Bulk insert for better performance
    bulkInsert(entries: BTreeEntry[]): void {
        if (entries.length === 0) return;

        // Sort entries by key for optimal B-tree construction
        const sortedEntries = [...entries].sort((a, b) =>
            a.key.localeCompare(b.key)
        );

        if (this.rootOffset === -1) {
            // Build tree from scratch using bulk loading algorithm
            this.bulkLoad(sortedEntries);
        } else {
            // For large existing trees, clear and rebuild to avoid corruption
            if (sortedEntries.length > 1000) {
                this.clearCache();
                this.rootOffset = -1;
                this.bulkLoad(sortedEntries);
            } else {
                // Insert entries one by one for smaller batches
                for (const entry of sortedEntries) {
                    this.insert(entry);
                }
            }
        }
    }

    // Bulk load algorithm for creating optimal B-tree from sorted data
    private bulkLoad(sortedEntries: BTreeEntry[]): void {
        if (sortedEntries.length === 0) return;

        // Reset the tree state for clean rebuild
        this.clearCache();
        this.freeNodeOffsets = [];

        // For single entry, create simple leaf node
        if (sortedEntries.length === 1) {
            const root = new BTreeNode(true);
            root.insertEntry(sortedEntries[0]);
            this.rootOffset = this.allocateNodeOffset();
            root.offset = this.rootOffset;
            this.saveNode(root);
            return;
        }

        // Build leaf nodes first with optimal fill factor
        const leafNodes: BTreeNode[] = [];
        let currentLeaf = new BTreeNode(true);
        leafNodes.push(currentLeaf);

        // Use a fill factor of 70% to avoid immediate splits
        const leafFillFactor = Math.floor(BTreeNode.MAX_KEYS * 0.7);

        for (let i = 0; i < sortedEntries.length; i++) {
            if (
                currentLeaf.keys.length >= leafFillFactor &&
                i < sortedEntries.length - 1
            ) {
                // Current leaf is sufficiently full, create new one
                const newLeaf = new BTreeNode(true);
                leafNodes.push(newLeaf);
                currentLeaf = newLeaf;
            }
            currentLeaf.insertEntry(sortedEntries[i]);
        }

        // First assign offsets to all leaf nodes
        for (let i = 0; i < leafNodes.length; i++) {
            leafNodes[i].offset = this.allocateNodeOffset();
        }

        // Then set up the nextLeafOffset links and save
        for (let i = 0; i < leafNodes.length; i++) {
            if (i < leafNodes.length - 1) {
                leafNodes[i].nextLeafOffset = leafNodes[i + 1].offset;
            } else {
                leafNodes[i].nextLeafOffset = -1;
            }
            this.saveNode(leafNodes[i]);
        }

        // Build internal nodes bottom-up
        let currentLevel: BTreeNode[] = leafNodes;

        while (currentLevel.length > 1) {
            const nextLevel: BTreeNode[] = [];
            let currentInternal = new BTreeNode(false);
            nextLevel.push(currentInternal);

            // Use a fill factor for internal nodes too
            const internalFillFactor = Math.floor(BTreeNode.MAX_KEYS * 0.7);

            for (let i = 0; i < currentLevel.length; i++) {
                const child = currentLevel[i];

                if (
                    currentInternal.children.length > internalFillFactor &&
                    i < currentLevel.length - 1
                ) {
                    // Current internal node is sufficiently full, create new one
                    const newInternal = new BTreeNode(false);
                    nextLevel.push(newInternal);
                    currentInternal = newInternal;
                }

                // Add child to current internal node
                if (currentInternal.children.length > 0) {
                    // Add separator key (first key of child)
                    currentInternal.keys.push(child.keys[0]);
                }
                currentInternal.children.push(child.offset);
            }

            // Assign offsets and save internal nodes
            for (const internal of nextLevel) {
                internal.offset = this.allocateNodeOffset();

                // Validate internal node structure before saving
                if (internal.children.length !== internal.keys.length + 1) {
                    throw new Error(
                        `Internal node invariant violation during bulkLoad: children.length (${
                            internal.children.length
                        }) != keys.length + 1 (${internal.keys.length + 1})`
                    );
                }

                // Update children's parent pointers
                for (const childOffset of internal.children) {
                    if (childOffset !== -1) {
                        const child = this.loadNode(childOffset);
                        child.parentOffset = internal.offset;
                        this.saveNode(child);
                    }
                }

                this.saveNode(internal);
            }

            currentLevel = nextLevel;
        }

        // Set root
        if (currentLevel.length > 0) {
            this.rootOffset = currentLevel[0].offset;
            currentLevel[0].parentOffset = -1;
            this.saveNode(currentLevel[0]);
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
        if (
            targetLeaf.needsRebalancing() &&
            targetLeaf.offset !== this.rootOffset
        ) {
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

            if (node.nextLeafOffset === -1) {
                break;
            }
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
            if (!node.isLeaf) {
                assertInternalNodeChildren(node, 'findLeafNode');
                // Log if -1 is found in the middle of children array
                for (let i = 0; i < node.children.length - 1; i++) {
                    if (node.children[i] === -1) {
                        console.error(
                            '[BTree.findLeafNode] -1 found in middle of children array',
                            {
                                node,
                                key,
                                path,
                            }
                        );
                    }
                }
            }
            if (node.isLeaf) {
                return { node, path };
            } else {
                const childIndex = node.findChildIndex(key);
                if (childIndex < 0 || childIndex >= node.children.length) {
                    console.error('[BTree.findLeafNode] Invalid childIndex:', {
                        childIndex,
                        node,
                        key,
                        path,
                    });
                }
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
        const combined = node.keys.map((key, i) => ({
            key,
            entry: node.entries[i],
        }));
        combined.sort((a, b) => a.key.localeCompare(b.key));

        node.keys = combined.map((item) => item.key);
        node.entries = combined.map((item) => item.entry);

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

    private splitInternalNodeAndInsert(
        node: BTreeNode,
        newKey: string,
        newChildOffset: number
    ): void {
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

        assertInternalNodeChildren(leftNode, 'splitInternalNodeAndInsert-left');
        assertInternalNodeChildren(
            rightNode,
            'splitInternalNodeAndInsert-right'
        );
    }

    private updateChildrenParents(node: BTreeNode): void {
        if (!node.isLeaf) {
            for (const childOffset of node.children) {
                if (childOffset === -1) {
                    continue;
                }
                const child = this.loadNode(childOffset);
                child.parentOffset = node.offset;
                this.saveNode(child);
            }
        }
    }

    private insertIntoParent(
        leftNode: BTreeNode,
        rightNode: BTreeNode,
        middleKey: string
    ): void {
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
                this.splitInternalNodeAndInsert(
                    parent,
                    middleKey,
                    rightNode.offset
                );
                this.saveNode(rightNode);
            }
        }

        if (!leftNode.isLeaf) {
            assertInternalNodeChildren(leftNode, 'insertIntoParent-left');
        }
        if (!rightNode.isLeaf) {
            assertInternalNodeChildren(rightNode, 'insertIntoParent-right');
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
                this.borrowFromLeftSibling(
                    node,
                    leftSibling,
                    parent,
                    nodeIndex - 1
                );
                return;
            }
        }

        // Try to borrow from right sibling
        if (nodeIndex < parent.children.length - 1) {
            const rightSiblingOffset = parent.children[nodeIndex + 1];
            const rightSibling = this.loadNode(rightSiblingOffset);

            if (rightSibling.keys.length > BTreeNode.MIN_KEYS) {
                this.borrowFromRightSibling(
                    node,
                    rightSibling,
                    parent,
                    nodeIndex
                );
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

    private borrowFromLeftSibling(
        node: BTreeNode,
        leftSibling: BTreeNode,
        parent: BTreeNode,
        separatorIndex: number
    ): void {
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

        // After borrow, log state for debugging
        console.error('[BTree.borrowFromLeftSibling] After borrow:', {
            node: {
                keys: node.keys,
                children: node.children,
                offset: node.offset,
            },
            leftSibling: {
                keys: leftSibling.keys,
                children: leftSibling.children,
                offset: leftSibling.offset,
            },
            parent: {
                keys: parent.keys,
                children: parent.children,
                offset: parent.offset,
            },
        });
        assertInternalNodeChildren(node, 'borrowFromLeftSibling-node');
        assertInternalNodeChildren(
            leftSibling,
            'borrowFromLeftSibling-leftSibling'
        );
    }

    private borrowFromRightSibling(
        node: BTreeNode,
        rightSibling: BTreeNode,
        parent: BTreeNode,
        separatorIndex: number
    ): void {
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

        // After borrow, log state for debugging
        console.error('[BTree.borrowFromRightSibling] After borrow:', {
            node: {
                keys: node.keys,
                children: node.children,
                offset: node.offset,
            },
            rightSibling: {
                keys: rightSibling.keys,
                children: rightSibling.children,
                offset: rightSibling.offset,
            },
            parent: {
                keys: parent.keys,
                children: parent.children,
                offset: parent.offset,
            },
        });
        assertInternalNodeChildren(node, 'borrowFromRightSibling-node');
        assertInternalNodeChildren(
            rightSibling,
            'borrowFromRightSibling-rightSibling'
        );
    }

    private mergeNodes(
        leftNode: BTreeNode,
        rightNode: BTreeNode,
        parent: BTreeNode,
        separatorIndex: number
    ): void {
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
            // Ensure children array is correct length after merge
            while (leftNode.children.length < leftNode.keys.length + 1)
                leftNode.children.push(-1);
            while (leftNode.children.length > leftNode.keys.length + 1)
                leftNode.children.pop();
            // Update children parent pointers
            for (const childOffset of rightNode.children) {
                if (childOffset === -1) continue;
                const child = this.loadNode(childOffset);
                child.parentOffset = leftNode.offset;
                this.saveNode(child);
            }
            assertInternalNodeChildren(leftNode, 'mergeNodes');
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
        } else if (
            parent.keys.length === 0 &&
            parent.offset === this.rootOffset
        ) {
            // Root is empty, make left child the new root
            this.rootOffset = leftNode.offset;
            leftNode.parentOffset = -1;
            this.saveNode(leftNode);
            this.freeNodeOffsets.push(parent.offset);
            this.nodeCache.delete(parent.offset);
            this.nodeCacheAccessOrder.delete(parent.offset);
        }

        if (!leftNode.isLeaf && !rightNode.isLeaf) {
            // After merge, log state for debugging
            console.error('[BTree.mergeNodes] After merge:', {
                leftNode: {
                    keys: leftNode.keys,
                    children: leftNode.children,
                    offset: leftNode.offset,
                },
                rightNode: {
                    keys: rightNode.keys,
                    children: rightNode.children,
                    offset: rightNode.offset,
                },
                parent: {
                    keys: parent.keys,
                    children: parent.children,
                    offset: parent.offset,
                },
            });
            assertInternalNodeChildren(leftNode, 'mergeNodes-leftNode');
            assertInternalNodeChildren(rightNode, 'mergeNodes-rightNode');
        }
    }

    private loadNode(offset: number): BTreeNode {
        if (this.nodeCache.has(offset)) {
            // Update access time for LRU
            this.nodeCacheAccessOrder.set(offset, ++this.cacheAccessCounter);
            return this.nodeCache.get(offset)!;
        }

        // Validate offset before attempting to read
        if (offset < this.nextNodeOffset && offset >= 32) {
            // Check if offset is aligned to NODE_SIZE
            if (offset % BTreeNode.NODE_SIZE !== 0) {
                throw new Error(
                    `Node offset ${offset} is not aligned to ${BTreeNode.NODE_SIZE} bytes`
                );
            }
            try {
                const data = this.readNode(offset);
                const node = BTreeNode.deserialize(data, offset);

                // Additional validation is now handled in deserialize method

                // Check cache size and evict if necessary
                this.evictCacheIfNeeded();

                this.nodeCache.set(offset, node);
                this.nodeCacheAccessOrder.set(
                    offset,
                    ++this.cacheAccessCounter
                );

                return node;
            } catch (error) {
                // Log detailed error for debugging
                console.error(
                    `[BTree.loadNode] Failed to load node at offset ${offset}:`,
                    {
                        offset,
                        nextNodeOffset: this.nextNodeOffset,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                );
                throw new Error(
                    `Failed to load node at offset ${offset}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        } else {
            throw new Error(
                `Invalid node offset: ${offset}, valid range: [32, ${this.nextNodeOffset}], must be aligned to ${BTreeNode.NODE_SIZE} bytes`
            );
        }
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
            const offset = this.freeNodeOffsets.pop()!;
            // Ensure the offset is properly aligned
            if (offset % BTreeNode.NODE_SIZE !== 0) {
                console.warn(
                    `Skipping misaligned free offset ${offset}, expected alignment to ${BTreeNode.NODE_SIZE}`
                );
                return this.allocateNodeOffset(); // Recursively try next offset
            }
            return offset;
        }

        // Ensure nextNodeOffset is properly aligned
        const remainder = this.nextNodeOffset % BTreeNode.NODE_SIZE;
        if (remainder !== 0) {
            this.nextNodeOffset += BTreeNode.NODE_SIZE - remainder;
        }

        const offset = this.nextNodeOffset;
        this.nextNodeOffset += BTreeNode.NODE_SIZE;
        return offset;
    }

    // Bulk remove for better performance
    bulkRemove(keys: string[]): number {
        if (keys.length === 0) return 0;

        let removedCount = 0;
        const sortedKeys = [...keys].sort();

        // Remove in batches to minimize rebalancing
        for (const key of sortedKeys) {
            if (this.remove(key)) {
                removedCount++;
            }
        }

        return removedCount;
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
            freeNodeOffsetsCount: this.freeNodeOffsets.length,
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

function assertInternalNodeChildren(node: BTreeNode, context: string) {
    if (!node.isLeaf && node.children.length !== node.keys.length + 1) {
        console.error(
            `BTreeNode invariant violation (${context}): children.length != keys.length + 1`
        );
        console.error({
            keys: node.keys,
            children: node.children,
            parentOffset: node.parentOffset,
            offset: node.offset,
        });
        throw new Error(
            `BTreeNode invariant violation (${context}): children.length != keys.length + 1`
        );
    }
}

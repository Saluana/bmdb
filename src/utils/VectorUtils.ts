export type Vector = number[];

export interface VectorSearchResult {
  docId: string;
  score: number;
  document: any;
}

export interface VectorIndex {
  field: string;
  dimensions: number;
  algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan';
  vectors: Map<string, Vector>;
  normalizedVectors?: Map<string, Vector>; // For cosine similarity optimization
  tree?: LSHIndex; // Locality-Sensitive Hashing for approximate search
  metadata?: Map<string, any>;
}

export interface LSHBucket {
  hash: string;
  vectors: Array<{ docId: string; vector: Vector }>;
}

export class LSHIndex {
  private buckets = new Map<string, LSHBucket>();
  private hashFunctions: Array<(vector: Vector) => string> = [];
  private dimensions: number;
  private numHashFunctions: number;
  private bucketWidth: number;

  constructor(dimensions: number, numHashFunctions: number = 10, bucketWidth: number = 0.1) {
    this.dimensions = dimensions;
    this.numHashFunctions = numHashFunctions;
    this.bucketWidth = bucketWidth;
    this.initializeHashFunctions();
  }

  private initializeHashFunctions(): void {
    for (let i = 0; i < this.numHashFunctions; i++) {
      // Random projection hash function
      const randomVector = Array.from({ length: this.dimensions }, () => Math.random() - 0.5);
      const offset = Math.random() * this.bucketWidth;
      
      this.hashFunctions.push((vector: Vector) => {
        const projection = vector.reduce((sum, val, idx) => sum + val * randomVector[idx], 0);
        return Math.floor((projection + offset) / this.bucketWidth).toString();
      });
    }
  }

  add(docId: string, vector: Vector): void {
    const hashes = this.hashFunctions.map(fn => fn(vector));
    const bucketKey = hashes.join('|');
    
    if (!this.buckets.has(bucketKey)) {
      this.buckets.set(bucketKey, {
        hash: bucketKey,
        vectors: []
      });
    }
    
    this.buckets.get(bucketKey)!.vectors.push({ docId, vector });
  }

  search(queryVector: Vector, maxCandidates: number = 100): Array<{ docId: string; vector: Vector }> {
    const queryHashes = this.hashFunctions.map(fn => fn(queryVector));
    const candidates = new Set<{ docId: string; vector: Vector }>();
    
    // Search in exact bucket first
    const exactBucketKey = queryHashes.join('|');
    const exactBucket = this.buckets.get(exactBucketKey);
    if (exactBucket) {
      exactBucket.vectors.forEach(v => candidates.add(v));
    }
    
    // If not enough candidates, search in neighboring buckets
    if (candidates.size < maxCandidates) {
      for (const [bucketKey, bucket] of this.buckets.entries()) {
        if (candidates.size >= maxCandidates) break;
        
        const bucketHashes = bucketKey.split('|');
        const hammingDistance = queryHashes.reduce((dist, hash, idx) => 
          dist + (hash !== bucketHashes[idx] ? 1 : 0), 0);
        
        // Include buckets with small Hamming distance
        if (hammingDistance <= 2) {
          bucket.vectors.forEach(v => candidates.add(v));
        }
      }
    }
    
    return Array.from(candidates).slice(0, maxCandidates);
  }

  clear(): void {
    this.buckets.clear();
  }

  getStats(): {
    buckets: number;
    totalVectors: number;
    avgBucketSize: number;
  } {
    const totalVectors = Array.from(this.buckets.values())
      .reduce((sum, bucket) => sum + bucket.vectors.length, 0);
    
    return {
      buckets: this.buckets.size,
      totalVectors,
      avgBucketSize: this.buckets.size > 0 ? totalVectors / this.buckets.size : 0
    };
  }
}

export class VectorUtils {
  static validateVector(vector: any, expectedDimensions: number): Vector {
    if (!Array.isArray(vector)) {
      throw new Error('Vector must be an array');
    }
    
    if (vector.length !== expectedDimensions) {
      throw new Error(`Vector must have ${expectedDimensions} dimensions, got ${vector.length}`);
    }
    
    if (!vector.every(v => typeof v === 'number' && !isNaN(v))) {
      throw new Error('Vector must contain only valid numbers');
    }
    
    return vector as Vector;
  }

  static normalizeVector(vector: Vector): Vector {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map(val => val / magnitude);
  }

  static cosineSimilarity(a: Vector, b: Vector): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  static euclideanDistance(a: Vector, b: Vector): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
  }

  static dotProduct(a: Vector, b: Vector): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    // Optimized dot product with loop unrolling for small vectors
    if (a.length <= 4) {
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
      }
      return sum;
    }
    
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  static manhattanDistance(a: Vector, b: Vector): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    return a.reduce((sum, val, i) => sum + Math.abs(val - b[i]), 0);
  }

  static calculateSimilarity(
    a: Vector, 
    b: Vector, 
    algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan'
  ): number {
    switch (algorithm) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'euclidean':
        return 1 / (1 + this.euclideanDistance(a, b));
      case 'dot':
        return this.dotProduct(a, b);
      case 'manhattan':
        return 1 / (1 + this.manhattanDistance(a, b));
      default:
        throw new Error(`Unknown vector similarity algorithm: ${algorithm}`);
    }
  }

  static searchVectors(
    queryVector: Vector,
    vectors: Map<string, Vector>,
    algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan',
    limit: number = 10,
    threshold?: number,
    useApproximate: boolean = false,
    lshIndex?: LSHIndex
  ): Array<{ docId: string; score: number }> {
    if (useApproximate && lshIndex && vectors.size > 1000) {
      return this.approximateSearch(queryVector, lshIndex, algorithm, limit, threshold);
    }
    
    const results: Array<{ docId: string; score: number }> = [];
    
    for (const [docId, vector] of vectors.entries()) {
      const score = this.calculateSimilarity(queryVector, vector, algorithm);
      
      if (threshold === undefined || score >= threshold) {
        results.push({ docId, score });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  static approximateSearch(
    queryVector: Vector,
    lshIndex: LSHIndex,
    algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan',
    limit: number = 10,
    threshold?: number
  ): Array<{ docId: string; score: number }> {
    // Get candidates from LSH index
    const candidates = lshIndex.search(queryVector, Math.max(limit * 10, 500));
    
    const results: Array<{ docId: string; score: number }> = [];
    
    for (const candidate of candidates) {
      const score = this.calculateSimilarity(queryVector, candidate.vector, algorithm);
      
      if (threshold === undefined || score >= threshold) {
        results.push({ docId: candidate.docId, score });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  static optimizedCosineSearch(
    queryVector: Vector,
    normalizedVectors: Map<string, Vector>,
    limit: number = 10,
    threshold?: number
  ): Array<{ docId: string; score: number }> {
    const normalizedQuery = this.normalizeVector(queryVector);
    const results: Array<{ docId: string; score: number }> = [];
    
    for (const [docId, normalizedVector] of normalizedVectors.entries()) {
      // For normalized vectors, cosine similarity = dot product
      const score = this.dotProduct(normalizedQuery, normalizedVector);
      
      if (threshold === undefined || score >= threshold) {
        results.push({ docId, score });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  static createVectorIndex(
    field: string,
    dimensions: number,
    algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine',
    useApproximateSearch: boolean = false
  ): VectorIndex {
    const index: VectorIndex = {
      field,
      dimensions,
      algorithm,
      vectors: new Map(),
      metadata: new Map()
    };

    // Initialize LSH for approximate search on large datasets
    if (useApproximateSearch) {
      index.tree = new LSHIndex(dimensions);
    }

    // Pre-compute normalized vectors for cosine similarity
    if (algorithm === 'cosine') {
      index.normalizedVectors = new Map();
    }

    return index;
  }

  static addToIndex(index: VectorIndex, docId: string, vector: Vector): void {
    this.validateVector(vector, index.dimensions);
    index.vectors.set(docId, vector);
    
    // Add to LSH index if available
    if (index.tree) {
      index.tree.add(docId, vector);
    }
    
    // Pre-compute normalized vector for cosine similarity
    if (index.normalizedVectors) {
      const normalized = this.normalizeVector(vector);
      index.normalizedVectors.set(docId, normalized);
    }
  }

  static removeFromIndex(index: VectorIndex, docId: string): boolean {
    const removed = index.vectors.delete(docId);
    
    if (removed) {
      // Remove from normalized vectors cache
      if (index.normalizedVectors) {
        index.normalizedVectors.delete(docId);
      }
      
      // For LSH index, we'd need to rebuild it periodically
      // as LSH doesn't support efficient deletion
      if (index.tree && index.vectors.size % 1000 === 0) {
        this.rebuildLSHIndex(index);
      }
    }
    
    return removed;
  }

  static updateInIndex(index: VectorIndex, docId: string, vector: Vector): void {
    this.validateVector(vector, index.dimensions);
    
    // Remove old entry first
    this.removeFromIndex(index, docId);
    
    // Add new entry
    this.addToIndex(index, docId, vector);
  }

  static rebuildLSHIndex(index: VectorIndex): void {
    if (!index.tree) return;
    
    index.tree.clear();
    for (const [docId, vector] of index.vectors.entries()) {
      index.tree.add(docId, vector);
    }
  }

  static searchIndex(
    index: VectorIndex,
    queryVector: Vector,
    limit: number = 10,
    threshold?: number,
    useApproximate: boolean = false
  ): Array<{ docId: string; score: number }> {
    this.validateVector(queryVector, index.dimensions);
    
    // Use optimized cosine search if available
    if (index.algorithm === 'cosine' && index.normalizedVectors && !useApproximate) {
      return this.optimizedCosineSearch(
        queryVector,
        index.normalizedVectors,
        limit,
        threshold
      );
    }
    
    // Use approximate search for large datasets
    const shouldUseApproximate = useApproximate || index.vectors.size > 10000;
    
    return this.searchVectors(
      queryVector,
      index.vectors,
      index.algorithm,
      limit,
      threshold,
      shouldUseApproximate,
      index.tree
    );
  }

  static getIndexStats(index: VectorIndex): {
    totalVectors: number;
    dimensions: number;
    algorithm: string;
    hasNormalizedCache: boolean;
    hasLSHIndex: boolean;
    lshStats?: any;
  } {
    return {
      totalVectors: index.vectors.size,
      dimensions: index.dimensions,
      algorithm: index.algorithm,
      hasNormalizedCache: !!index.normalizedVectors,
      hasLSHIndex: !!index.tree,
      lshStats: index.tree?.getStats()
    };
  }
}
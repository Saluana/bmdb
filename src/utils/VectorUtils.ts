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
    threshold?: number
  ): Array<{ docId: string; score: number }> {
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

  static createVectorIndex(
    field: string,
    dimensions: number,
    algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine'
  ): VectorIndex {
    return {
      field,
      dimensions,
      algorithm,
      vectors: new Map()
    };
  }

  static addToIndex(index: VectorIndex, docId: string, vector: Vector): void {
    this.validateVector(vector, index.dimensions);
    index.vectors.set(docId, vector);
  }

  static removeFromIndex(index: VectorIndex, docId: string): boolean {
    return index.vectors.delete(docId);
  }

  static updateInIndex(index: VectorIndex, docId: string, vector: Vector): void {
    this.validateVector(vector, index.dimensions);
    index.vectors.set(docId, vector);
  }
}
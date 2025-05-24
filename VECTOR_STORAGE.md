# Vector Storage and Search Documentation

## Overview

BmDB now supports vector storage and similarity search, enabling applications like semantic search, recommendation systems, image similarity, and AI-powered features. The vector functionality is fully integrated with the schema system and provides high-performance similarity search with multiple algorithms.

## Table of Contents

- [Quick Start](#quick-start)
- [Schema Definition](#schema-definition)
- [Vector Operations](#vector-operations)
- [Search Algorithms](#search-algorithms)
- [Performance Considerations](#performance-considerations)
- [Storage Support](#storage-support)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Implementation Details](#implementation-details)

## Quick Start

### 1. Define a Schema with Vector Fields

```typescript
import { z } from 'zod';
import { SchemaTable, createSchema, vector, MemoryStorage } from 'bmdb';

// Define schema with vector field
const DocumentSchema = createSchema(z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  embedding: vector(z.array(z.number()), 512, 'cosine') // 512-dimensional vector
}), 'documents');
```

### 2. Create Table and Initialize Vector Indexes

```typescript
const storage = new MemoryStorage();
const documents = new SchemaTable(storage, DocumentSchema);

// Automatically create vector indexes based on schema
await documents.autoCreateIndexes();
```

### 3. Insert Documents with Vectors

```typescript
documents.insert({
  id: 'doc1',
  title: 'Machine Learning Basics',
  content: 'Introduction to ML concepts...',
  embedding: Array.from({ length: 512 }, () => Math.random()) // Your actual embedding
});
```

### 4. Perform Vector Search

```typescript
const queryVector = getEmbedding("machine learning neural networks"); // Your embedding function
const similarDocs = await documents.vectorSearch('embedding', queryVector, {
  limit: 5,
  threshold: 0.7
});

for (const result of similarDocs) {
  console.log(`${result.document.title} (similarity: ${result.score.toFixed(4)})`);
}
```

## Schema Definition

### Vector Field Declaration

Use the `vector()` helper to declare vector fields in your schema:

```typescript
import { vector } from 'bmdb';

// Basic vector field (defaults to cosine similarity)
embedding: vector(z.array(z.number()), 512)

// Vector field with specific algorithm
features: vector(z.array(z.number()), 128, 'euclidean')

// Multiple vector fields with different purposes
const ProductSchema = createSchema(z.object({
  id: z.string(),
  name: z.string(),
  textEmbedding: vector(z.array(z.number()), 512, 'cosine'),
  imageEmbedding: vector(z.array(z.number()), 2048, 'cosine'),
  featureVector: vector(z.array(z.number()), 64, 'euclidean')
}));
```

### Vector Field Parameters

- **schema**: Zod schema for the vector array (typically `z.array(z.number())`)
- **dimensions**: Number of dimensions (e.g., 512, 1024, 2048)
- **algorithm**: Similarity algorithm ('cosine', 'euclidean', 'dot', 'manhattan')

## Vector Operations

### Creating Vector Indexes

```typescript
// Auto-create all indexes (including vectors) based on schema
await table.autoCreateIndexes();

// Manually create a vector index
await table.createVectorIndex('embedding');

// Create vector index with specific algorithm
await table.createVectorIndex('embedding', { algorithm: 'euclidean' });

// Drop a vector index
await table.dropVectorIndex('embedding');

// List vector indexes
const vectorIndexes = await storage.listVectorIndexes('tableName');
```

### Vector Search

```typescript
// Basic search
const results = await table.vectorSearch('embedding', queryVector);

// Search with options
const results = await table.vectorSearch('embedding', queryVector, {
  limit: 10,        // Maximum number of results
  threshold: 0.8    // Minimum similarity score
});

// Process results
for (const result of results) {
  console.log({
    docId: result.docId,
    score: result.score,
    document: result.document
  });
}
```

### Vector Validation

Vectors are automatically validated during insert/update operations:

```typescript
// This will work - correct dimensions
documents.insert({
  id: 'doc1',
  embedding: Array.from({ length: 512 }, () => Math.random())
});

// This will throw an error - wrong dimensions
documents.insert({
  id: 'doc2', 
  embedding: [1, 2, 3] // Only 3 dimensions, expected 512
});

// This will throw an error - invalid values
documents.insert({
  id: 'doc3',
  embedding: Array.from({ length: 512 }, () => NaN) // NaN values
});
```

## Search Algorithms

### Cosine Similarity (Default)

Best for: Text embeddings, normalized features, semantic similarity

```typescript
embedding: vector(z.array(z.number()), 512, 'cosine')
```

- Returns values between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
- Measures angle between vectors, ignoring magnitude
- Most common for text/semantic embeddings

### Euclidean Distance

Best for: Spatial data, image features, when magnitude matters

```typescript
features: vector(z.array(z.number()), 128, 'euclidean')
```

- Converted to similarity: `1 / (1 + distance)`
- Measures straight-line distance between points
- Sensitive to vector magnitude

### Dot Product

Best for: When both direction and magnitude are important

```typescript
features: vector(z.array(z.number()), 64, 'dot')
```

- Raw dot product value
- Higher values indicate more similarity
- Fast to compute

### Manhattan Distance

Best for: High-dimensional sparse data, when outliers should have less impact

```typescript
features: vector(z.array(z.number()), 256, 'manhattan')
```

- Converted to similarity: `1 / (1 + distance)`
- Sum of absolute differences
- More robust to outliers than Euclidean

## Performance Considerations

### Vector Index Storage

- Vector indexes are stored in memory for fast access
- Indexes are automatically rebuilt when data changes
- Memory usage: `O(n * d)` where n = documents, d = dimensions

### Search Performance

- Search time: `O(n * d)` for brute-force similarity calculation
- Memory efficient: processes vectors on-demand
- Best performance with smaller result limits

### Optimization Tips

```typescript
// Use appropriate dimensions for your use case
// Smaller dimensions = faster search, but potentially lower quality
embedding: vector(z.array(z.number()), 384) // vs 768 or 1536

// Set reasonable search limits
const results = await table.vectorSearch('embedding', query, {
  limit: 20,      // Don't fetch more than needed
  threshold: 0.5  // Filter out low-quality matches
});

// Consider using multiple smaller vector fields instead of one large one
const schema = z.object({
  textEmbedding: vector(z.array(z.number()), 384),
  imageEmbedding: vector(z.array(z.number()), 512)
  // vs. combinedEmbedding: vector(z.array(z.number()), 896)
});
```

## Storage Support

### Supported Storage Types

| Storage Type | Vector Support | Notes |
|--------------|----------------|-------|
| MemoryStorage | ✅ Full | Best performance, data in memory |
| JSONStorage | ✅ Full | Persistent storage with in-memory indexes |
| BinaryStorage | ❌ No | Throws error for vector operations |
| WALStorage | ❌ No | Throws error for vector operations |
| WALJSONStorage | ❌ No | Inherits from WALStorage |

### Custom Storage Implementation

To add vector support to custom storage:

```typescript
import { Storage, VectorIndexDefinition } from 'bmdb';
import { VectorUtils, Vector, VectorSearchResult } from 'bmdb';

class CustomStorage implements Storage {
  // ... other methods

  async createVectorIndex(tableName: string, field: string, dimensions: number, algorithm = 'cosine'): Promise<void> {
    // Store vector index definition
    // Build index from existing data
  }

  async vectorSearch(tableName: string, field: string, queryVector: Vector, options?): Promise<VectorSearchResult[]> {
    // Validate query vector
    // Perform similarity search
    // Return sorted results
  }

  supportsFeature(feature: string): boolean {
    if (feature === 'vectorSearch') return true;
    // ... other features
  }
}
```

## API Reference

### Vector Schema Helper

```typescript
vector<T extends ZodTypeAny>(
  schema: T, 
  dimensions: number, 
  algorithm?: 'cosine' | 'euclidean' | 'dot' | 'manhattan'
): T
```

### SchemaTable Vector Methods

```typescript
// Create vector index
createVectorIndex(
  field: keyof T, 
  options?: { algorithm?: 'cosine' | 'euclidean' | 'dot' | 'manhattan' }
): Promise<void>

// Drop vector index
dropVectorIndex(field: keyof T): Promise<void>

// Search vectors
vectorSearch(
  field: keyof T, 
  queryVector: Vector, 
  options?: { limit?: number; threshold?: number }
): Promise<VectorSearchResult[]>

// Get vector fields from schema
getVectorFields(): Array<keyof T>
```

### Storage Interface

```typescript
// Vector index management
createVectorIndex(tableName: string, field: string, dimensions: number, algorithm?: string): Promise<void>
dropVectorIndex(tableName: string, indexName: string): Promise<void>
listVectorIndexes(tableName?: string): Promise<VectorIndexDefinition[]>

// Vector search
vectorSearch(tableName: string, field: string, queryVector: Vector, options?: VectorSearchOptions): Promise<VectorSearchResult[]>

// Feature support
supportsFeature(feature: 'vectorSearch'): boolean
```

### VectorUtils Utility Functions

```typescript
// Vector validation
validateVector(vector: any, expectedDimensions: number): Vector

// Similarity calculations
cosineSimilarity(a: Vector, b: Vector): number
euclideanDistance(a: Vector, b: Vector): number
dotProduct(a: Vector, b: Vector): number
manhattanDistance(a: Vector, b: Vector): number

// Unified similarity calculation
calculateSimilarity(a: Vector, b: Vector, algorithm: string): number

// Vector search
searchVectors(queryVector: Vector, vectors: Map<string, Vector>, algorithm: string, limit?: number, threshold?: number): Array<{docId: string, score: number}>
```

## Examples

### Semantic Text Search

```typescript
import OpenAI from 'openai';

const DocumentSchema = createSchema(z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  embedding: vector(z.array(z.number()), 1536, 'cosine') // OpenAI embedding size
}));

const documents = new SchemaTable(storage, DocumentSchema);
await documents.autoCreateIndexes();

// Function to get embeddings (example with OpenAI)
async function getEmbedding(text: string): Promise<number[]> {
  const openai = new OpenAI();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

// Insert documents
const docs = [
  { id: '1', title: 'ML Guide', content: 'Machine learning fundamentals...' },
  { id: '2', title: 'AI Ethics', content: 'Responsible AI development...' },
  { id: '3', title: 'Data Science', content: 'Statistical analysis methods...' }
];

for (const doc of docs) {
  documents.insert({
    ...doc,
    embedding: await getEmbedding(doc.content)
  });
}

// Search for similar documents
async function searchDocuments(query: string) {
  const queryEmbedding = await getEmbedding(query);
  const results = await documents.vectorSearch('embedding', queryEmbedding, {
    limit: 5,
    threshold: 0.7
  });
  
  return results.map(r => ({
    title: r.document.title,
    similarity: r.score,
    content: r.document.content.substring(0, 100) + '...'
  }));
}

const results = await searchDocuments("neural networks and deep learning");
```

### Image Similarity Search

```typescript
const ImageSchema = createSchema(z.object({
  id: z.string(),
  filename: z.string(),
  tags: z.array(z.string()),
  visualEmbedding: vector(z.array(z.number()), 2048, 'cosine'), // Image embedding
  metadataEmbedding: vector(z.array(z.number()), 384, 'cosine')  // Text metadata embedding
}));

const images = new SchemaTable(storage, ImageSchema);
await images.autoCreateIndexes();

// Insert images with multiple embeddings
images.insert({
  id: 'img1',
  filename: 'sunset.jpg',
  tags: ['nature', 'landscape', 'sunset'],
  visualEmbedding: await getImageEmbedding('sunset.jpg'),
  metadataEmbedding: await getTextEmbedding('nature landscape sunset')
});

// Search by visual similarity
const visualResults = await images.vectorSearch('visualEmbedding', queryImageEmbedding);

// Search by metadata similarity  
const metadataResults = await images.vectorSearch('metadataEmbedding', queryTextEmbedding);
```

### Product Recommendation

```typescript
const ProductSchema = createSchema(z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  price: z.number(),
  features: vector(z.array(z.number()), 128, 'euclidean'), // Product features
  userPreferences: vector(z.array(z.number()), 64, 'dot')   // Preference matching
}));

const products = new SchemaTable(storage, ProductSchema);
await products.autoCreateIndexes();

// Find similar products
async function findSimilarProducts(productId: string) {
  const product = products.search({ id: productId })[0];
  if (!product) return [];
  
  return await products.vectorSearch('features', product.features, {
    limit: 10,
    threshold: 0.6
  });
}

// Find products matching user preferences
async function recommendProducts(userPreferenceVector: number[]) {
  return await products.vectorSearch('userPreferences', userPreferenceVector, {
    limit: 20,
    threshold: 0.5
  });
}
```

### Multi-Vector Search

```typescript
// Combine multiple vector searches for better results
async function hybridSearch(textQuery: string, imageQuery: number[], userProfile: number[]) {
  const textEmbedding = await getTextEmbedding(textQuery);
  
  // Search by text similarity
  const textResults = await products.vectorSearch('textEmbedding', textEmbedding, { limit: 50 });
  
  // Search by image similarity
  const imageResults = await products.vectorSearch('imageEmbedding', imageQuery, { limit: 50 });
  
  // Search by user preference
  const prefResults = await products.vectorSearch('userPreferences', userProfile, { limit: 50 });
  
  // Combine and re-rank results
  const combinedResults = new Map();
  
  textResults.forEach(r => {
    combinedResults.set(r.docId, { ...r, textScore: r.score });
  });
  
  imageResults.forEach(r => {
    const existing = combinedResults.get(r.docId);
    if (existing) {
      existing.imageScore = r.score;
      existing.score = (existing.textScore + r.score) / 2;
    } else {
      combinedResults.set(r.docId, { ...r, imageScore: r.score });
    }
  });
  
  prefResults.forEach(r => {
    const existing = combinedResults.get(r.docId);
    if (existing) {
      existing.prefScore = r.score;
      existing.score = (existing.score + r.score) / 2;
    }
  });
  
  return Array.from(combinedResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
```

## Implementation Details

### Vector Index Structure

```typescript
interface VectorIndex {
  field: string;
  dimensions: number;
  algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan';
  vectors: Map<string, Vector>; // docId -> vector
}
```

### Search Result Structure

```typescript
interface VectorSearchResult {
  docId: string;     // Document ID
  score: number;     // Similarity score
  document: any;     // Full document object
}
```

### Index Management

1. **Creation**: Vector indexes are created when `createVectorIndex()` is called or via `autoCreateIndexes()`
2. **Building**: Indexes scan existing table data and extract vectors from specified fields
3. **Maintenance**: Indexes are automatically rebuilt when `write()` is called on storage
4. **Memory**: All vector indexes are kept in memory for fast access

### Search Algorithm

1. **Validation**: Query vector is validated against expected dimensions
2. **Similarity Calculation**: Each indexed vector is compared using the specified algorithm
3. **Filtering**: Results below threshold are excluded (if specified)
4. **Sorting**: Results are sorted by similarity score (descending)
5. **Limiting**: Top N results are returned based on limit parameter

### Error Handling

Common errors and their causes:

```typescript
// Dimension mismatch
"Vector must have 512 dimensions, got 384"

// Invalid vector values
"Vector must contain only valid numbers"

// Missing vector index
"Vector index not found for table 'documents', field 'embedding'"

// Unsupported storage
"Vector operations not supported by this storage type"

// Invalid field
"Field 'embedding' is not a vector field"
```

### Performance Characteristics

- **Index Creation**: O(n * d) where n = documents, d = dimensions
- **Search Time**: O(n * d) for brute-force similarity
- **Memory Usage**: O(n * d) for storing vectors in index
- **Insert Time**: O(d) for vector validation + normal insert overhead

### Thread Safety

- Vector indexes are rebuilt atomically during write operations
- Search operations are read-only and thread-safe
- No additional locking is required beyond storage-level locking

This comprehensive vector functionality enables powerful AI and ML applications while maintaining the simplicity and performance that BmDB is known for.
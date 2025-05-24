# Getting Started with BMDB

Welcome to BMDB! This guide will help you get up and running with the high-performance embedded database.

## 📦 Installation

Choose your preferred package manager:

```bash
# npm
npm install bmdb

# yarn
yarn add bmdb

# pnpm
pnpm add bmdb

# bun
bun add bmdb
```

## 🚀 Quick Start

### Basic Database Operations

```typescript
import { TinyDB, JSONStorage } from 'bmdb';

// Create a database
const db = new TinyDB('my-database.json', JSONStorage);

// Get a table (creates if doesn't exist)
const users = db.table('users');

// Insert documents
const userId1 = users.insert({
  name: 'Alice Johnson',
  email: 'alice@example.com',
  age: 30,
  role: 'developer'
});

const userId2 = users.insert({
  name: 'Bob Smith',
  email: 'bob@example.com',
  age: 25,
  role: 'designer'
});

console.log('Created users with IDs:', userId1, userId2);

// Query documents
const allUsers = users.all();
console.log('All users:', allUsers);

// Search with conditions
const developers = users.search({ role: 'developer' });
console.log('Developers:', developers);

// Get a specific user
const alice = users.get(undefined, userId1);
console.log('Alice:', alice);

// Update documents
const updatedIds = users.update(
  { lastLogin: new Date() },
  { email: 'alice@example.com' }
);
console.log('Updated user IDs:', updatedIds);

// Remove documents
const removedIds = users.remove({ role: 'designer' });
console.log('Removed user IDs:', removedIds);

// Always close the database when done
db.close();
```

### Using the Default Table

For simple use cases, you can work directly with the database without explicitly creating tables:

```typescript
import { TinyDB } from 'bmdb';

const db = new TinyDB('simple.json');

// These operations work on the default table
const id = db.insert({ message: 'Hello, World!' });
const docs = db.all();
const results = db.search({ message: 'Hello, World!' });

db.close();
```

## 🔧 Choosing a Storage Engine

BMDB provides multiple storage engines optimized for different use cases:

### JSONStorage - For Development

```typescript
import { TinyDB, JSONStorage } from 'bmdb';

const db = new TinyDB('dev.json', JSONStorage);
```

**Best for:**
- Development and prototyping
- Small datasets (< 10MB)
- Human-readable storage
- Simple configuration

### WALJSONStorage - For Production (Recommended)

```typescript
import { TinyDB, WALJSONStorage } from 'bmdb';

const db = new TinyDB('prod.json', WALJSONStorage, {
  batchSize: 1000,        // Operations per batch
  maxBatchWaitMs: 20,     // Max wait time for batching
  compactThreshold: 5000  // WAL size before compaction
});
```

**Best for:**
- Production applications
- High-throughput workloads (50,000+ ops/sec)
- ACID transaction requirements
- Write-heavy applications

### BinaryStorage - For Large Datasets

```typescript
import { TinyDB, BinaryStorage } from 'bmdb';

const db = new TinyDB('data.bmdb', BinaryStorage);
```

**Best for:**
- Large datasets requiring storage efficiency
- 30-50% smaller file sizes
- Read-heavy workloads
- Binary format acceptable

### MemoryStorage - For Caching

```typescript
import { TinyDB, MemoryStorage } from 'bmdb';

const cache = new TinyDB(MemoryStorage);
```

**Best for:**
- Caching layers
- Testing scenarios
- Temporary data storage
- Maximum performance (no I/O)

## 🔍 Querying Data

### Simple Queries

```typescript
const users = db.table('users');

// Exact match
const admins = users.search({ role: 'admin' });

// Multiple conditions (AND)
const activeAdmins = users.search({
  role: 'admin',
  status: 'active'
});

// Using operators
const adults = users.search({
  age: { $gte: 18 }
});

const recentUsers = users.search({
  createdAt: { $gt: new Date('2024-01-01') }
});
```

### Complex Queries with Where Clauses

```typescript
import { where } from 'bmdb';

// Fluent query building
const results = users.search(
  where('age').gte(18).and(where('status').equals('active'))
);

// String operations
const emailUsers = users.search(
  where('email').endsWith('@company.com')
);

// Array operations
const premiumUsers = users.search(
  where('tags').contains('premium')
);

// Regular expressions
const phoneUsers = users.search(
  where('phone').matches(/^\+1/)
);

// Nested object queries
const notifications = users.search(
  where('preferences.notifications').equals(true)
);
```

### Advanced Query Operators

```typescript
// Logical operators
const query1 = users.search({
  $or: [
    { role: 'admin' },
    { role: 'moderator' }
  ]
});

const query2 = users.search({
  $and: [
    { age: { $gte: 18 } },
    { status: 'active' }
  ]
});

// Array operations
const query3 = users.search({
  skills: { $in: ['javascript', 'typescript'] }
});

const query4 = users.search({
  tags: { $size: 3 }  // Arrays with exactly 3 elements
});

// Existence checks
const query5 = users.search({
  optionalField: { $exists: true }
});
```

## 📊 Pagination and Large Datasets

### Paginated Queries

```typescript
const users = db.table('users');

// Get first page
const page1 = users.searchPaginated(
  where('status').equals('active'),
  1,    // page number (1-based)
  20    // page size
);

console.log('Results:', page1.data);
console.log('Page:', page1.page, 'of', page1.totalPages);
console.log('Total:', page1.totalCount);

// Get next page
if (page1.hasMore) {
  const page2 = users.searchPaginated(
    where('status').equals('active'),
    page1.nextPage!,
    20
  );
}
```

### Lazy Iteration for Memory Efficiency

```typescript
// Process large datasets without loading everything into memory
const users = db.table('users');

for await (const user of users.lazy(where('status').equals('active'))) {
  // Process one user at a time
  await processUser(user);
}

// Configure lazy iteration
const iterator = users.lazy(
  where('type').equals('premium'),
  {
    pageSize: 100,        // Load 100 at a time
    prefetchNext: true,   // Prefetch next chunk
    cachePages: false     // Don't cache previous chunks
  }
);

for await (const user of iterator) {
  console.log('Processing:', user.name);
}
```

## 🎯 Schema Validation

### Defining Schemas

```typescript
import { createSchema, field, unique } from 'bmdb';
import { z } from 'zod';

// Define a schema
const userSchema = createSchema({
  id: field(z.string()).primaryKey(),
  name: field(z.string().min(1).max(100)),
  email: field(z.string().email()).unique(),
  age: field(z.number().int().min(0).max(150)),
  tags: field(z.array(z.string())).optional(),
  profile: field(z.object({
    bio: z.string().optional(),
    website: z.string().url().optional()
  })).optional()
});

// Create schema table
const users = db.schemaTable(userSchema, 'users');
```

### Type-Safe Operations

```typescript
// TypeScript knows the exact shape
const user = users.insert({
  id: 'user_123',
  name: 'Alice Johnson',
  email: 'alice@example.com',  // Must be valid email
  age: 30,
  tags: ['developer', 'typescript']
});

// Validation errors are caught at runtime
try {
  users.insert({
    id: 'user_124',
    name: '',  // Error: name too short
    email: 'invalid-email',  // Error: invalid email
    age: -5   // Error: age too low
  });
} catch (error) {
  console.error('Validation failed:', error.message);
}

// Updates are also validated
users.update(
  { age: 31 },
  where('id').equals('user_123')
);
```

## 🚀 Performance Optimization

### Enable High-Performance WAL

```typescript
import { TinyDB, WALJSONStorage } from 'bmdb';

const db = new TinyDB('high-perf.json', WALJSONStorage, {
  batchSize: 1000,          // Batch up to 1000 operations
  maxBatchWaitMs: 20,       // Wait max 20ms for batching
  compactThreshold: 10000,  // Compact when WAL has 10k operations
  autoFlushMs: 100,         // Auto-flush every 100ms
  backgroundCompaction: true // Enable background compaction
});
```

### Connection Pooling for High Concurrency

```typescript
// Enable connection pooling
db.enableConnectionPool({
  maxConnections: 10,
  minConnections: 2,
  maxIdleTime: 30000
});

// Use pooled connections
const result = await db.withConnection(async (table) => {
  return table.search(where('status').equals('active'));
});

// Batch operations
const results = await db.batchOperation([
  (table) => table.count(where('type').equals('user')),
  (table) => table.count(where('type').equals('admin')),
  (table) => table.search(where('active').equals(true))
]);
```

### Parallel Processing

```typescript
// Parallel search for large datasets
const results = await users.searchParallel(
  where('category').equals('electronics'),
  {
    chunkSize: 1000,
    maxConcurrency: 4
  }
);

// Parallel aggregation
const totalRevenue = await users.aggregateParallel(
  (chunk) => chunk.reduce((sum, user) => sum + user.purchases, 0),
  (results) => results.reduce((sum, partial) => sum + partial, 0)
);
```

## 🔍 Vector Search

### Basic Vector Operations

```typescript
const embeddings = db.table('embeddings');

// Insert documents with vectors
embeddings.insert({
  text: 'Machine learning is fascinating',
  vector: [0.1, 0.2, 0.3, 0.8, 0.5]
});

embeddings.insert({
  text: 'Artificial intelligence revolution',
  vector: [0.2, 0.3, 0.4, 0.7, 0.6]
});

// Search for similar vectors
const queryVector = [0.15, 0.25, 0.35, 0.75, 0.55];
const similar = embeddings.vectorSearch('vector', queryVector, {
  limit: 5,
  algorithm: 'cosine'
});

console.log('Similar documents:', similar);
```

## 📝 Complete Example

Here's a complete example showing common patterns:

```typescript
import { TinyDB, WALJSONStorage, createSchema, field, where } from 'bmdb';
import { z } from 'zod';

// Schema definition
const blogPostSchema = createSchema({
  id: field(z.string()).primaryKey(),
  title: field(z.string().min(1).max(200)),
  content: field(z.string()),
  author: field(z.string()),
  tags: field(z.array(z.string())),
  publishedAt: field(z.date()).optional(),
  viewCount: field(z.number().int().min(0)).default(0)
});

async function blogExample() {
  // Create high-performance database
  const db = new TinyDB('blog.json', WALJSONStorage, {
    batchSize: 1000,
    maxBatchWaitMs: 20
  });

  // Create schema table
  const posts = db.schemaTable(blogPostSchema, 'posts');

  try {
    // Insert blog posts
    const postIds = posts.insertMultiple([
      {
        id: 'post_1',
        title: 'Getting Started with BMDB',
        content: 'BMDB is a high-performance embedded database...',
        author: 'alice',
        tags: ['database', 'tutorial', 'typescript']
      },
      {
        id: 'post_2',
        title: 'Advanced Query Techniques',
        content: 'Learn how to write complex queries...',
        author: 'bob',
        tags: ['database', 'advanced', 'queries'],
        publishedAt: new Date()
      }
    ]);

    console.log('Created posts:', postIds);

    // Query posts
    const publishedPosts = posts.search(
      where('publishedAt').exists()
    );

    const tutorialPosts = posts.search(
      where('tags').contains('tutorial')
    );

    const recentPosts = posts.searchPaginated(
      where('publishedAt').gte(new Date('2024-01-01')),
      1,
      10
    );

    // Update view counts
    posts.update(
      { viewCount: { $add: 1 } },
      where('id').equals('post_1')
    );

    // Complex query with multiple conditions
    const popularTutorials = posts.search(
      where('tags').contains('tutorial')
        .and(where('viewCount').gte(100))
    );

    console.log('Published posts:', publishedPosts.length);
    console.log('Tutorial posts:', tutorialPosts.length);
    console.log('Recent posts page:', recentPosts);

  } finally {
    // Always close when done
    db.close();
  }
}

// Run the example
blogExample().catch(console.error);
```

## 🎯 Next Steps

Now that you're familiar with the basics:

1. **Explore Storage Engines**: Learn about [Storage Engines](./storage-engines.md) to choose the right backend
2. **Master Queries**: Dive into [Advanced Queries](../examples/advanced-queries.md) for complex scenarios
3. **Optimize Performance**: Check out [Performance Optimization](./performance.md) tips
4. **Use Schemas**: Learn about [Schema Validation](./schema-validation.md) for type safety
5. **Try Vector Search**: Explore [Vector Search](./vector-search.md) for similarity matching

Happy coding with BMDB! 🚀
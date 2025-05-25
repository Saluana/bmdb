# BmDB Schema Guide

A comprehensive guide to defining and using schemas in BmDB for data validation, type safety, and advanced features.

## Quick Start

```typescript
import { TinyDB, createSchema, unique, primaryKey } from 'bmdb';
import { z } from 'zod';

// Define a schema
const UserSchema = createSchema(
  z.object({
    id: primaryKey(z.number().int().positive()),
    email: unique(z.string().email()),
    name: z.string().min(1),
    age: z.number().int().min(0).optional()
  }),
  'users'
);

// Create a schema table
const db = new TinyDB('mydb.bmdb');
const users = db.schemaTable(UserSchema);

// Insert with validation
const userId = users.insert({
  id: 1,
  email: 'john@example.com',
  name: 'John Doe',
  age: 25
});
```

## Schema Definition

### Basic Schema Creation

```typescript
import { z } from 'zod';
import { createSchema } from 'bmdb';

// Simple schema
const ProductSchema = createSchema(
  z.object({
    name: z.string(),
    price: z.number().positive(),
    inStock: z.boolean().default(true)
  }),
  'products'  // Table name
);

// Schema with validation rules
const UserSchema = createSchema(
  z.object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    age: z.number().int().min(13).max(120),
    birthDate: z.date(),
    preferences: z.object({
      theme: z.enum(['light', 'dark']).default('light'),
      notifications: z.boolean().default(true)
    }).optional()
  }),
  'users'
);
```

### Field Decorators

#### Primary Keys

```typescript
import { primaryKey } from 'bmdb';

const UserSchema = createSchema(
  z.object({
    id: primaryKey(z.number().int().positive()),
    // OR string primary key
    uuid: primaryKey(z.string().uuid()),
    // OR auto-generated
    id: primaryKey(z.string().default(() => generateId()))
  })
);
```

#### Unique Fields

```typescript
import { unique } from 'bmdb';

const UserSchema = createSchema(
  z.object({
    id: primaryKey(z.number()),
    email: unique(z.string().email()),
    username: unique(z.string().min(3)),
    socialSecurityNumber: unique(z.string().optional()) // Unique but optional
  })
);
```

#### Compound Indexes

```typescript
import { compoundIndex } from 'bmdb';

const ProductSchema = createSchema(
  z.object({
    category: compoundIndex(z.string(), 'category_brand'),
    brand: compoundIndex(z.string(), 'category_brand'),
    sku: unique(z.string()),
    name: z.string()
  })
);

// This creates a compound index on [category, brand] for efficient queries like:
// products.search(where('category').equals('electronics').and(where('brand').equals('Apple')))
```

#### Vector Fields

```typescript
import { vector } from 'bmdb';

const ImageSchema = createSchema(
  z.object({
    id: primaryKey(z.string()),
    filename: z.string(),
    // Vector field: array of numbers, 512 dimensions, cosine similarity
    embedding: vector(z.array(z.number()), 512, 'cosine'),
    // Alternative similarity metrics
    features: vector(z.array(z.number()), 256, 'euclidean'),
    textEmbedding: vector(z.array(z.number()), 1536, 'dot')
  })
);
```

## Advanced Schema Features

### Default Values and Transformations

```typescript
const PostSchema = createSchema(
  z.object({
    id: primaryKey(z.string().default(() => crypto.randomUUID())),
    title: z.string(),
    content: z.string(),
    slug: z.string().transform(val => val.toLowerCase().replace(/\s+/g, '-')),
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date()),
    tags: z.array(z.string()).default([]),
    metadata: z.record(z.any()).default({}),
    // Computed field based on other fields
    wordCount: z.number().optional().transform((val, ctx) => {
      if (val !== undefined) return val;
      return ctx.content ? ctx.content.split(/\s+/).length : 0;
    })
  })
);
```

### Nested Objects and Arrays

```typescript
const OrderSchema = createSchema(
  z.object({
    id: primaryKey(z.string()),
    customerId: z.string(),
    items: z.array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        price: z.number().positive(),
        metadata: z.record(z.string()).optional()
      })
    ),
    shipping: z.object({
      address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        zipCode: z.string().regex(/^\d{5}(-\d{4})?$/)
      }),
      method: z.enum(['standard', 'express', 'overnight']),
      trackingNumber: z.string().optional()
    }),
    payment: z.discriminatedUnion('method', [
      z.object({
        method: z.literal('credit_card'),
        cardLast4: z.string().length(4),
        cardType: z.enum(['visa', 'mastercard', 'amex'])
      }),
      z.object({
        method: z.literal('paypal'),
        paypalEmail: z.string().email()
      }),
      z.object({
        method: z.literal('bank_transfer'),
        accountNumber: z.string()
      })
    ])
  })
);
```

### Enums and Unions

```typescript
const UserRoleSchema = z.enum(['user', 'moderator', 'admin', 'super_admin']);

const NotificationSchema = createSchema(
  z.object({
    id: primaryKey(z.string()),
    userId: z.string(),
    type: z.enum(['email', 'push', 'sms', 'in_app']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    // Union types for different notification content
    content: z.union([
      z.object({
        type: z.literal('message'),
        title: z.string(),
        body: z.string()
      }),
      z.object({
        type: z.literal('system_alert'),
        alertCode: z.string(),
        severity: z.enum(['info', 'warning', 'error'])
      })
    ])
  })
);
```

## Schema Tables vs Regular Tables

### Regular Table (No Validation)

```typescript
const regularTable = db.table('logs');

// No validation - anything goes
regularTable.insert({ anything: 'can be inserted' });
regularTable.insert({ random: 123, data: { nested: true } });
```

### Schema Table (Strict Validation)

```typescript
const users = db.schemaTable(UserSchema);

// Validation enforced
try {
  users.insert({
    id: 1,
    email: 'invalid-email',  // Will throw BmDbValidationError
    name: 'John'
  });
} catch (error) {
  console.error('Validation failed:', error.message);
}

// Correct insertion
const userId = users.insert({
  id: 1,
  email: 'john@example.com',
  name: 'John Doe',
  age: 25
});
```

## Validation Methods

### Full Validation

```typescript
// Validate complete object
const userData = {
  id: 1,
  email: 'john@example.com',
  name: 'John Doe',
  age: 25
};

try {
  const validatedData = UserSchema.validate(userData);
  console.log('Valid data:', validatedData);
} catch (error) {
  console.error('Validation error:', error.message);
}
```

### Partial Validation (for Updates)

```typescript
// Validate partial object for updates
const updateData = { name: 'John Smith', age: 26 };

try {
  const validatedUpdate = UserSchema.validatePartial(updateData);
  users.update(validatedUpdate, where('id').equals(1));
} catch (error) {
  console.error('Update validation failed:', error.message);
}
```

### Safe Validation

```typescript
// Returns result object instead of throwing
const result = UserSchema.safeValidate(userData);

if (result.success) {
  console.log('Valid data:', result.data);
  users.insert(result.data);
} else {
  console.error('Validation errors:', result.error.errors);
  // Handle specific errors
  result.error.errors.forEach(err => {
    console.log(`${err.path.join('.')}: ${err.message}`);
  });
}
```

## Type Safety

### TypeScript Integration

```typescript
// Extract TypeScript types from schema
type User = z.infer<typeof UserSchema.zodSchema>;
type UserInput = z.input<typeof UserSchema.zodSchema>;

// Use types in your code
const createUser = (userData: UserInput): User => {
  const validatedData = UserSchema.validate(userData);
  const userId = users.insert(validatedData);
  return users.get(where('id').equals(userId))!;
};

// Type-safe queries
const findUserByEmail = (email: string): User | null => {
  return users.get(where('email').equals(email));
};
```

### Optional and Nullable Fields

```typescript
const ProfileSchema = createSchema(
  z.object({
    id: primaryKey(z.string()),
    userId: z.string(),
    bio: z.string().optional(),              // May be undefined
    avatar: z.string().nullable(),           // May be null
    website: z.string().url().optional(),    // Optional with validation
    birthDate: z.date().nullable().optional() // Both nullable and optional
  })
);

type Profile = z.infer<typeof ProfileSchema.zodSchema>;
// Profile.bio: string | undefined
// Profile.avatar: string | null
// Profile.birthDate: Date | null | undefined
```

## Index Management

### Automatic Index Creation

```typescript
const users = db.schemaTable(UserSchema);

// Create all schema-defined indexes
await users.autoCreateIndexes();

// Check what indexes were created
console.log('Primary key:', users.getPrimaryKey());
console.log('Unique fields:', users.getUniqueFields());
console.log('Vector fields:', users.getVectorFields());
```

### Manual Index Creation

```typescript
// Create additional indexes not defined in schema
await users.createIndex('age');
await users.createIndex('createdAt', { sparse: true });

// Create compound indexes
await users.createCompoundIndex(['department', 'role']);

// Create vector indexes
await images.createVectorIndex('embedding', {
  metric: 'cosine',
  dimensions: 512
});
```

## Vector Operations

### Vector Search

```typescript
const images = db.schemaTable(ImageSchema);

// Find similar images
const queryVector = [0.1, 0.2, 0.3, /* ... 512 dimensions */];

const similarImages = await images.vectorSearch('embedding', queryVector, {
  limit: 10,
  threshold: 0.8  // Minimum similarity score
});

// Results include similarity scores
similarImages.forEach(result => {
  console.log(`${result.document.filename}: ${result.score}`);
});
```

### Vector Index Management

```typescript
// Create vector index with specific configuration
await images.createVectorIndex('embedding', {
  metric: 'cosine',     // 'cosine', 'euclidean', or 'dot'
  dimensions: 512,
  algorithm: 'hnsw',    // Hierarchical Navigable Small World
  efConstruction: 200,  // Build-time parameter
  maxConnections: 16    // Max connections per node
});
```

## Error Handling

### Validation Errors

```typescript
import { BmDbValidationError, BmDbUniqueConstraintError } from 'bmdb';

try {
  users.insert({
    id: 1,
    email: 'duplicate@example.com',  // Already exists
    name: '',  // Fails min length validation
    age: -5    // Fails min value validation
  });
} catch (error) {
  if (error instanceof BmDbValidationError) {
    console.log('Field:', error.path);
    console.log('Value:', error.value);
    console.log('Error:', error.message);
  } else if (error instanceof BmDbUniqueConstraintError) {
    console.log('Unique constraint violation:');
    console.log('Field:', error.field);
    console.log('Value:', error.value);
  }
}
```

### Schema Evolution

```typescript
// Handle schema changes gracefully
const safeInsert = (userData: any) => {
  const result = UserSchema.safeValidate(userData);
  
  if (!result.success) {
    // Log validation errors for monitoring
    console.warn('Schema validation failed:', {
      data: userData,
      errors: result.error.errors
    });
    
    // Attempt to fix common issues
    const fixedData = { ...userData };
    
    // Handle missing required fields
    if (!fixedData.email && fixedData.username) {
      fixedData.email = `${fixedData.username}@example.com`;
    }
    
    // Retry validation
    const retryResult = UserSchema.safeValidate(fixedData);
    if (retryResult.success) {
      return users.insert(retryResult.data);
    }
    
    throw new Error('Unable to fix validation errors');
  }
  
  return users.insert(result.data);
};
```

## Performance Considerations

### Efficient Schema Design

```typescript
// Good: Indexed fields for common queries
const UserSchema = createSchema(
  z.object({
    id: primaryKey(z.string()),
    email: unique(z.string().email()),        // Will be indexed
    department: compoundIndex(z.string(), 'dept_role'),  // Part of compound index
    role: compoundIndex(z.string(), 'dept_role'),        // Part of compound index
    createdAt: z.date().default(() => new Date())
  })
);

// Common query patterns will be efficient:
// users.search(where('email').equals('...'))          // Uses unique index
// users.search(where('department').equals('...').and(where('role').equals('...')))  // Uses compound index
```

### Validation Performance

```typescript
// For bulk operations, consider batch validation
const bulkInsert = (usersData: any[]) => {
  const validatedUsers = usersData
    .map(userData => UserSchema.safeValidate(userData))
    .filter(result => result.success)
    .map(result => result.data);
  
  console.log(`Validated ${validatedUsers.length} of ${usersData.length} users`);
  
  // Use batch insert for better performance
  return users.insertMany(validatedUsers);
};
```

## Best Practices

1. **Define Clear Primary Keys**: Always use explicit primary keys rather than relying on auto-generated ones for important entities.

2. **Use Appropriate Field Types**: Choose the most specific Zod types for better validation and type safety.

3. **Index Strategic Fields**: Create indexes for fields commonly used in queries.

4. **Handle Schema Evolution**: Use safe validation methods when dealing with data that might not conform to current schema.

5. **Validate at Boundaries**: Validate data when it enters your system, not just before database insertion.

6. **Use Compound Indexes**: For multi-field queries, define compound indexes in your schema.

```typescript
// Example of well-designed schema
const UserSchema = createSchema(
  z.object({
    // Clear primary key
    id: primaryKey(z.string().uuid().default(() => crypto.randomUUID())),
    
    // Unique constraints for natural keys
    email: unique(z.string().email().toLowerCase()),
    username: unique(z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/)),
    
    // Compound index for common query patterns
    department: compoundIndex(z.string(), 'dept_role'),
    role: compoundIndex(z.string(), 'dept_role'),
    
    // Proper types with validation
    age: z.number().int().min(0).max(150).optional(),
    salary: z.number().positive().optional(),
    
    // Timestamps for auditing
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date()),
    
    // Structured nested data
    preferences: z.object({
      theme: z.enum(['light', 'dark']).default('light'),
      language: z.string().length(2).default('en'),
      notifications: z.boolean().default(true)
    }).default({})
  }),
  'users'
);
```
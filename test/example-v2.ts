import { z } from 'zod';
import { 
  TinyDB, 
  createSchema, 
  unique, 
  primaryKey,
  compoundIndex,
  BmDbUniqueConstraintError,
  BmDbValidationError 
} from '../src/index';

// ===== BmDB V2 Schema Example =====

console.log('🚀 BmDB V2 - Zod-native Schema Example\n');

// Define schemas with type safety and constraints
const UserSchema = createSchema(
  z.object({
    id: primaryKey(z.number().int().positive()),
    email: unique(z.string().email().toLowerCase()),
    username: unique(z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/)),
    name: z.string().min(1).max(100),
    age: z.number().int().min(13).max(120).optional(),
    role: z.enum(['user', 'admin', 'moderator']).default('user'),
    createdAt: z.date().default(() => new Date()),
    isActive: z.boolean().default(true),
    metadata: z.object({
      lastLogin: z.date().optional(),
      preferences: z.object({
        theme: z.enum(['light', 'dark']).default('light'),
        notifications: z.boolean().default(true)
      }).default({})
    }).default({})
  }),
  'users'
);

const PostSchema = createSchema(
  z.object({
    id: primaryKey(z.string().uuid()),
    authorId: z.number().int().positive(),
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    slug: unique(z.string().regex(/^[a-z0-9-]+$/)),
    tags: z.array(z.string()).default([]),
    published: z.boolean().default(false),
    publishedAt: z.date().optional(),
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date())
  }),
  'posts'
);

// Type inference from schemas
type User = z.infer<typeof UserSchema.zodSchema>;
type Post = z.infer<typeof PostSchema.zodSchema>;

async function demonstrateV2Features() {
  console.log('📊 Creating database and tables...');
  
  const db = new TinyDB('example-v2.json');
  const users = db.schemaTable(UserSchema);
  const posts = db.schemaTable(PostSchema);
  
  console.log('✅ Schema tables created\n');
  
  // ===== Schema Validation =====
  console.log('🔍 Testing Schema Validation...');
  
  try {
    // Valid user
    const user1: User = {
      id: 1,
      email: 'john@example.com',
      username: 'john_doe',
      name: 'John Doe',
      age: 30,
      role: 'user'
    };
    
    const userId = users.insert(user1);
    console.log('✅ Valid user inserted with ID:', userId);
    
    // Invalid email
    const invalidUser = {
      id: 2,
      email: 'not-an-email',
      username: 'jane_doe',
      name: 'Jane Doe'
    };
    
    users.insert(invalidUser as any);
    
  } catch (error) {
    if (error instanceof BmDbValidationError) {
      console.log('✅ Schema validation caught invalid email:', error.path);
    }
  }
  
  // ===== Unique Constraints =====
  console.log('\n🔒 Testing Unique Constraints...');
  
  try {
    // Duplicate email
    const duplicateUser = {
      id: 3,
      email: 'john@example.com', // Duplicate!
      username: 'another_john',
      name: 'Another John'
    };
    
    users.insert(duplicateUser);
    
  } catch (error) {
    if (error instanceof BmDbUniqueConstraintError) {
      console.log('✅ Unique constraint caught duplicate email:', error.field);
    }
  }
  
  try {
    // Duplicate primary key
    const duplicateId = {
      id: 1, // Duplicate primary key!
      email: 'different@example.com',
      username: 'different_user',
      name: 'Different User'
    };
    
    users.insert(duplicateId);
    
  } catch (error) {
    if (error instanceof BmDbUniqueConstraintError) {
      console.log('✅ Primary key constraint caught duplicate ID:', error.field);
    }
  }
  
  // ===== Successful Operations =====
  console.log('\n💾 Inserting valid data...');
  
  // Add more users
  const validUsers: Partial<User>[] = [
    {
      id: 2,
      email: 'jane@example.com',
      username: 'jane_smith',
      name: 'Jane Smith',
      age: 25,
      role: 'moderator'
    },
    {
      id: 3,
      email: 'admin@example.com',
      username: 'admin',
      name: 'System Admin',
      role: 'admin'
    }
  ];
  
  for (const user of validUsers) {
    const userId = users.insert(user as User);
    console.log(`✅ User ${user.name} inserted with ID: ${userId}`);
  }
  
  // Add posts with UUIDs
  const samplePosts: Partial<Post>[] = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      authorId: 1,
      title: 'Getting Started with BmDB V2',
      content: 'This post explains how to use the new schema features...',
      slug: 'getting-started-bmdb-v2',
      tags: ['bmdb', 'database', 'typescript'],
      published: true,
      publishedAt: new Date()
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      authorId: 2,
      title: 'Advanced Schema Patterns',
      content: 'Learn about compound indexes and validation...',
      slug: 'advanced-schema-patterns',
      tags: ['schemas', 'advanced', 'patterns'],
      published: false
    }
  ];
  
  for (const post of samplePosts) {
    const postId = posts.insert(post as Post);
    console.log(`✅ Post "${post.title}" inserted with ID: ${postId}`);
  }
  
  // ===== Schema Introspection =====
  console.log('\n🔍 Schema Introspection...');
  
  console.log('Users schema:');
  console.log('  - Primary key:', users.getPrimaryKey());
  console.log('  - Unique fields:', users.getUniqueFields());
  console.log('  - Total users:', users.length);
  
  console.log('\nPosts schema:');
  console.log('  - Primary key:', posts.getPrimaryKey());
  console.log('  - Unique fields:', posts.getUniqueFields());
  console.log('  - Total posts:', posts.length);
  
  // ===== Querying with Type Safety =====
  console.log('\n🔎 Querying with Type Safety...');
  
  // Find all published posts
  const publishedPosts = posts.search((post) => post.published === true);
  console.log('✅ Published posts:', publishedPosts.length);
  
  // Find admin users
  const adminUsers = users.search((user) => user.role === 'admin');
  console.log('✅ Admin users:', adminUsers.map(u => (u as any).name));
  
  // Update with validation
  const updatedUsers = users.update({
    metadata: {
      lastLogin: new Date(),
      preferences: { theme: 'dark', notifications: true }
    }
  });
  console.log('✅ Updated user metadata for', updatedUsers.length, 'users');
  
  // ===== Cleanup =====
  console.log('\n🧹 Cleaning up...');
  
  // Show final state
  console.log('Final database state:');
  console.log('  - Users:', users.length);
  console.log('  - Posts:', posts.length);
  
  db.close();
  
  console.log('\n✅ BmDB V2 Example completed successfully!');
  console.log('🎉 Schema validation, unique constraints, and type safety all working!');
}

// Run the demonstration
demonstrateV2Features().catch(console.error);
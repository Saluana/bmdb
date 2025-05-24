import { z } from 'zod';
import { TinyDB, SchemaTable, createSchema, vector, MemoryStorage } from '../src';
import { VectorUtils } from '../src/utils/VectorUtils';

// Example 1: Simple document with vector embeddings
const DocumentSchema = createSchema(z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  embedding: vector(z.array(z.number()), 512, 'cosine'), // 512-dimensional vector with cosine similarity
}), 'documents');

// Example 2: Product with features vector
const ProductSchema = createSchema(z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  features: vector(z.array(z.number()), 128, 'euclidean'), // 128-dimensional features vector
  tags: z.array(z.string()),
}), 'products');

// Example 3: User profile with preference vector
const UserSchema = createSchema(z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  preferences: vector(z.array(z.number()), 64, 'dot'), // 64-dimensional preference vector
}), 'users');

async function demonstrateVectorFunctionality() {
  console.log('🚀 Vector Storage and Search Demo\n');

  // Create database with memory storage
  const storage = new MemoryStorage();
  const db = new TinyDB('memory', { storage: MemoryStorage });

  // Create tables with schemas
  const documentsTable = new SchemaTable(storage, DocumentSchema);
  const productsTable = new SchemaTable(storage, ProductSchema);
  const usersTable = new SchemaTable(storage, UserSchema);

  // Example data with vectors
  const documents = [
    {
      id: 'doc1',
      title: 'Machine Learning Basics',
      content: 'Introduction to machine learning concepts...',
      embedding: Array.from({ length: 512 }, () => Math.random() - 0.5) // Random 512-dim vector
    },
    {
      id: 'doc2', 
      title: 'Deep Learning Networks',
      content: 'Understanding neural networks and deep learning...',
      embedding: Array.from({ length: 512 }, () => Math.random() - 0.5)
    },
    {
      id: 'doc3',
      title: 'Natural Language Processing',
      content: 'Text processing and language understanding...',
      embedding: Array.from({ length: 512 }, () => Math.random() - 0.5)
    }
  ];

  const products = [
    {
      id: 'prod1',
      name: 'Gaming Laptop',
      price: 1299.99,
      features: Array.from({ length: 128 }, () => Math.random()),
      tags: ['gaming', 'laptop', 'portable']
    },
    {
      id: 'prod2',
      name: 'Wireless Headphones', 
      price: 199.99,
      features: Array.from({ length: 128 }, () => Math.random()),
      tags: ['audio', 'wireless', 'portable']
    }
  ];

  console.log('📝 Inserting documents with vector embeddings...');
  
  // Insert documents
  for (const doc of documents) {
    documentsTable.insert(doc);
  }
  
  for (const product of products) {
    productsTable.insert(product);
  }

  console.log(`✅ Inserted ${documents.length} documents and ${products.length} products\n`);

  // Auto-create vector indexes
  console.log('🔍 Creating vector indexes...');
  await documentsTable.autoCreateIndexes();
  await productsTable.autoCreateIndexes();
  
  console.log('✅ Vector indexes created\n');

  // Demonstrate vector search
  console.log('🔎 Performing vector similarity search...\n');

  // Search for similar documents
  const queryVector = Array.from({ length: 512 }, () => Math.random() - 0.5);
  console.log('Searching for documents similar to query vector...');
  
  const similarDocs = await documentsTable.vectorSearch('embedding', queryVector, {
    limit: 2,
    threshold: 0.1
  });

  console.log('Similar documents found:');
  for (const result of similarDocs) {
    console.log(`  - ${result.document.title} (similarity: ${result.score.toFixed(4)})`);
  }
  console.log();

  // Search for similar products
  const productQueryVector = Array.from({ length: 128 }, () => Math.random());
  console.log('Searching for products with similar features...');
  
  const similarProducts = await productsTable.vectorSearch('features', productQueryVector, {
    limit: 5
  });

  console.log('Similar products found:');
  for (const result of similarProducts) {
    console.log(`  - ${result.document.name} (similarity: ${result.score.toFixed(4)})`);
  }
  console.log();

  // Demonstrate different similarity algorithms
  console.log('🔬 Testing different similarity algorithms...\n');
  
  const testVector1 = [1, 0, 0];
  const testVector2 = [0, 1, 0];
  const testVector3 = [0.7071, 0.7071, 0]; // 45-degree angle

  console.log('Comparing vectors [1,0,0] vs [0,1,0] vs [0.7071,0.7071,0]:');
  console.log(`Cosine similarity (1 vs 2): ${VectorUtils.cosineSimilarity(testVector1, testVector2).toFixed(4)}`);
  console.log(`Cosine similarity (1 vs 3): ${VectorUtils.cosineSimilarity(testVector1, testVector3).toFixed(4)}`);
  console.log(`Euclidean distance (1 vs 2): ${VectorUtils.euclideanDistance(testVector1, testVector2).toFixed(4)}`);
  console.log(`Euclidean distance (1 vs 3): ${VectorUtils.euclideanDistance(testVector1, testVector3).toFixed(4)}`);
  console.log(`Dot product (1 vs 2): ${VectorUtils.dotProduct(testVector1, testVector2).toFixed(4)}`);
  console.log(`Dot product (1 vs 3): ${VectorUtils.dotProduct(testVector1, testVector3).toFixed(4)}`);
  console.log();

  // Demonstrate vector validation
  console.log('✅ Testing vector validation...\n');
  
  try {
    // This should work
    VectorUtils.validateVector([1, 2, 3], 3);
    console.log('✅ Valid 3D vector passed validation');
  } catch (error) {
    console.log('❌ Unexpected validation error');
  }

  try {
    // This should fail - wrong dimensions
    VectorUtils.validateVector([1, 2], 3);
    console.log('❌ Should not reach here');
  } catch (error) {
    console.log('✅ Invalid vector correctly rejected:', (error as Error).message);
  }

  try {
    // This should fail - invalid values
    VectorUtils.validateVector([1, NaN, 3], 3);
    console.log('❌ Should not reach here');
  } catch (error) {
    console.log('✅ NaN vector correctly rejected:', (error as Error).message);
  }

  console.log();

  // Demonstrate schema validation with vectors
  console.log('📋 Testing schema validation with vectors...\n');

  try {
    // This should work
    const validDoc = {
      id: 'test1',
      title: 'Test Document',
      content: 'This is a test',
      embedding: Array.from({ length: 512 }, () => 0.1)
    };
    documentsTable.insert(validDoc);
    console.log('✅ Valid document with 512D vector inserted successfully');
  } catch (error) {
    console.log('❌ Unexpected error:', (error as Error).message);
  }

  try {
    // This should fail - wrong vector dimensions
    const invalidDoc = {
      id: 'test2',
      title: 'Invalid Document',
      content: 'This should fail',
      embedding: [1, 2, 3] // Only 3 dimensions instead of 512
    };
    documentsTable.insert(invalidDoc);
    console.log('❌ Should not reach here');
  } catch (error) {
    console.log('✅ Invalid vector dimensions correctly rejected:', (error as Error).message);
  }

  console.log();
  console.log('🎉 Vector functionality demonstration complete!');
  console.log('\n📊 Summary:');
  console.log('- ✅ Vector field types and schema integration');
  console.log('- ✅ Vector storage and indexing');
  console.log('- ✅ Multiple similarity algorithms (cosine, euclidean, dot product, manhattan)');
  console.log('- ✅ Fast vector search with configurable limits and thresholds');
  console.log('- ✅ Vector validation and error handling');
  console.log('- ✅ Auto-creation of vector indexes based on schema metadata');
}

// Run the demonstration
demonstrateVectorFunctionality().catch(console.error);
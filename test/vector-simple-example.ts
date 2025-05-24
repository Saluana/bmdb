import { z } from 'zod';
import { SchemaTable, createSchema, vector, MemoryStorage } from '../src';

// Define a schema with vector field
const ImageSchema = createSchema(z.object({
  id: z.string(),
  filename: z.string(),
  description: z.string(),
  embedding: vector(z.array(z.number()), 512) // 512-dimensional embedding
}), 'images');

async function simpleVectorExample() {
  console.log('📸 Simple Vector Search Example\n');
  
  // Create table with vector schema
  const storage = new MemoryStorage();
  const images = new SchemaTable(storage, ImageSchema);
  
  // Insert some images with embeddings
  images.insert({
    id: 'img1',
    filename: 'cat.jpg',
    description: 'A cute cat sitting on a chair',
    embedding: Array.from({ length: 512 }, () => Math.random()) // Mock embedding
  });
  
  images.insert({
    id: 'img2', 
    filename: 'dog.jpg',
    description: 'A happy dog playing in the park',
    embedding: Array.from({ length: 512 }, () => Math.random()) // Mock embedding
  });
  
  images.insert({
    id: 'img3',
    filename: 'bird.jpg', 
    description: 'A colorful bird perched on a branch',
    embedding: Array.from({ length: 512 }, () => Math.random()) // Mock embedding
  });
  
  // Create vector index automatically
  await images.autoCreateIndexes();
  console.log('✅ Vector index created for image embeddings');
  
  // Search for similar images
  const queryEmbedding = Array.from({ length: 512 }, () => Math.random());
  const similarImages = await images.vectorSearch('embedding', queryEmbedding, {
    limit: 2
  });
  
  console.log('\n🔍 Most similar images:');
  for (const result of similarImages) {
    console.log(`- ${result.document.filename}: ${result.document.description} (similarity: ${result.score.toFixed(4)})`);
  }
  
  console.log('\n🎯 That\'s it! Vector search in just a few lines of code.');
}

simpleVectorExample().catch(console.error);
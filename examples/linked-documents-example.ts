import { TinyDB, JSONStorage, createSchema, primaryKey, unique, where } from '../src/index';
import { z } from 'zod';

// Example: Blog system with linked documents and cascade deletes

const db = new TinyDB('./blog.bmdb', { storage: JSONStorage });

// User schema
const userSchema = createSchema(z.object({
    id: unique(primaryKey(z.string().default(() => 
        Date.now().toString() + Math.random().toString(36).substring(2)
    ))),
    username: unique(z.string()),
    email: unique(z.string().email()),
    createdAt: z.date().default(() => new Date()),
}), 'users');

// Post schema
const postSchema = createSchema(z.object({
    id: unique(primaryKey(z.string().default(() => 
        Date.now().toString() + Math.random().toString(36).substring(2)
    ))),
    title: z.string(),
    content: z.string(),
    user_id: z.string(), // Foreign key to users table
    createdAt: z.date().default(() => new Date()),
}), 'posts');

// Comment schema
const commentSchema = createSchema(z.object({
    id: unique(primaryKey(z.string().default(() => 
        Date.now().toString() + Math.random().toString(36).substring(2)
    ))),
    content: z.string(),
    post_id: z.string(), // Foreign key to posts table
    user_id: z.string(), // Foreign key to users table
    createdAt: z.date().default(() => new Date()),
}), 'comments');

// Create schema tables and define relationships
const users = db.schemaTable(userSchema)
    .hasMany('id', 'posts', 'user_id', true)      // Users have many posts (cascade delete ON)
    .hasMany('id', 'comments', 'user_id', true);  // Users have many comments (cascade delete ON)

const posts = db.schemaTable(postSchema)
    .hasMany('id', 'comments', 'post_id', true);  // Posts have many comments (cascade delete ON)

const comments = db.schemaTable(commentSchema);

// With the new relationship system, cascade deletes happen automatically!
// No need for manual helper functions - just delete the parent record

// Example usage
async function blogExample() {
    console.log('=== Blog System with Linked Documents Example ===\n');
    
    // Create users
    const user1Id = users.insert({
        username: 'alice',
        email: 'alice@example.com',
    });
    const alice = users.get(undefined, user1Id);
    
    const user2Id = users.insert({
        username: 'bob',
        email: 'bob@example.com',
    });
    const bob = users.get(undefined, user2Id);
    
    console.log('Created users:', alice.username, bob.username);
    
    // Create posts
    const post1Id = posts.insert({
        title: 'My First Blog Post',
        content: 'This is Alice\'s first post about web development.',
        user_id: alice.id,
    });
    const post1 = posts.get(undefined, post1Id);
    
    const post2Id = posts.insert({
        title: 'Database Design Tips',
        content: 'Bob shares his insights on database design.',
        user_id: bob.id,
    });
    const post2 = posts.get(undefined, post2Id);
    
    console.log('Created posts:', post1.title, post2.title);
    
    // Create comments
    comments.insert({
        content: 'Great post, Alice!',
        post_id: post1.id,
        user_id: bob.id,
    });
    
    comments.insert({
        content: 'Thanks Bob!',
        post_id: post1.id,
        user_id: alice.id,
    });
    
    comments.insert({
        content: 'Very informative, Bob!',
        post_id: post2.id,
        user_id: alice.id,
    });
    
    console.log('Created comments on posts');
    
    // Show initial state
    console.log('\nInitial state:');
    console.log('Users:', users.all().length);
    console.log('Posts:', posts.all().length);
    console.log('Comments:', comments.all().length);
    
    // Demonstrate automatic cascade delete - delete Alice and all her content
    console.log('\nDeleting Alice (automatic cascade will delete all her content)...');
    users.remove(where('id').equals(alice.id));
    
    console.log('\nAfter deleting Alice:');
    console.log('Users:', users.all().length, '(should be 1 - Bob)');
    console.log('Posts:', posts.all().length, '(should be 1 - Bob\'s post)');
    console.log('Comments:', comments.all().length, '(should be 1 - Bob\'s comment)');
    
    // Show remaining data
    const remainingUsers = users.all();
    const remainingPosts = posts.all();
    const remainingComments = comments.all();
    
    console.log('\nRemaining users:', remainingUsers.map(u => u.username));
    console.log('Remaining posts:', remainingPosts.map(p => p.title));
    console.log('Remaining comments:', remainingComments.length);
    
    // Demonstrate post cascade delete
    console.log('\nDeleting Bob\'s post (will automatically delete its comments)...');
    posts.remove(where('id').equals(post2.id));
    
    console.log('\nFinal state:');
    console.log('Users:', users.all().length, '(should be 1 - Bob)');
    console.log('Posts:', posts.all().length, '(should be 0)');
    console.log('Comments:', comments.all().length, '(should be 0)');
    
    db.close();
}

// Run the example
blogExample().catch(console.error);

export { users, posts, comments };
const {TinyDB, JSONStorage, createSchema, primaryKey, unique, where } = require('../dist/index.cjs');
const {z} = require('zod');
const fs = require('fs');

console.log('=== COMPREHENSIVE RELATIONSHIP TEST SUITE ===\n');

let testCount = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(testName, testFn) {
    testCount++;
    try {
        console.log(`\n🧪 TEST ${testCount}: ${testName}`);
        testFn();
        passedTests++;
        console.log(`✅ PASSED`);
    } catch (error) {
        failedTests++;
        console.log(`❌ FAILED: ${error.message}`);
        console.log(`   Stack: ${error.stack?.split('\n')[1]?.trim()}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message} - Expected: ${expected}, Actual: ${actual}`);
    }
}

function createTestDatabase(name = 'test-relationships') {
    const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const dbPath = `./db/${uniqueName}.bmdb`;
    if (fs.existsSync('./db')) {
        fs.rmSync('./db', { recursive: true, force: true });
    }
    fs.mkdirSync('./db', { recursive: true });
    return new TinyDB(dbPath, { storage: JSONStorage });
}

function createTestSchemas(testPrefix = '') {
    const uniqueId = () => testPrefix + '-' + Date.now() + '-' + Math.random().toString(36).substring(2) + '-' + Math.random().toString(36).substring(2);
    
    const userSchema = createSchema(z.object({
        id: unique(primaryKey(z.string().default(() => 'user-' + uniqueId()))),
        name: z.string(),
        email: z.string().email(),
    }), 'users');

    const postSchema = createSchema(z.object({
        id: unique(primaryKey(z.string().default(() => 'post-' + uniqueId()))),
        title: z.string(),
        content: z.string(),
        user_id: z.string(),
    }), 'posts');

    const commentSchema = createSchema(z.object({
        id: unique(primaryKey(z.string().default(() => 'comment-' + uniqueId()))),
        content: z.string(),
        post_id: z.string(),
        user_id: z.string(),
    }), 'comments');

    return { userSchema, postSchema, commentSchema };
}

// TEST SUITE START

runTest('Basic Relationship Definition', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    
    // Test basic relationship definition
    users.hasMany('id', 'posts', 'user_id', true);
    
    const relationships = users.getRelationships();
    assertEqual(relationships.length, 1, 'Should have 1 relationship');
    assertEqual(relationships[0].parentField, 'id', 'Parent field should be id');
    assertEqual(relationships[0].childTable, 'posts', 'Child table should be posts');
    assertEqual(relationships[0].childField, 'user_id', 'Child field should be user_id');
    assertEqual(relationships[0].cascadeDelete, true, 'Cascade delete should be true');
    
    db.close();
});

runTest('Multiple Relationships on Same Table', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema, commentSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    const comments = db.schemaTable(commentSchema);
    
    // Define multiple relationships
    users
        .hasMany('id', 'posts', 'user_id', true)
        .hasMany('id', 'comments', 'user_id', false);
    
    const relationships = users.getRelationships();
    assertEqual(relationships.length, 2, 'Should have 2 relationships');
    
    // Check first relationship
    const postsRel = relationships.find(r => r.childTable === 'posts');
    assert(postsRel, 'Should have posts relationship');
    assertEqual(postsRel.cascadeDelete, true, 'Posts cascade should be true');
    
    // Check second relationship
    const commentsRel = relationships.find(r => r.childTable === 'comments');
    assert(commentsRel, 'Should have comments relationship');
    assertEqual(commentsRel.cascadeDelete, false, 'Comments cascade should be false');
    
    db.close();
});

runTest('Relationship Validation - Invalid Parameters', () => {
    const db = createTestDatabase();
    const { userSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    
    // Test invalid parent field
    try {
        users.hasMany('', 'posts', 'user_id', true);
        throw new Error('Should have thrown error for empty parent field');
    } catch (error) {
        assert(error.message.includes('Invalid parentField'), 'Should validate parent field');
    }
    
    // Test invalid child table
    try {
        users.hasMany('id', '', 'user_id', true);
        throw new Error('Should have thrown error for empty child table');
    } catch (error) {
        assert(error.message.includes('Invalid childTable'), 'Should validate child table');
    }
    
    // Test invalid child field
    try {
        users.hasMany('id', 'posts', '', true);
        throw new Error('Should have thrown error for empty child field');
    } catch (error) {
        assert(error.message.includes('Invalid childField'), 'Should validate child field');
    }
    
    db.close();
});

runTest('Duplicate Relationship Detection', () => {
    const db = createTestDatabase();
    const { userSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    
    // Add first relationship
    users.hasMany('id', 'posts', 'user_id', true);
    assertEqual(users.getRelationships().length, 1, 'Should have 1 relationship');
    
    // Try to add duplicate - should warn but not add
    users.hasMany('id', 'posts', 'user_id', true);
    assertEqual(users.getRelationships().length, 1, 'Should still have 1 relationship (no duplicate)');
    
    db.close();
});

runTest('Basic Cascade Delete', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    
    // Define relationship
    users.hasMany('id', 'posts', 'user_id', true);
    
    // Create test data
    const userDocId = users.insert({ name: 'Alice', email: 'alice@test.com' });
    const user = users.get(undefined, userDocId);
    
    const post1DocId = posts.insert({ title: 'Post 1', content: 'Content 1', user_id: user.id });
    const post2DocId = posts.insert({ title: 'Post 2', content: 'Content 2', user_id: user.id });
    
    // Verify initial state
    assertEqual(users.all().length, 1, 'Should have 1 user');
    assertEqual(posts.all().length, 2, 'Should have 2 posts');
    
    // Delete user - should cascade to posts
    users.remove(where('id').equals(user.id));
    
    // Verify cascade delete
    assertEqual(users.all().length, 0, 'Should have 0 users');
    assertEqual(posts.all().length, 0, 'Should have 0 posts (cascaded)');
    
    db.close();
});

runTest('Cascade Delete Disabled', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    
    // Define relationship with cascade delete OFF
    users.hasMany('id', 'posts', 'user_id', false);
    
    // Create test data
    const userDocId = users.insert({ name: 'Bob', email: 'bob@test.com' });
    const user = users.get(undefined, userDocId);
    
    const postDocId = posts.insert({ title: 'Post 1', content: 'Content 1', user_id: user.id });
    
    // Verify initial state
    assertEqual(users.all().length, 1, 'Should have 1 user');
    assertEqual(posts.all().length, 1, 'Should have 1 post');
    
    // Delete user - should NOT cascade to posts
    users.remove(where('id').equals(user.id));
    
    // Verify no cascade delete
    assertEqual(users.all().length, 0, 'Should have 0 users');
    assertEqual(posts.all().length, 1, 'Should still have 1 post (no cascade)');
    
    db.close();
});

runTest('Multi-level Cascade Delete', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema, commentSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    const comments = db.schemaTable(commentSchema);
    
    // Define relationships
    users.hasMany('id', 'posts', 'user_id', true);
    posts.hasMany('id', 'comments', 'post_id', true);
    
    // Create test data
    const userDocId = users.insert({ name: 'Charlie', email: 'charlie@test.com' });
    const user = users.get(undefined, userDocId);
    
    const postDocId = posts.insert({ title: 'Post 1', content: 'Content 1', user_id: user.id });
    const post = posts.get(undefined, postDocId);
    
    const comment1DocId = comments.insert({ content: 'Comment 1', post_id: post.id, user_id: user.id });
    const comment2DocId = comments.insert({ content: 'Comment 2', post_id: post.id, user_id: user.id });
    
    // Verify initial state
    assertEqual(users.all().length, 1, 'Should have 1 user');
    assertEqual(posts.all().length, 1, 'Should have 1 post');
    assertEqual(comments.all().length, 2, 'Should have 2 comments');
    
    // Delete user - should cascade through posts to comments
    users.remove(where('id').equals(user.id));
    
    // Verify multi-level cascade
    assertEqual(users.all().length, 0, 'Should have 0 users');
    assertEqual(posts.all().length, 0, 'Should have 0 posts (cascaded)');
    assertEqual(comments.all().length, 0, 'Should have 0 comments (cascaded through posts)');
    
    db.close();
});

runTest('findChildren Query Helper', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema } = createTestSchemas('findChildren');
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    
    users.hasMany('id', 'posts', 'user_id', true);
    
    // Create test data
    const user1DocId = users.insert({ name: 'Alice', email: 'alice@test.com' });
    const user1 = users.get(undefined, user1DocId);
    
    const user2DocId = users.insert({ name: 'Bob', email: 'bob@test.com' });
    const user2 = users.get(undefined, user2DocId);
    
    posts.insert({ title: 'Alice Post 1', content: 'Content 1', user_id: user1.id });
    posts.insert({ title: 'Alice Post 2', content: 'Content 2', user_id: user1.id });
    posts.insert({ title: 'Bob Post 1', content: 'Content 3', user_id: user2.id });
    
    // Test findChildren
    const alice_posts = users.findChildren(user1.id, 'posts');
    assertEqual(alice_posts.length, 2, 'Alice should have 2 posts');
    
    const bob_posts = users.findChildren(user2.id, 'posts');
    assertEqual(bob_posts.length, 1, 'Bob should have 1 post');
    
    // Test findChildren without specifying table
    const alice_all_children = users.findChildren(user1.id);
    assertEqual(alice_all_children.length, 2, 'Alice should have 2 total children');
    
    db.close();
});

runTest('countChildren Query Helper', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema, commentSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    const comments = db.schemaTable(commentSchema);
    
    users.hasMany('id', 'posts', 'user_id', true);
    users.hasMany('id', 'comments', 'user_id', true);
    
    // Create test data
    const userDocId = users.insert({ name: 'Alice', email: 'alice@test.com' });
    const user = users.get(undefined, userDocId);
    
    posts.insert({ title: 'Post 1', content: 'Content 1', user_id: user.id });
    posts.insert({ title: 'Post 2', content: 'Content 2', user_id: user.id });
    comments.insert({ content: 'Comment 1', post_id: 'dummy', user_id: user.id });
    
    // Test countChildren for specific table
    assertEqual(users.countChildren(user.id, 'posts'), 2, 'Should count 2 posts');
    assertEqual(users.countChildren(user.id, 'comments'), 1, 'Should count 1 comment');
    
    // Test countChildren for all tables
    assertEqual(users.countChildren(user.id), 3, 'Should count 3 total children');
    
    db.close();
});

runTest('hasChildren Query Helper', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema } = createTestSchemas('hasChildren');
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    
    users.hasMany('id', 'posts', 'user_id', true);
    
    // Create test data
    const user1DocId = users.insert({ name: 'Alice', email: 'alice@test.com' });
    const user1 = users.get(undefined, user1DocId);
    
    const user2DocId = users.insert({ name: 'Bob', email: 'bob@test.com' });
    const user2 = users.get(undefined, user2DocId);
    
    posts.insert({ title: 'Alice Post', content: 'Content', user_id: user1.id });
    
    // Test hasChildren
    assertEqual(users.hasChildren(user1.id, 'posts'), true, 'Alice should have posts');
    assertEqual(users.hasChildren(user2.id, 'posts'), false, 'Bob should not have posts');
    
    assertEqual(users.hasChildren(user1.id), true, 'Alice should have children');
    assertEqual(users.hasChildren(user2.id), false, 'Bob should not have children');
    
    db.close();
});

runTest('Remove Relationship', () => {
    const db = createTestDatabase();
    const { userSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    
    // Add relationships
    users.hasMany('id', 'posts', 'user_id', true);
    users.hasMany('id', 'comments', 'user_id', true);
    
    assertEqual(users.getRelationships().length, 2, 'Should have 2 relationships');
    
    // Remove one relationship
    users.removeRelationship('id', 'posts', 'user_id');
    
    const remaining = users.getRelationships();
    assertEqual(remaining.length, 1, 'Should have 1 relationship remaining');
    assertEqual(remaining[0].childTable, 'comments', 'Should have comments relationship');
    
    // Try to remove non-existent relationship (should not error)
    users.removeRelationship('id', 'nonexistent', 'field');
    assertEqual(users.getRelationships().length, 1, 'Should still have 1 relationship');
    
    db.close();
});

runTest('Clear All Relationships', () => {
    const db = createTestDatabase();
    const { userSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    
    // Add relationships
    users.hasMany('id', 'posts', 'user_id', true);
    users.hasMany('id', 'comments', 'user_id', true);
    users.hasMany('id', 'likes', 'user_id', false);
    
    assertEqual(users.getRelationships().length, 3, 'Should have 3 relationships');
    
    // Clear all relationships
    users.clearRelationships();
    
    assertEqual(users.getRelationships().length, 0, 'Should have 0 relationships');
    
    db.close();
});

runTest('Self-Referencing Relationships', () => {
    const db = createTestDatabase();
    
    const categorySchema = createSchema(z.object({
        id: unique(primaryKey(z.string().default(() => 'cat-' + Date.now() + '-' + Math.random().toString(36).substring(2)))),
        name: z.string(),
        parent_id: z.string().optional(),
    }), 'categories');
    
    const categories = db.schemaTable(categorySchema);
    
    // Define self-referencing relationship (should warn but work)
    categories.hasMany('id', 'categories', 'parent_id', true);
    
    assertEqual(categories.getRelationships().length, 1, 'Should have 1 self-referencing relationship');
    
    // Create test data
    const parentDocId = categories.insert({ name: 'Parent Category' });
    const parent = categories.get(undefined, parentDocId);
    
    const childDocId = categories.insert({ name: 'Child Category', parent_id: parent.id });
    
    // Verify initial state
    assertEqual(categories.all().length, 2, 'Should have 2 categories');
    
    // Delete parent - self-referencing cascade is now disabled for safety
    categories.remove(where('id').equals(parent.id));
    
    // Verify that only the parent is deleted (child remains due to disabled self-referencing cascade)
    assertEqual(categories.all().length, 1, 'Should have 1 category remaining (child - self-referencing cascade disabled)');
    
    db.close();
});

runTest('Truncate with Cascade Delete', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    
    users.hasMany('id', 'posts', 'user_id', true);
    
    // Create test data
    const user1DocId = users.insert({ name: 'Alice', email: 'alice@test.com' });
    const user1 = users.get(undefined, user1DocId);
    
    const user2DocId = users.insert({ name: 'Bob', email: 'bob@test.com' });
    const user2 = users.get(undefined, user2DocId);
    
    posts.insert({ title: 'Post 1', content: 'Content 1', user_id: user1.id });
    posts.insert({ title: 'Post 2', content: 'Content 2', user_id: user2.id });
    
    // Verify initial state
    assertEqual(users.all().length, 2, 'Should have 2 users');
    assertEqual(posts.all().length, 2, 'Should have 2 posts');
    
    // Truncate users - should cascade to all posts
    users.truncate();
    
    // Verify cascade truncate
    assertEqual(users.all().length, 0, 'Should have 0 users');
    assertEqual(posts.all().length, 0, 'Should have 0 posts (cascaded)');
    
    db.close();
});

runTest('Performance with Large Dataset', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    
    users.hasMany('id', 'posts', 'user_id', true);
    
    // Create user with many posts
    const userDocId = users.insert({ name: 'PowerUser', email: 'power@test.com' });
    const user = users.get(undefined, userDocId);
    
    const startTime = Date.now();
    
    // Create 50 posts (moderate size for testing)
    for (let i = 0; i < 50; i++) {
        posts.insert({ 
            title: `Post ${i}`, 
            content: `Content ${i}`, 
            user_id: user.id 
        });
    }
    
    const createTime = Date.now() - startTime;
    console.log(`   📊 Created 50 posts in ${createTime}ms`);
    
    // Test performance of relationship queries
    const queryStart = Date.now();
    const userPosts = users.findChildren(user.id, 'posts');
    const queryTime = Date.now() - queryStart;
    
    assertEqual(userPosts.length, 50, 'Should find all 50 posts');
    console.log(`   📊 Query took ${queryTime}ms`);
    
    // Test cascade delete performance
    const deleteStart = Date.now();
    users.remove(where('id').equals(user.id));
    const deleteTime = Date.now() - deleteStart;
    
    console.log(`   📊 Cascade delete took ${deleteTime}ms`);
    
    // Verify all deleted
    assertEqual(users.all().length, 0, 'Should have 0 users');
    assertEqual(posts.all().length, 0, 'Should have 0 posts');
    
    // Performance assertions (reasonable thresholds)
    assert(createTime < 1000, 'Create time should be reasonable');
    assert(queryTime < 100, 'Query time should be fast');
    assert(deleteTime < 500, 'Delete time should be reasonable');
    
    db.close();
});

runTest('Relationship Persistence Across Restarts', () => {
    const dbPath = './db/persistence-test.bmdb';
    if (fs.existsSync('./db')) {
        fs.rmSync('./db', { recursive: true, force: true });
    }
    fs.mkdirSync('./db', { recursive: true });
    
    // First session - create relationships
    {
        const db = new TinyDB(dbPath, { storage: JSONStorage });
        const { userSchema, postSchema } = createTestSchemas('persistence');
        
        const users = db.schemaTable(userSchema);
        const posts = db.schemaTable(postSchema);
        
        users.hasMany('id', 'posts', 'user_id', true);
        users.hasMany('id', 'comments', 'user_id', false);
        
        assertEqual(users.getRelationships().length, 2, 'Should have 2 relationships');
        
        // Add some data to ensure tables are persisted (empty tables may not be saved)
        users.insert({ name: 'Test User', email: 'test@example.com' });
        posts.insert({ title: 'Test Post', content: 'Test content', user_id: 'test-id' });
        
        db.close();
    }
    
    // Second session - check persistence
    {
        const db = new TinyDB(dbPath, { storage: JSONStorage });
        const { userSchema, postSchema } = createTestSchemas('persistence');
        
        const users = db.schemaTable(userSchema);
        const posts = db.schemaTable(postSchema);
        
        // Relationships should be restored automatically
        const relationships = users.getRelationships();
        assertEqual(relationships.length, 2, 'Should have restored 2 relationships');
        
        const postsRel = relationships.find(r => r.childTable === 'posts');
        const commentsRel = relationships.find(r => r.childTable === 'comments');
        
        assert(postsRel, 'Should have posts relationship');
        assert(commentsRel, 'Should have comments relationship');
        assertEqual(postsRel.cascadeDelete, true, 'Posts cascade should be restored');
        assertEqual(commentsRel.cascadeDelete, false, 'Comments cascade should be restored');
        
        db.close();
    }
    
    // Cleanup
    fs.rmSync('./db', { recursive: true, force: true });
});

runTest('Edge Case: Empty Database Operations', () => {
    const db = createTestDatabase();
    const { userSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    
    users.hasMany('id', 'posts', 'user_id', true);
    
    // Test operations on empty database
    assertEqual(users.findChildren('nonexistent').length, 0, 'Should return empty array for non-existent parent');
    assertEqual(users.countChildren('nonexistent'), 0, 'Should return 0 count for non-existent parent');
    assertEqual(users.hasChildren('nonexistent'), false, 'Should return false for non-existent parent');
    
    // Test deleting from empty database (should not error)
    users.remove(where('id').equals('nonexistent'));
    users.truncate();
    
    db.close();
});

runTest('Edge Case: Null/Undefined Values', () => {
    const db = createTestDatabase();
    const { userSchema, postSchema } = createTestSchemas();
    
    const users = db.schemaTable(userSchema);
    const posts = db.schemaTable(postSchema);
    
    users.hasMany('id', 'posts', 'user_id', true);
    
    // Create user
    const userDocId = users.insert({ name: 'Alice', email: 'alice@test.com' });
    const user = users.get(undefined, userDocId);
    
    // Create posts with various null/undefined references
    posts.insert({ title: 'Post 1', content: 'Content 1', user_id: user.id });
    posts.insert({ title: 'Post 2', content: 'Content 2', user_id: '' }); // empty string
    
    // Test with null/undefined values
    assertEqual(users.findChildren(null).length, 0, 'Should handle null parent ID');
    assertEqual(users.findChildren(undefined).length, 0, 'Should handle undefined parent ID');
    assertEqual(users.countChildren(''), 1, 'Should find the post with empty string user_id');
    assertEqual(users.countChildren('nonexistent'), 0, 'Should handle nonexistent parent ID');
    
    db.close();
});

// TEST SUITE SUMMARY
console.log('\n' + '='.repeat(60));
console.log(`TEST SUITE COMPLETE`);
console.log(`Total Tests: ${testCount}`);
console.log(`Passed: ${passedTests} ✅`);
console.log(`Failed: ${failedTests} ❌`);
console.log(`Success Rate: ${Math.round((passedTests / testCount) * 100)}%`);

if (failedTests === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Relationships are bug-free and ready for production!');
} else {
    console.log('\n⚠️  Some tests failed. Please fix the issues before proceeding.');
    process.exit(1);
}

// Cleanup
if (fs.existsSync('./db')) {
    fs.rmSync('./db', { recursive: true, force: true });
}
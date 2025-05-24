# BmDB Query Guide

A comprehensive guide to querying data in BmDB with examples and best practices.

## Quick Start

```typescript
import { TinyDB, where } from 'bmdb';

const db = new TinyDB('mydb.bmdb');
const users = db.table('users');

// Simple equality query
const user = users.get(where('email').equals('john@example.com'));

// Range query
const adults = users.search(where('age').greaterThanOrEqual(18));

// Complex query with logical operators
const activeAdmins = users.search(
  where('role').equals('admin').and(where('isActive').equals(true))
);
```

## Query Creation

### Using the `where()` Function

The most common way to create queries is using the `where()` function:

```typescript
import { where } from 'bmdb';

// Basic field access
const query = where('fieldName');

// Nested field access
const nestedQuery = where('user.profile.name');
```

### Query Methods

#### Comparison Operations

```typescript
// Equality
where('status').equals('active')        // Exact match
where('status').notEquals('inactive')   // Not equal

// Numeric comparisons
where('age').greaterThan(18)           // age > 18
where('age').greaterThanOrEqual(18)    // age >= 18
where('age').lessThan(65)              // age < 65
where('age').lessThanOrEqual(65)       // age <= 65

// Alternative syntax using aliases
where('age').gte(18)                   // Same as greaterThanOrEqual
where('age').lte(65)                   // Same as lessThanOrEqual
```

#### Text Operations

```typescript
// Regex matching
where('email').matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
where('name').matches('John', 'i')     // Case-insensitive

// Text search
where('description').search('keyword')
where('content').search(/pattern/gi)
```

#### Collection Operations

```typescript
// Check if any element matches
where('tags').any(['javascript', 'typescript'])
where('scores').any(score => score > 90)

// Check if all elements match condition
where('permissions').all(['read', 'write'])
where('grades').all(grade => grade >= 70)

// Check if value is in array
where('category').oneOf(['tech', 'science', 'arts'])
```

#### Existence and Custom Tests

```typescript
// Check if field exists
where('optionalField').exists()

// Custom test function
where('data').test(value => {
  return value && value.length > 0 && value.every(item => item.valid);
})

// Fragment matching (partial object match)
where('user').fragment({ active: true, role: 'admin' })
```

## Logical Operations

### Combining Queries

```typescript
const query1 = where('age').greaterThan(18);
const query2 = where('status').equals('active');
const query3 = where('role').equals('admin');

// AND operation
const activeAdults = query1.and(query2);

// OR operation
const adminOrActive = query3.or(query2);

// NOT operation
const notActive = query2.not();

// Complex combinations
const complexQuery = query1.and(query2.or(query3));
```

### Function-Based Queries

For complex logic, you can use function-based queries:

```typescript
// Simple function query
const customQuery = (doc: any) => {
  return doc.age > 18 && doc.email.includes('@company.com');
};

const employees = users.search(customQuery);

// Advanced function query with multiple conditions
const advancedQuery = (doc: any) => {
  const hasRequiredSkills = doc.skills && 
    ['javascript', 'typescript'].every(skill => doc.skills.includes(skill));
  
  const isExperienced = doc.experience && doc.experience >= 3;
  
  return hasRequiredSkills && isExperienced && doc.location === 'Remote';
};
```

## Query Execution

### Search Operations

```typescript
// Find all matching documents
const allAdults = users.search(where('age').gte(18));

// Find first matching document
const firstAdmin = users.get(where('role').equals('admin'));

// Check if any document matches
const hasAdmins = users.contains(where('role').equals('admin'));

// Count matching documents
const adminCount = users.count(where('role').equals('admin'));
```

### Pagination

```typescript
// Paginated search
const page = users.searchPaginated(where('isActive').equals(true), 1, 20);
console.log(`Found ${page.results.length} of ${page.total} results`);
console.log(`Page ${page.page} of ${page.totalPages}`);

// Navigate pages
const nextPage = users.searchPaginated(query, page.page + 1, 20);
```

### Lazy Loading

For large datasets, use lazy loading to avoid loading all results into memory:

```typescript
const iterator = users.lazy(where('createdAt').gte(lastWeek), {
  pageSize: 100
});

for await (const user of iterator) {
  await processUser(user);
}
```

### Parallel Operations

```typescript
// Parallel search for large datasets
const results = await users.searchParallel(complexQuery, {
  chunkSize: 1000,
  maxConcurrency: 4
});

// Parallel updates
await users.updateParallel([
  [{ lastLogin: new Date() }, where('status').equals('active')],
  [{ status: 'inactive' }, where('lastLogin').lessThan(sixMonthsAgo)]
]);
```

## Data Modification with Queries

### Updates

```typescript
// Update single field
users.update({ status: 'inactive' }, where('lastLogin').lessThan(oneYearAgo));

// Update multiple fields
users.update(
  { status: 'premium', upgradeDate: new Date() },
  where('subscriptionType').equals('trial').and(where('trialExpires').lessThan(now))
);

// Conditional updates
users.update(
  (doc: any) => ({ loginCount: doc.loginCount + 1 }),
  where('email').equals('user@example.com')
);
```

### Deletions

```typescript
// Remove matching documents
users.remove(where('status').equals('deleted'));

// Remove with complex conditions
users.remove(
  where('createdAt').lessThan(fiveYearsAgo)
    .and(where('lastActivity').lessThan(oneYearAgo))
);
```

## Performance Optimization

### Query Caching

BmDB automatically caches query results when possible:

```typescript
// This query will be cached if the query is cacheable
const cachedResults = users.search(where('status').equals('active'));

// Cached queries have hash values for efficient lookups
console.log(query.hash()); // Outputs query hash
```

### Index Usage

For optimal performance, ensure your queries can use indexes:

```typescript
// Good: Uses index on 'email' field
users.get(where('email').equals('john@example.com'));

// Good: Uses compound index on 'category' and 'brand'
products.search(
  where('category').equals('electronics')
    .and(where('brand').equals('Apple'))
);

// Potentially slow: Full table scan
users.search(where('profile.bio').matches(/engineer/i));
```

## Common Patterns

### User Authentication

```typescript
const authenticateUser = (email: string, password: string) => {
  const user = users.get(
    where('email').equals(email)
      .and(where('isActive').equals(true))
  );
  
  return user && verifyPassword(password, user.passwordHash) ? user : null;
};
```

### Content Filtering

```typescript
const getPublishedPosts = (authorId?: string) => {
  let query = where('status').equals('published')
    .and(where('publishedAt').lessThanOrEqual(new Date()));
  
  if (authorId) {
    query = query.and(where('authorId').equals(authorId));
  }
  
  return posts.search(query);
};
```

### Data Validation

```typescript
const findDuplicateEmails = () => {
  const emails = new Map();
  const duplicates = [];
  
  for (const user of users.all()) {
    if (emails.has(user.email)) {
      duplicates.push(user);
    } else {
      emails.set(user.email, user);
    }
  }
  
  return duplicates;
};
```

### Analytics Queries

```typescript
const getUserStats = () => {
  return {
    total: users.count(),
    active: users.count(where('isActive').equals(true)),
    admins: users.count(where('role').equals('admin')),
    recentSignups: users.count(where('createdAt').gte(lastWeek)),
    premiumUsers: users.count(where('subscriptionType').oneOf(['premium', 'enterprise']))
  };
};
```

## Error Handling

```typescript
try {
  const results = users.search(where('invalidField').equals('value'));
} catch (error) {
  if (error.message.includes('Empty query')) {
    console.error('Query path is invalid or empty');
  } else {
    console.error('Query execution failed:', error.message);
  }
}
```

## Best Practices

1. **Use Specific Queries**: More specific queries perform better and use indexes effectively.

2. **Combine Conditions Efficiently**: Put the most selective conditions first in AND operations.

3. **Avoid Complex Text Searches**: Use full-text search solutions for complex text querying.

4. **Use Pagination**: For large result sets, always use pagination or lazy loading.

5. **Cache Query Objects**: Reuse query objects when possible to benefit from caching.

6. **Index Strategic Fields**: Create indexes for frequently queried fields.

7. **Test Query Performance**: Profile your queries with large datasets to identify bottlenecks.

```typescript
// Good: Reusable, cacheable query
const activeUsersQuery = where('isActive').equals(true);
const activeUsers = users.search(activeUsersQuery);
const activeUserCount = users.count(activeUsersQuery);

// Good: Efficient compound condition
const premiumActiveUsers = users.search(
  where('subscriptionType').equals('premium')  // Most selective first
    .and(where('isActive').equals(true))
);
```
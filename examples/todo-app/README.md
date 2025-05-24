# Todo App Example - BmDB

A simple todo application demonstrating the core features of BmDB database.

## Features

- ✅ Add new todos with title and optional description
- 📝 Mark todos as completed/incomplete
- 🔍 Search todos by title or description
- 📊 View statistics (total, active, completed)
- 🗑️ Delete todos
- 📝 Update existing todos

## Quick Start

1. Navigate to the todo app directory:
```bash
cd examples/todo-app
```

2. Install dependencies:
```bash
npm install
```

3. Run the demo:
```bash
npm run demo
```

## Usage

### Basic Todo Operations

```typescript
import { TodoApp } from './todo';

const todoApp = new TodoApp('./my-todos.json');

// Add a new todo
await todoApp.addTodo('Learn BmDB', 'Explore database features');

// Get all todos
const todos = await todoApp.getAllTodos();

// Mark as completed
await todoApp.markCompleted(todoId);

// Search todos
const results = await todoApp.searchTodos('BmDB');

// Delete a todo
await todoApp.deleteTodo(todoId);

// Always close when done
await todoApp.close();
```

### Schema Definition

The todo app uses BmDB's schema system for type safety:

```typescript
const TodoSchema = BmDbSchema.define({
  id: { type: 'number', required: true, unique: true },
  title: { type: 'string', required: true },
  description: { type: 'string', required: false },
  completed: { type: 'boolean', required: true, default: false },
  createdAt: { type: 'date', required: true },
  updatedAt: { type: 'date', required: true }
});
```

## API Reference

### TodoApp Class

#### Constructor
- `new TodoApp(dbPath?: string)` - Creates a new todo app instance

#### Methods
- `addTodo(title: string, description?: string): Promise<Todo>` - Add a new todo
- `getAllTodos(): Promise<Todo[]>` - Get all todos
- `getTodoById(id: number): Promise<Todo | null>` - Get todo by ID
- `getActiveTodos(): Promise<Todo[]>` - Get incomplete todos
- `getCompletedTodos(): Promise<Todo[]>` - Get completed todos
- `markCompleted(id: number): Promise<boolean>` - Mark todo as completed
- `markIncomplete(id: number): Promise<boolean>` - Mark todo as incomplete
- `updateTodo(id: number, updates: Partial<Todo>): Promise<boolean>` - Update todo
- `deleteTodo(id: number): Promise<boolean>` - Delete todo
- `searchTodos(query: string): Promise<Todo[]>` - Search todos
- `displayTodos(): Promise<void>` - Display formatted todo list
- `close(): Promise<void>` - Close database connection

## Files

- `todo.ts` - Main TodoApp class implementation
- `demo.ts` - Interactive demo showcasing features
- `package.json` - Project dependencies and scripts
- `README.md` - This documentation file

## BmDB Features Demonstrated

- **Schema validation** - Type-safe data structure
- **CRUD operations** - Create, read, update, delete
- **Query system** - Where clauses and filtering
- **JSON storage** - Persistent data storage
- **Async operations** - Promise-based API

## Extending the Example

You can extend this example by:

- Adding due dates and priority levels
- Implementing categories/tags
- Adding user authentication
- Creating a web interface
- Adding data export/import features
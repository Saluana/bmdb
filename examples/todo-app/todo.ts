import { z } from 'zod';
import { TinyDB, createSchema, primaryKey, unique } from '../../src/index';

// Define the Todo schema using Zod
const TodoSchema = createSchema(
  z.object({
    id: primaryKey(z.number().int().positive()),
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    completed: z.boolean().default(false),
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date())
  }),
  'todos'
);

// Type inference from schema
type Todo = z.infer<typeof TodoSchema.zodSchema>;

export class TodoApp {
  private db: TinyDB;
  private todos: any;

  constructor(dbPath: string = './todos.json') {
    this.db = new TinyDB(dbPath);
    this.todos = this.db.schemaTable(TodoSchema);
  }

  addTodo(title: string, description?: string): Todo {
    const now = new Date();
    const todo: Omit<Todo, 'id'> = {
      title,
      description,
      completed: false,
      createdAt: now,
      updatedAt: now
    };

    // Get next available ID
    const nextId = this.getNextId();
    const fullTodo = { ...todo, id: nextId };
    
    this.todos.insert(fullTodo);
    console.log(`✅ Added todo: "${title}"`);
    return fullTodo;
  }

  getAllTodos(): Todo[] {
    return this.todos.all().map(doc => doc.toJSON ? doc.toJSON() : doc);
  }

  getTodoById(id: number): Todo | null {
    const result = this.todos.search((doc: any) => doc.id === id);
    if (result.length > 0) {
      const doc = result[0];
      return doc.toJSON ? doc.toJSON() : doc;
    }
    return null;
  }

  getActiveTodos(): Todo[] {
    return this.todos.search((doc: any) => doc.completed === false)
      .map((doc: any) => doc.toJSON ? doc.toJSON() : doc);
  }

  getCompletedTodos(): Todo[] {
    return this.todos.search((doc: any) => doc.completed === true)
      .map((doc: any) => doc.toJSON ? doc.toJSON() : doc);
  }

  markCompleted(id: number): boolean {
    const updated = this.todos.update(
      {
        completed: true,
        updatedAt: new Date()
      },
      (doc: any) => doc.id === id
    );

    if (updated.length > 0) {
      console.log(`✅ Marked todo ${id} as completed`);
      return true;
    }
    
    console.log(`❌ Todo ${id} not found`);
    return false;
  }

  markIncomplete(id: number): boolean {
    const updated = this.todos.update(
      {
        completed: false,
        updatedAt: new Date()
      },
      (doc: any) => doc.id === id
    );

    if (updated.length > 0) {
      console.log(`🔄 Marked todo ${id} as incomplete`);
      return true;
    }
    
    console.log(`❌ Todo ${id} not found`);
    return false;
  }

  updateTodo(id: number, updates: Partial<Pick<Todo, 'title' | 'description'>>): boolean {
    const updated = this.todos.update(
      {
        ...updates,
        updatedAt: new Date()
      },
      (doc: any) => doc.id === id
    );

    if (updated.length > 0) {
      console.log(`📝 Updated todo ${id}`);
      return true;
    }
    
    console.log(`❌ Todo ${id} not found`);
    return false;
  }

  deleteTodo(id: number): boolean {
    const deleted = this.todos.remove((doc: any) => doc.id === id);
    
    if (deleted.length > 0) {
      console.log(`🗑️ Deleted todo ${id}`);
      return true;
    }
    
    console.log(`❌ Todo ${id} not found`);
    return false;
  }

  searchTodos(query: string): Todo[] {
    const allTodos = this.getAllTodos();
    return allTodos.filter(todo => 
      todo.title.toLowerCase().includes(query.toLowerCase()) ||
      (todo.description && todo.description.toLowerCase().includes(query.toLowerCase()))
    );
  }

  displayTodos(): void {
    const todos = this.getAllTodos();
    
    if (todos.length === 0) {
      console.log('📝 No todos found. Add some with addTodo()!');
      return;
    }

    console.log('\n📋 Your Todos:');
    console.log('================');
    
    for (const todo of todos) {
      const status = todo.completed ? '✅' : '⭕';
      const desc = todo.description ? ` - ${todo.description}` : '';
      console.log(`${status} [${todo.id}] ${todo.title}${desc}`);
    }
    
    console.log(`\nTotal: ${todos.length} todos`);
    console.log(`Active: ${todos.filter(t => !t.completed).length}`);
    console.log(`Completed: ${todos.filter(t => t.completed).length}`);
  }

  close(): void {
    this.db.close();
  }

  private getNextId(): number {
    const existingTodos = this.getAllTodos();
    if (existingTodos.length === 0) {
      return 1;
    }
    
    const maxId = Math.max(...existingTodos.map(todo => todo.id));
    return maxId + 1;
  }

  // Get schema information
  getSchemaInfo(): void {
    console.log('📊 Todo Schema Information:');
    console.log('  - Primary key:', this.todos.getPrimaryKey());
    console.log('  - Unique fields:', this.todos.getUniqueFields());
    console.log('  - Total todos:', this.todos.length);
  }
}
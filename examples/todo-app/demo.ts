import { TodoApp } from './todo';

function runDemo() {
  console.log('🚀 Starting Todo App Demo with BmDB');
  console.log('====================================\n');

  // Initialize the todo app
  const todoApp = new TodoApp('./examples/todo-app/todos.json');

  try {
    // Add some sample todos
    console.log('📝 Adding sample todos...\n');
    
    const todo1 = todoApp.addTodo('Learn BmDB', 'Explore the features of BmDB database');
    const todo2 = todoApp.addTodo('Build a todo app', 'Create a sample application using BmDB');
    const todo3 = todoApp.addTodo('Write documentation', 'Document the todo app example');
    const todo4 = todoApp.addTodo('Buy groceries', 'Milk, bread, eggs, and fruits');
    const todo5 = todoApp.addTodo('Exercise', 'Go for a 30-minute run');

    console.log('\n');

    // Display all todos
    todoApp.displayTodos();

    // Mark some todos as completed
    console.log('\n🎯 Completing some todos...\n');
    todoApp.markCompleted(todo1.id);
    todoApp.markCompleted(todo2.id);

    // Display todos again
    console.log('\n');
    todoApp.displayTodos();

    // Search for todos
    console.log('\n🔍 Searching for todos containing "app"...\n');
    const searchResults = todoApp.searchTodos('app');
    console.log('Search results:');
    searchResults.forEach(todo => {
      const status = todo.completed ? '✅' : '⭕';
      console.log(`${status} [${todo.id}] ${todo.title}`);
    });

    // Update a todo
    console.log('\n📝 Updating a todo...\n');
    const activeTodos = todoApp.getActiveTodos();
    if (activeTodos.length > 0) {
      todoApp.updateTodo(activeTodos[0].id, {
        title: 'Updated: ' + activeTodos[0].title,
        description: 'This todo has been updated!'
      });
    }

    // Show final state
    console.log('\n📊 Final state:');
    todoApp.displayTodos();

    // Show statistics
    console.log('\n📈 Statistics:');
    const allTodos = todoApp.getAllTodos();
    const activeTodos2 = todoApp.getActiveTodos();
    const completedTodos = todoApp.getCompletedTodos();
    
    console.log(`Total todos: ${allTodos.length}`);
    console.log(`Active todos: ${activeTodos2.length}`);
    console.log(`Completed todos: ${completedTodos.length}`);

    // Show schema info
    console.log('\n');
    todoApp.getSchemaInfo();

  } catch (error) {
    console.error('❌ Error running demo:', error);
  } finally {
    // Clean up
    todoApp.close();
    console.log('\n🏁 Demo completed!');
  }
}

// Interactive CLI functions
export function interactiveCLI() {
  const todoApp = new TodoApp('./examples/todo-app/todos.json');
  
  console.log('🎯 Interactive Todo CLI');
  console.log('=======================');
  console.log('Available commands:');
  console.log('- list: Show all todos');
  console.log('- add <title> [description]: Add a new todo');
  console.log('- complete <id>: Mark todo as completed');
  console.log('- uncomplete <id>: Mark todo as incomplete');
  console.log('- update <id> <title> [description]: Update a todo');
  console.log('- delete <id>: Delete a todo');
  console.log('- search <query>: Search todos');
  console.log('- exit: Exit the app\n');

  // Note: In a real CLI app, you'd use readline or inquirer for input
  // This is just demonstrating the API
  
  todoApp.close();
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo();
}
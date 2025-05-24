import { TodoApp } from './todo';

function testTodoApp() {
  console.log('🧪 Testing Todo App Implementation');
  console.log('==================================\n');

  try {
    // Test initialization
    console.log('1. Testing initialization...');
    const todoApp = new TodoApp('./examples/todo-app/test-todos.json');
    console.log('✅ TodoApp initialized successfully');

    // Test adding a todo
    console.log('\n2. Testing add todo...');
    const todo1 = todoApp.addTodo('Test todo', 'This is a test');
    console.log('✅ Added todo:', todo1);

    // Test getting all todos
    console.log('\n3. Testing get all todos...');
    const todos = todoApp.getAllTodos();
    console.log('✅ Retrieved todos:', todos);

    // Test marking completed
    console.log('\n4. Testing mark completed...');
    todoApp.markCompleted(todo1.id);
    
    // Test display
    console.log('\n5. Testing display...');
    todoApp.displayTodos();

    // Test search
    console.log('\n6. Testing search...');
    const searchResults = todoApp.searchTodos('test');
    console.log('✅ Search results:', searchResults);

    // Test update
    console.log('\n7. Testing update...');
    todoApp.updateTodo(todo1.id, { title: 'Updated test todo' });

    // Test schema info
    console.log('\n8. Testing schema info...');
    todoApp.getSchemaInfo();

    // Test add multiple todos
    console.log('\n9. Testing multiple todos...');
    todoApp.addTodo('Second todo', 'Another test todo');
    todoApp.addTodo('Third todo');
    
    // Final display
    console.log('\n10. Final state:');
    todoApp.displayTodos();

    // Close
    todoApp.close();
    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    console.error('\nStack trace:');
    console.error(error.stack);
  }
}

// Run the test
testTodoApp();
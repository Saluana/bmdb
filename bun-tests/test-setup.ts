/**
 * Test setup for Bun tests
 */

// Global test utilities
global.testTimeout = 30000;

// Helper functions for tests
export function generateRandomString(length: number = 10): string {
  return Math.random().toString(36).substring(2, length + 2);
}

export function generateRandomNumber(min: number = 1, max: number = 1000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateTestUser(id?: number) {
  return {
    id: id || generateRandomNumber(),
    name: generateRandomString(8),
    email: `${generateRandomString(5)}@test.com`,
    age: generateRandomNumber(18, 80),
    department: ['Engineering', 'Marketing', 'Sales', 'HR'][Math.floor(Math.random() * 4)],
    active: Math.random() > 0.5,
    salary: generateRandomNumber(30000, 200000),
    joinDate: new Date(Date.now() - generateRandomNumber(0, 365 * 5) * 24 * 60 * 60 * 1000)
  };
}

export function generateTestUsers(count: number) {
  return Array.from({ length: count }, (_, i) => generateTestUser(i + 1));
}

// Performance measurement helpers
export function measurePerformance<T>(fn: () => T): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  return { result, duration };
}

export async function measureAsyncPerformance<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}
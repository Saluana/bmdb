/**
 * Connection pool for managing concurrent database operations
 * Provides isolation and resource management for multiple concurrent transactions
 */

export interface PooledConnection<T = any> {
  id: string;
  instance: T;
  isActive: boolean;
  lastUsed: number;
  createdAt: number;
  uses: number;
}

export interface ConnectionPoolOptions {
  maxConnections?: number;
  minConnections?: number;
  maxIdleTime?: number; // ms
  connectionTimeout?: number; // ms
  maxUses?: number; // max uses before connection is recycled
  factory: () => any;
  destroyer?: (connection: any) => void | Promise<void>;
  validator?: (connection: any) => boolean | Promise<boolean>;
}

export class ConnectionPool<T = any> {
  private _connections = new Map<string, PooledConnection<T>>();
  private _availableConnections: string[] = [];
  private _waitingQueue: Array<{
    resolve: (connection: PooledConnection<T>) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private _options: Required<ConnectionPoolOptions>;
  private _nextConnectionId = 1;
  private _isClosing = false;
  private _cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: ConnectionPoolOptions) {
    this._options = {
      maxConnections: 10,
      minConnections: 2,
      maxIdleTime: 30000, // 30 seconds
      connectionTimeout: 5000, // 5 seconds
      maxUses: 1000,
      destroyer: () => {},
      validator: () => true,
      ...options
    };

    // Start with minimum connections
    this._initializeMinConnections();
    
    // Start cleanup process
    this._startCleanup();
  }

  // Get a connection from the pool
  async acquire(timeout?: number): Promise<PooledConnection<T>> {
    if (this._isClosing) {
      throw new Error('Connection pool is closing');
    }

    // Try to get an available connection
    const availableId = this._availableConnections.pop();
    if (availableId) {
      const connection = this._connections.get(availableId);
      if (connection && await this._validateConnection(connection)) {
        connection.isActive = true;
        connection.lastUsed = Date.now();
        connection.uses++;
        return connection;
      } else if (connection) {
        // Connection is invalid, remove it
        this._removeConnection(connection.id);
      }
    }

    // Try to create a new connection if under max limit
    if (this._connections.size < this._options.maxConnections) {
      try {
        const connection = await this._createConnection();
        connection.isActive = true;
        connection.lastUsed = Date.now();
        connection.uses++;
        return connection;
      } catch (error) {
        throw new Error(`Failed to create connection: ${error}`);
      }
    }

    // Wait for a connection to become available
    return this._waitForConnection(timeout || this._options.connectionTimeout);
  }

  // Return a connection to the pool
  async release(connectionOrId: PooledConnection<T> | string): Promise<void> {
    const id = typeof connectionOrId === 'string' ? connectionOrId : connectionOrId.id;
    const connection = this._connections.get(id);

    if (!connection) {
      return; // Connection already removed
    }

    connection.isActive = false;
    connection.lastUsed = Date.now();

    // Check if connection should be recycled
    if (connection.uses >= this._options.maxUses) {
      await this._removeConnection(id);
      // Try to maintain minimum connections
      if (this._connections.size < this._options.minConnections) {
        try {
          await this._createConnection();
        } catch (error) {
          console.warn('Failed to create replacement connection:', error);
        }
      }
    } else {
      // Return to available pool
      this._availableConnections.push(id);
    }

    // Process waiting queue
    this._processWaitingQueue();
  }

  // Get pool statistics
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    availableConnections: number;
    waitingRequests: number;
    maxConnections: number;
    minConnections: number;
  } {
    const activeCount = Array.from(this._connections.values())
      .filter(conn => conn.isActive).length;

    return {
      totalConnections: this._connections.size,
      activeConnections: activeCount,
      availableConnections: this._availableConnections.length,
      waitingRequests: this._waitingQueue.length,
      maxConnections: this._options.maxConnections,
      minConnections: this._options.minConnections
    };
  }

  // Close all connections and shut down the pool
  async close(): Promise<void> {
    this._isClosing = true;

    // Clear cleanup interval
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }

    // Reject all waiting requests
    for (const waiting of this._waitingQueue) {
      waiting.reject(new Error('Connection pool is closing'));
    }
    this._waitingQueue.length = 0;

    // Close all connections
    const closePromises = Array.from(this._connections.values())
      .map(conn => this._removeConnection(conn.id));

    await Promise.all(closePromises);
  }

  // Create a new connection
  private async _createConnection(): Promise<PooledConnection<T>> {
    const id = `conn_${this._nextConnectionId++}`;
    const instance = await this._options.factory();
    
    const connection: PooledConnection<T> = {
      id,
      instance,
      isActive: false,
      lastUsed: Date.now(),
      createdAt: Date.now(),
      uses: 0
    };

    this._connections.set(id, connection);
    return connection;
  }

  // Remove and destroy a connection
  private async _removeConnection(id: string): Promise<void> {
    const connection = this._connections.get(id);
    if (!connection) return;

    this._connections.delete(id);
    
    // Remove from available list if present
    const availableIndex = this._availableConnections.indexOf(id);
    if (availableIndex !== -1) {
      this._availableConnections.splice(availableIndex, 1);
    }

    // Destroy the connection
    try {
      await this._options.destroyer(connection.instance);
    } catch (error) {
      console.warn(`Error destroying connection ${id}:`, error);
    }
  }

  // Validate a connection
  private async _validateConnection(connection: PooledConnection<T>): Promise<boolean> {
    try {
      return await this._options.validator(connection.instance);
    } catch (error) {
      return false;
    }
  }

  // Wait for a connection to become available
  private _waitForConnection(timeout: number): Promise<PooledConnection<T>> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this._waitingQueue.findIndex(w => w.resolve === resolve);
        if (index !== -1) {
          this._waitingQueue.splice(index, 1);
        }
        reject(new Error('Connection acquisition timeout'));
      }, timeout);

      this._waitingQueue.push({
        resolve: (connection) => {
          clearTimeout(timeoutId);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: Date.now()
      });
    });
  }

  // Process the waiting queue
  private _processWaitingQueue(): void {
    while (this._waitingQueue.length > 0 && this._availableConnections.length > 0) {
      const waiting = this._waitingQueue.shift()!;
      const connectionId = this._availableConnections.pop()!;
      const connection = this._connections.get(connectionId);

      if (connection) {
        connection.isActive = true;
        connection.lastUsed = Date.now();
        connection.uses++;
        waiting.resolve(connection);
      } else {
        // Connection was removed, try next one
        continue;
      }
    }
  }

  // Initialize minimum connections
  private async _initializeMinConnections(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < this._options.minConnections; i++) {
      promises.push(
        this._createConnection()
          .then(connection => {
            this._availableConnections.push(connection.id);
          })
          .catch(error => {
            console.warn('Failed to create initial connection:', error);
          })
      );
    }

    await Promise.all(promises);
  }

  // Start cleanup process for idle connections
  private _startCleanup(): void {
    this._cleanupInterval = setInterval(() => {
      this._cleanupIdleConnections();
    }, this._options.maxIdleTime / 2);
  }

  // Clean up idle connections
  private async _cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const connectionsToRemove: string[] = [];

    for (const [id, connection] of this._connections) {
      if (!connection.isActive && 
          (now - connection.lastUsed) > this._options.maxIdleTime &&
          this._connections.size > this._options.minConnections) {
        connectionsToRemove.push(id);
      }
    }

    // Remove idle connections
    for (const id of connectionsToRemove) {
      await this._removeConnection(id);
    }
  }
}

/**
 * Connection pool manager for different types of resources
 */
export class PoolManager {
  private _pools = new Map<string, ConnectionPool>();

  // Create or get a connection pool
  getPool<T>(name: string, options?: ConnectionPoolOptions): ConnectionPool<T> {
    if (!this._pools.has(name)) {
      if (!options) {
        throw new Error(`Pool '${name}' does not exist and no options provided`);
      }
      this._pools.set(name, new ConnectionPool<T>(options));
    }
    return this._pools.get(name) as ConnectionPool<T>;
  }

  // Remove a pool
  async removePool(name: string): Promise<void> {
    const pool = this._pools.get(name);
    if (pool) {
      await pool.close();
      this._pools.delete(name);
    }
  }

  // Get all pool names
  getPoolNames(): string[] {
    return Array.from(this._pools.keys());
  }

  // Get statistics for all pools
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [name, pool] of this._pools) {
      stats[name] = pool.getStats();
    }
    return stats;
  }

  // Close all pools
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this._pools.values()).map(pool => pool.close());
    await Promise.all(closePromises);
    this._pools.clear();
  }
}

// Global pool manager instance
export const poolManager = new PoolManager();
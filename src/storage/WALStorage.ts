import type { Storage } from "./Storage";
import type { JsonObject } from "../utils/types";
import { existsSync, writeFileSync, readFileSync, unlinkSync, renameSync } from "fs";
import { appendFileSync } from "fs";

export interface WALOperation {
  type: 'write' | 'delete' | 'update';
  timestamp: number;
  data: JsonObject;
  id?: string;
}

export class WALStorage implements Storage {
  private walPath: string;
  private dataPath: string;
  private operations: WALOperation[] = [];
  private currentData: JsonObject | null = null;

  constructor(path: string) {
    this.dataPath = path;
    this.walPath = `${path}.wal`;
    this.loadFromWAL();
  }

  private loadFromWAL(): void {
    // Load main data file first
    if (existsSync(this.dataPath)) {
      try {
        const content = readFileSync(this.dataPath, 'utf8');
        this.currentData = content.trim() ? JSON.parse(content) : {};
      } catch {
        this.currentData = {};
      }
    } else {
      this.currentData = {};
    }

    // Apply WAL operations if they exist
    if (existsSync(this.walPath)) {
      try {
        const walContent = readFileSync(this.walPath, 'utf8');
        const lines = walContent.trim().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const operation: WALOperation = JSON.parse(line);
          this.applyOperation(operation);
        }
      } catch (error) {
        console.warn('Failed to load WAL file:', error);
      }
    }
  }

  private applyOperation(operation: WALOperation): void {
    if (!this.currentData) {
      this.currentData = {};
    }

    switch (operation.type) {
      case 'write':
        this.currentData = operation.data;
        break;
      case 'update':
        Object.assign(this.currentData, operation.data);
        break;
      case 'delete':
        this.currentData = {};
        break;
    }
  }

  private appendToWAL(operation: WALOperation): void {
    const operationLine = JSON.stringify(operation) + '\n';
    appendFileSync(this.walPath, operationLine, 'utf8');
    this.operations.push(operation);
  }

  read(): JsonObject | null {
    return this.currentData;
  }

  write(obj: JsonObject): void {
    const operation: WALOperation = {
      type: 'write',
      timestamp: Date.now(),
      data: obj
    };

    // Append to WAL first (crash safety)
    this.appendToWAL(operation);
    
    // Update in-memory data
    this.currentData = obj;
  }

  update(obj: JsonObject): void {
    const operation: WALOperation = {
      type: 'update',
      timestamp: Date.now(),
      data: obj
    };

    // Append to WAL first (crash safety)
    this.appendToWAL(operation);
    
    // Update in-memory data
    if (!this.currentData) {
      this.currentData = {};
    }
    Object.assign(this.currentData, obj);
  }

  delete(): void {
    const operation: WALOperation = {
      type: 'delete',
      timestamp: Date.now(),
      data: {}
    };

    // Append to WAL first (crash safety)
    this.appendToWAL(operation);
    
    // Update in-memory data
    this.currentData = {};
  }

  flush(): void {
    if (this.currentData) {
      // Write current state to main data file
      writeFileSync(this.dataPath, JSON.stringify(this.currentData, null, 2), 'utf8');
    }
  }

  compact(): void {
    // Flush current state to main file
    this.flush();
    
    // Remove WAL file since all operations are now persisted
    if (existsSync(this.walPath)) {
      unlinkSync(this.walPath);
    }
    
    // Clear in-memory operations
    this.operations = [];
  }

  close(): void {
    // Flush and compact on close for crash safety
    this.flush();
    this.compact();
  }

  // Recovery method to check WAL integrity
  checkIntegrity(): boolean {
    if (!existsSync(this.walPath)) {
      return true;
    }

    try {
      const walContent = readFileSync(this.walPath, 'utf8');
      const lines = walContent.trim().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        JSON.parse(line); // Validate JSON
      }
      return true;
    } catch {
      return false;
    }
  }

  // Get WAL size for monitoring
  getWALSize(): number {
    return this.operations.length;
  }

  // Force WAL replay (useful for testing/debugging)
  replay(): void {
    this.operations = [];
    this.loadFromWAL();
  }
}
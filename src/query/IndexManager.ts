/**
 * Index Manager - Coordinates between indexes and query execution
 * Provides index-aware query planning and execution
 */

import { IndexedBTree, type BitmapSet, BitmapUtils } from '../utils/IndexedBTree';
import type { QueryInstance } from './QueryInstance';

export interface IndexableCondition {
  field: string;
  operator: '=' | '>' | '>=' | '<' | '<=' | 'between' | 'in';
  value: any;
  value2?: any; // For BETWEEN operator
}

export interface QueryPlan {
  useIndex: boolean;
  indexField?: string;
  indexConditions: IndexableCondition[];
  fallbackToScan: boolean;
  estimatedSelectivity: number;
  estimatedCost: number;
  executionStrategy: 'index_scan' | 'full_scan' | 'hybrid';
  confidence: number;
  expectedRowCount: number;
}

export interface CostEstimate {
  indexScanCost: number;
  fullScanCost: number;
  hybridScanCost: number;
  confidence: number;
}

export interface FieldStatistics {
  totalDocs: number;
  uniqueValues: number;
  nullCount: number;
  minValue?: any;
  maxValue?: any;
  avgStringLength?: number;
  indexSize?: number;
}

export class IndexManager {
  private indexes = new Map<string, IndexedBTree>();
  private fieldStats = new Map<string, FieldStatistics>();
  private totalDocuments = 0;
  
  // Cost model constants
  private static readonly COST_FULL_SCAN_PER_DOC = 1.0;
  private static readonly COST_INDEX_LOOKUP = 0.1;
  private static readonly COST_INDEX_TRAVERSE = 0.05;
  private static readonly COST_DOCUMENT_FETCH = 0.2;
  private static readonly COST_CONDITION_EVAL = 0.1;

  constructor() {}

  // Create or get index for a field
  getOrCreateIndex(fieldName: string): IndexedBTree {
    let index = this.indexes.get(fieldName);
    if (!index) {
      index = new IndexedBTree(fieldName);
      this.indexes.set(fieldName, index);
    }
    return index;
  }

  // Add document to all relevant indexes
  addDocument(docId: number, document: Record<string, any>): void {
    this.totalDocuments++;
    for (const [field, value] of Object.entries(document)) {
      if (this.isIndexableValue(value)) {
        const index = this.getOrCreateIndex(field);
        index.insert(value, docId);
        
        // Update field stats
        this.updateFieldStats(field, 1, value);
      } else {
        // Still track stats for non-indexable values
        this.updateFieldStats(field, 1, value);
      }
    }
  }

  // Remove document from all relevant indexes
  removeDocument(docId: number, document: Record<string, any>): void {
    this.totalDocuments = Math.max(0, this.totalDocuments - 1);
    for (const [field, value] of Object.entries(document)) {
      if (this.isIndexableValue(value)) {
        const index = this.indexes.get(field);
        if (index) {
          index.remove(value, docId);
        }
        
        // Update field stats
        this.updateFieldStats(field, -1, value);
      } else {
        // Still track stats for non-indexable values
        this.updateFieldStats(field, -1, value);
      }
    }
  }

  // Update document in indexes
  updateDocument(docId: number, oldDocument: Record<string, any>, newDocument: Record<string, any>): void {
    // Remove old values
    this.removeDocument(docId, oldDocument);
    // Add new values
    this.addDocument(docId, newDocument);
  }

  // Estimate query execution costs
  private estimateQueryCosts(conditions: IndexableCondition[]): CostEstimate {
    if (this.totalDocuments === 0) {
      return {
        indexScanCost: 0,
        fullScanCost: 0,
        hybridScanCost: 0,
        confidence: 0
      };
    }

    // Calculate full scan cost
    const fullScanCost = this.totalDocuments * IndexManager.COST_FULL_SCAN_PER_DOC;

    // Calculate best index scan cost
    let bestIndexCost = Infinity;
    let bestSelectivity = 1.0;
    let hasViableIndex = false;

    for (const condition of conditions) {
      if (this.indexes.has(condition.field)) {
        const selectivity = this.estimateSelectivity(condition);
        const expectedRows = Math.ceil(this.totalDocuments * selectivity);
        
        // Cost = index lookup + traverse + document fetch + condition eval
        const indexCost = 
          IndexManager.COST_INDEX_LOOKUP +
          (expectedRows * IndexManager.COST_INDEX_TRAVERSE) +
          (expectedRows * IndexManager.COST_DOCUMENT_FETCH) +
          (expectedRows * IndexManager.COST_CONDITION_EVAL);

        if (indexCost < bestIndexCost) {
          bestIndexCost = indexCost;
          bestSelectivity = selectivity;
          hasViableIndex = true;
        }
      }
    }

    // Calculate hybrid cost (index + verification)
    const hybridCost = hasViableIndex 
      ? bestIndexCost + (this.totalDocuments * bestSelectivity * IndexManager.COST_CONDITION_EVAL)
      : fullScanCost;

    // Confidence based on available statistics
    const fieldsWithStats = conditions.filter(c => this.fieldStats.has(c.field)).length;
    const confidence = fieldsWithStats / Math.max(conditions.length, 1);

    return {
      indexScanCost: hasViableIndex ? bestIndexCost : Infinity,
      fullScanCost,
      hybridScanCost: hybridCost,
      confidence
    };
  }

  // Analyze query and create execution plan
  analyzeQuery(query: QueryInstance<any>): QueryPlan {
    const conditions = this.extractIndexableConditions(query);
    
    // Get cost estimates for different execution strategies
    const costs = this.estimateQueryCosts(conditions);
    
    if (conditions.length === 0) {
      return {
        useIndex: false,
        indexConditions: [],
        fallbackToScan: true,
        estimatedSelectivity: 1.0,
        estimatedCost: costs.fullScanCost,
        executionStrategy: 'full_scan',
        confidence: costs.confidence,
        expectedRowCount: this.totalDocuments
      };
    }

    // Find the most selective condition to use as primary index
    let bestCondition: IndexableCondition | null = null;
    let bestSelectivity = 1.0;
    let bestFieldName = '';

    for (const condition of conditions) {
      const selectivity = this.estimateSelectivity(condition);
      if (selectivity < bestSelectivity && this.indexes.has(condition.field)) {
        bestSelectivity = selectivity;
        bestCondition = condition;
        bestFieldName = condition.field;
      }
    }

    // Cost-based decision making
    const expectedRowCount = Math.ceil(this.totalDocuments * bestSelectivity);
    
    // Choose execution strategy based on costs
    let executionStrategy: 'index_scan' | 'full_scan' | 'hybrid';
    let useIndex = false;
    let estimatedCost = costs.fullScanCost;
    
    if (bestCondition && costs.indexScanCost < costs.fullScanCost) {
      if (costs.indexScanCost < costs.hybridScanCost) {
        executionStrategy = 'index_scan';
        estimatedCost = costs.indexScanCost;
        useIndex = true;
      } else {
        executionStrategy = 'hybrid';
        estimatedCost = costs.hybridScanCost;
        useIndex = true;
      }
    } else {
      executionStrategy = 'full_scan';
      estimatedCost = costs.fullScanCost;
      useIndex = false;
    }

    // Confidence adjustment: lower confidence means bias toward full scan
    if (costs.confidence < 0.5 && useIndex) {
      // If we're not confident in our statistics, be more conservative
      const costThreshold = costs.fullScanCost * 0.3; // Index must be 70% better
      if (estimatedCost > costThreshold) {
        executionStrategy = 'full_scan';
        estimatedCost = costs.fullScanCost;
        useIndex = false;
      }
    }

    return {
      useIndex,
      indexField: bestCondition ? bestFieldName : undefined,
      indexConditions: conditions,
      fallbackToScan: !useIndex,
      estimatedSelectivity: bestSelectivity,
      estimatedCost,
      executionStrategy,
      confidence: costs.confidence,
      expectedRowCount
    };
  }

  // Execute index-aware query
  executeIndexQuery(plan: QueryPlan): BitmapSet | null {
    if (!plan.useIndex || !plan.indexField) {
      return null;
    }

    const index = this.indexes.get(plan.indexField);
    if (!index) {
      return null;
    }

    // Execute primary index condition
    const primaryCondition = plan.indexConditions.find(c => c.field === plan.indexField);
    if (!primaryCondition) {
      return null;
    }

    let resultBitmap = this.executeIndexCondition(index, primaryCondition);
    if (!resultBitmap) {
      return null;
    }

    // Apply other index conditions via intersection
    for (const condition of plan.indexConditions) {
      if (condition === primaryCondition) continue;
      
      const conditionIndex = this.indexes.get(condition.field);
      if (!conditionIndex) continue;

      const conditionBitmap = this.executeIndexCondition(conditionIndex, condition);
      if (conditionBitmap) {
        resultBitmap = BitmapUtils.intersect(resultBitmap, conditionBitmap);
        
        // Early termination if result is empty
        if (BitmapUtils.isEmpty(resultBitmap)) {
          return resultBitmap;
        }
      }
    }

    return resultBitmap;
  }

  // Execute a single index condition
  private executeIndexCondition(index: IndexedBTree, condition: IndexableCondition): BitmapSet | null {
    switch (condition.operator) {
      case '=':
        return index.getExact(condition.value);
      
      case '>':
        return index.getGreaterThan(condition.value, false);
      
      case '>=':
        return index.getGreaterThan(condition.value, true);
      
      case '<':
        return index.getLessThan(condition.value, false);
      
      case '<=':
        return index.getLessThan(condition.value, true);
      
      case 'between':
        if (condition.value2 === undefined) return null;
        return index.getRange(condition.value, condition.value2);
      
      case 'in':
        if (!Array.isArray(condition.value)) return null;
        let result: BitmapSet | null = null;
        for (const value of condition.value) {
          const bitmap = index.getExact(value);
          if (bitmap) {
            result = result ? BitmapUtils.union(result, bitmap) : bitmap;
          }
        }
        return result;
      
      default:
        return null;
    }
  }

  // Extract indexable conditions from query
  private extractIndexableConditions(query: QueryInstance<any>): IndexableCondition[] {
    const conditions: IndexableCondition[] = [];
    
    // Try to extract conditions from query hash
    try {
      const hash = (query as any)._hash;
      if (hash && Array.isArray(hash)) {
        this.extractFromHash(hash, conditions);
      }
    } catch (error) {
      // Query doesn't have extractable conditions
    }

    return conditions;
  }

  // Extract conditions from query hash structure
  private extractFromHash(hash: any, conditions: IndexableCondition[]): void {
    if (!Array.isArray(hash)) return;

    const [operator, ...args] = hash;

    switch (operator) {
      case 'and':
      case 'or':
        // For AND/OR, recursively extract from all branches
        for (const arg of args) {
          if (Array.isArray(arg)) {
            this.extractFromHash(arg, conditions);
          } else if (arg instanceof Set) {
            // Handle Set of conditions
            for (const item of arg) {
              if (Array.isArray(item)) {
                this.extractFromHash(item, conditions);
              }
            }
          }
        }
        break;

      case 'field_op':
        // Extract field operation: ['field_op', field, operator, value]
        if (args.length >= 3) {
          const [field, op, value, value2] = args;
          if (this.isIndexableOperator(op)) {
            conditions.push({
              field: String(field),
              operator: op,
              value,
              value2
            });
          }
        }
        break;

      case 'equals':
        // Extract equality: ['equals', field, value]
        if (args.length >= 2) {
          conditions.push({
            field: String(args[0]),
            operator: '=',
            value: args[1]
          });
        }
        break;

      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        // Extract comparison: ['gt', field, value]
        if (args.length >= 2) {
          const opMap: Record<string, IndexableCondition['operator']> = {
            'gt': '>',
            'gte': '>=',
            'lt': '<',
            'lte': '<='
          };
          conditions.push({
            field: String(args[0]),
            operator: opMap[operator],
            value: args[1]
          });
        }
        break;

      case 'between':
        // Extract range: ['between', field, min, max]
        if (args.length >= 3) {
          conditions.push({
            field: String(args[0]),
            operator: 'between',
            value: args[1],
            value2: args[2]
          });
        }
        break;

      case 'in':
        // Extract IN clause: ['in', field, [values]]
        if (args.length >= 2 && Array.isArray(args[1])) {
          conditions.push({
            field: String(args[0]),
            operator: 'in',
            value: args[1]
          });
        }
        break;
    }
  }

  // Estimate selectivity of a condition (0 = very selective, 1 = no filtering)
  private estimateSelectivity(condition: IndexableCondition): number {
    const stats = this.fieldStats.get(condition.field);
    if (!stats || stats.totalDocs === 0) {
      return 1.0; // Unknown, assume worst case
    }

    switch (condition.operator) {
      case '=':
        // Equality is typically very selective
        return 1 / Math.max(stats.uniqueValues, 1);
      
      case 'in':
        if (Array.isArray(condition.value)) {
          return Math.min(condition.value.length / Math.max(stats.uniqueValues, 1), 1.0);
        }
        return 0.1;
      
      case '>':
      case '>=':
      case '<':
      case '<=':
        // Range queries - estimate 30% selectivity (can be refined with histograms)
        return 0.3;
      
      case 'between':
        // Range queries - estimate 20% selectivity
        return 0.2;
      
      default:
        return 1.0;
    }
  }

  // Check if operator is indexable
  private isIndexableOperator(operator: string): boolean {
    return ['=', '>', '>=', '<', '<=', 'between', 'in'].includes(operator);
  }

  // Check if value can be indexed
  private isIndexableValue(value: any): boolean {
    return value !== null && 
           value !== undefined && 
           (typeof value === 'string' || 
            typeof value === 'number' || 
            typeof value === 'boolean');
  }

  // Update field statistics
  private updateFieldStats(field: string, deltaCount: number, value?: any): void {
    const stats = this.fieldStats.get(field) || {
      totalDocs: 0,
      uniqueValues: 0,
      nullCount: 0,
      avgStringLength: 0
    };
    
    stats.totalDocs += deltaCount;
    
    if (value !== undefined && deltaCount > 0) {
      // Track min/max values for range estimation
      if (typeof value === 'number') {
        stats.minValue = stats.minValue !== undefined ? Math.min(stats.minValue, value) : value;
        stats.maxValue = stats.maxValue !== undefined ? Math.max(stats.maxValue, value) : value;
      }
      
      // Track string length for cost estimation
      if (typeof value === 'string') {
        const currentAvg = stats.avgStringLength || 0;
        const currentCount = stats.totalDocs - deltaCount;
        stats.avgStringLength = ((currentAvg * currentCount) + value.length) / stats.totalDocs;
      }
      
      // Track null values
      if (value === null || value === undefined) {
        stats.nullCount += deltaCount;
      }
      
      // Update index size if available
      const index = this.indexes.get(field);
      if (index) {
        stats.indexSize = index.getStats().totalEntries;
      }
    }
    
    this.fieldStats.set(field, stats);
  }

  // Get all available indexes
  getAvailableIndexes(): string[] {
    return Array.from(this.indexes.keys());
  }

  // Get index statistics
  getIndexStats(fieldName: string): any {
    const index = this.indexes.get(fieldName);
    if (!index) return null;
    
    const stats = index.getStats();
    const fieldStats = this.fieldStats.get(fieldName);
    
    return {
      ...stats,
      fieldStats
    };
  }

  // Clear all indexes
  clearAllIndexes(): void {
    for (const index of this.indexes.values()) {
      index.clear();
    }
    this.indexes.clear();
    this.fieldStats.clear();
    this.totalDocuments = 0;
  }

  // Rebuild index for a field
  rebuildIndex(fieldName: string, documents: Array<{ docId: number; doc: Record<string, any> }>): void {
    const index = this.getOrCreateIndex(fieldName);
    index.clear();
    
    let uniqueValues = new Set();
    let nullCount = 0;
    let minValue: any = undefined;
    let maxValue: any = undefined;
    let totalStringLength = 0;
    let stringCount = 0;
    
    for (const { docId, doc } of documents) {
      const value = doc[fieldName];
      
      if (value === null || value === undefined) {
        nullCount++;
      } else {
        if (this.isIndexableValue(value)) {
          index.insert(value, docId);
          uniqueValues.add(value);
          
          // Track min/max for numbers
          if (typeof value === 'number') {
            minValue = minValue !== undefined ? Math.min(minValue, value) : value;
            maxValue = maxValue !== undefined ? Math.max(maxValue, value) : value;
          }
          
          // Track string lengths
          if (typeof value === 'string') {
            totalStringLength += value.length;
            stringCount++;
          }
        }
      }
    }
    
    const stats: FieldStatistics = {
      totalDocs: documents.length,
      uniqueValues: uniqueValues.size,
      nullCount,
      indexSize: index.getStats().totalEntries
    };
    
    if (minValue !== undefined) stats.minValue = minValue;
    if (maxValue !== undefined) stats.maxValue = maxValue;
    if (stringCount > 0) stats.avgStringLength = totalStringLength / stringCount;
    
    this.fieldStats.set(fieldName, stats);
    
    // Update total documents if rebuilding
    this.totalDocuments = Math.max(this.totalDocuments, documents.length);
  }
}
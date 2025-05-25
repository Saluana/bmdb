/**
 * Comprehensive tests for operations.ts - update operations for TinyDB
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import {
    deleteOp,
    delete_,
    add,
    subtract,
    set,
    increment,
    decrement,
} from '../src/operations';

describe('operations', () => {
    let testDoc: Record<string, any>;

    beforeEach(() => {
        // Reset test document before each test
        testDoc = {
            id: 1,
            name: 'John Doe',
            age: 30,
            salary: 50000,
            active: true,
            score: 100,
            count: 0,
            nested: {
                value: 42,
                text: 'hello',
            },
        };
    });

    describe('deleteOp', () => {
        test('should delete existing field from document', () => {
            const operation = deleteOp('name');
            operation(testDoc);

            expect(testDoc).not.toHaveProperty('name');
            expect(testDoc.id).toBe(1);
            expect(testDoc.age).toBe(30);
        });

        test('should handle deleting non-existent field gracefully', () => {
            const operation = deleteOp('nonExistent');
            operation(testDoc);

            expect(testDoc).not.toHaveProperty('nonExistent');
            expect(Object.keys(testDoc).length).toBe(8); // Should remain unchanged
        });

        test('should delete nested object field', () => {
            const operation = deleteOp('nested');
            operation(testDoc);

            expect(testDoc).not.toHaveProperty('nested');
            expect(testDoc.id).toBe(1);
        });

        test('should handle empty string field name', () => {
            testDoc[''] = 'empty key';
            const operation = deleteOp('');
            operation(testDoc);

            expect(testDoc).not.toHaveProperty('');
        });

        test('should handle null and undefined fields', () => {
            testDoc.nullField = null;
            testDoc.undefinedField = undefined;

            const deleteNull = deleteOp('nullField');
            const deleteUndefined = deleteOp('undefinedField');

            deleteNull(testDoc);
            deleteUndefined(testDoc);

            expect(testDoc).not.toHaveProperty('nullField');
            expect(testDoc).not.toHaveProperty('undefinedField');
        });
    });

    describe('delete_ (Python compatibility)', () => {
        test('should be identical to deleteOp', () => {
            expect(delete_).toBe(deleteOp);
        });

        test('should work the same as deleteOp', () => {
            const operation = delete_('name');
            operation(testDoc);

            expect(testDoc).not.toHaveProperty('name');
        });
    });

    describe('add', () => {
        test('should add positive number to existing numeric field', () => {
            const operation = add('age', 5);
            operation(testDoc);

            expect(testDoc.age).toBe(35);
        });

        test('should add negative number (subtraction)', () => {
            const operation = add('age', -5);
            operation(testDoc);

            expect(testDoc.age).toBe(25);
        });

        test('should add decimal numbers', () => {
            testDoc.price = 10.5;
            const operation = add('price', 2.25);
            operation(testDoc);

            expect(testDoc.price).toBeCloseTo(12.75);
        });

        test('should handle adding zero', () => {
            const operation = add('age', 0);
            operation(testDoc);

            expect(testDoc.age).toBe(30);
        });

        test('should handle large numbers', () => {
            testDoc.bigNumber = Number.MAX_SAFE_INTEGER - 10;
            const operation = add('bigNumber', 5);
            operation(testDoc);

            expect(testDoc.bigNumber).toBe(Number.MAX_SAFE_INTEGER - 5);
        });

        test('should concatenate when adding to string field', () => {
            const operation = add('name', 5);
            operation(testDoc);

            expect(testDoc.name).toBe('John Doe5');
        });

        test('should handle adding to undefined field', () => {
            const operation = add('newField', 10);
            operation(testDoc);

            expect(testDoc.newField).toBeNaN();
        });

        test('should handle negative zero', () => {
            testDoc.value = -0;
            const operation = add('value', 5);
            operation(testDoc);

            expect(testDoc.value).toBe(5);
        });
    });

    describe('subtract', () => {
        test('should subtract positive number from existing numeric field', () => {
            const operation = subtract('age', 5);
            operation(testDoc);

            expect(testDoc.age).toBe(25);
        });

        test('should subtract negative number (addition)', () => {
            const operation = subtract('age', -5);
            operation(testDoc);

            expect(testDoc.age).toBe(35);
        });

        test('should subtract decimal numbers', () => {
            testDoc.price = 10.75;
            const operation = subtract('price', 2.25);
            operation(testDoc);

            expect(testDoc.price).toBeCloseTo(8.5);
        });

        test('should handle subtracting zero', () => {
            const operation = subtract('age', 0);
            operation(testDoc);

            expect(testDoc.age).toBe(30);
        });

        test('should result in negative numbers', () => {
            const operation = subtract('age', 40);
            operation(testDoc);

            expect(testDoc.age).toBe(-10);
        });

        test('should throw or produce NaN when subtracting from non-numeric field', () => {
            const operation = subtract('name', 5);
            operation(testDoc);

            expect(testDoc.name).toBeNaN();
        });

        test('should handle subtracting from undefined field', () => {
            const operation = subtract('newField', 10);
            operation(testDoc);

            expect(testDoc.newField).toBeNaN();
        });
    });

    describe('set', () => {
        test('should set field to new string value', () => {
            const operation = set('name', 'Jane Doe');
            operation(testDoc);

            expect(testDoc.name).toBe('Jane Doe');
        });

        test('should set field to new numeric value', () => {
            const operation = set('age', 25);
            operation(testDoc);

            expect(testDoc.age).toBe(25);
        });

        test('should set field to boolean value', () => {
            const operation = set('active', false);
            operation(testDoc);

            expect(testDoc.active).toBe(false);
        });

        test('should set field to null', () => {
            const operation = set('name', null);
            operation(testDoc);

            expect(testDoc.name).toBeNull();
        });

        test('should set field to undefined', () => {
            const operation = set('name', undefined);
            operation(testDoc);

            expect(testDoc.name).toBeUndefined();
        });

        test('should set field to object', () => {
            const newObj = { key: 'value', number: 42 };
            const operation = set('nested', newObj);
            operation(testDoc);

            expect(testDoc.nested).toEqual(newObj);
        });

        test('should set field to array', () => {
            const newArray = [1, 2, 3, 'test'];
            const operation = set('items', newArray);
            operation(testDoc);

            expect(testDoc.items).toEqual(newArray);
        });

        test('should create new field if it does not exist', () => {
            const operation = set('newField', 'new value');
            operation(testDoc);

            expect(testDoc.newField).toBe('new value');
        });

        test('should overwrite existing field completely', () => {
            const operation = set('nested', 'simple string');
            operation(testDoc);

            expect(testDoc.nested).toBe('simple string');
        });

        test('should handle empty string as value', () => {
            const operation = set('name', '');
            operation(testDoc);

            expect(testDoc.name).toBe('');
        });

        test('should handle empty string as field name', () => {
            const operation = set('', 'empty key value');
            operation(testDoc);

            expect(testDoc['']).toBe('empty key value');
        });
    });

    describe('increment', () => {
        test('should increment existing numeric field by 1', () => {
            const operation = increment('age');
            operation(testDoc);

            expect(testDoc.age).toBe(31);
        });

        test('should increment zero to 1', () => {
            const operation = increment('count');
            operation(testDoc);

            expect(testDoc.count).toBe(1);
        });

        test('should increment negative number', () => {
            testDoc.negative = -5;
            const operation = increment('negative');
            operation(testDoc);

            expect(testDoc.negative).toBe(-4);
        });

        test('should increment decimal number', () => {
            testDoc.decimal = 5.5;
            const operation = increment('decimal');
            operation(testDoc);

            expect(testDoc.decimal).toBeCloseTo(6.5);
        });

        test('should concatenate when incrementing string field', () => {
            const operation = increment('name');
            operation(testDoc);

            expect(testDoc.name).toBe('John Doe1');
        });

        test('should handle incrementing undefined field', () => {
            const operation = increment('newField');
            operation(testDoc);

            expect(testDoc.newField).toBeNaN();
        });

        test('should handle large numbers near MAX_SAFE_INTEGER', () => {
            testDoc.bigNumber = Number.MAX_SAFE_INTEGER - 1;
            const operation = increment('bigNumber');
            operation(testDoc);

            expect(testDoc.bigNumber).toBe(Number.MAX_SAFE_INTEGER);
        });
    });

    describe('decrement', () => {
        test('should decrement existing numeric field by 1', () => {
            const operation = decrement('age');
            operation(testDoc);

            expect(testDoc.age).toBe(29);
        });

        test('should decrement positive number to negative', () => {
            testDoc.small = 0;
            const operation = decrement('small');
            operation(testDoc);

            expect(testDoc.small).toBe(-1);
        });

        test('should decrement negative number', () => {
            testDoc.negative = -5;
            const operation = decrement('negative');
            operation(testDoc);

            expect(testDoc.negative).toBe(-6);
        });

        test('should decrement decimal number', () => {
            testDoc.decimal = 5.5;
            const operation = decrement('decimal');
            operation(testDoc);

            expect(testDoc.decimal).toBeCloseTo(4.5);
        });

        test('should handle decrementing non-numeric field', () => {
            const operation = decrement('name');
            operation(testDoc);

            expect(testDoc.name).toBeNaN();
        });

        test('should handle decrementing undefined field', () => {
            const operation = decrement('newField');
            operation(testDoc);

            expect(testDoc.newField).toBeNaN();
        });

        test('should handle large negative numbers', () => {
            testDoc.bigNegative = -Number.MAX_SAFE_INTEGER + 1;
            const operation = decrement('bigNegative');
            operation(testDoc);

            expect(testDoc.bigNegative).toBe(-Number.MAX_SAFE_INTEGER);
        });
    });

    describe('Edge cases and special scenarios', () => {
        test('should handle operations on empty document', () => {
            const emptyDoc: Record<string, any> = {};

            set('newField', 'value')(emptyDoc);
            expect(emptyDoc).toEqual({ newField: 'value' });

            add('number', 5)(emptyDoc);
            expect(emptyDoc.number).toBeNaN();

            deleteOp('nonExistent')(emptyDoc);
            expect(emptyDoc).toEqual({ newField: 'value', number: NaN });
        });

        test('should handle operations on document with Symbol keys', () => {
            const sym = Symbol('test');
            (testDoc as any)[sym] = 'symbol value';

            const operation = deleteOp(sym.toString());
            operation(testDoc);

            // Should not delete the symbol key since we're using string
            expect((testDoc as any)[sym]).toBe('symbol value');
        });

        test('should handle multiple operations on same field', () => {
            // Chain operations
            add('age', 10)(testDoc);
            expect(testDoc.age).toBe(40);

            subtract('age', 5)(testDoc);
            expect(testDoc.age).toBe(35);

            increment('age')(testDoc);
            expect(testDoc.age).toBe(36);

            decrement('age')(testDoc);
            expect(testDoc.age).toBe(35);

            set('age', 50)(testDoc);
            expect(testDoc.age).toBe(50);

            deleteOp('age')(testDoc);
            expect(testDoc).not.toHaveProperty('age');
        });

        test('should handle operations with special numeric values', () => {
            testDoc.infinity = Infinity;
            testDoc.negInfinity = -Infinity;
            testDoc.notANumber = NaN;

            add('infinity', 1)(testDoc);
            expect(testDoc.infinity).toBe(Infinity);

            subtract('negInfinity', 1)(testDoc);
            expect(testDoc.negInfinity).toBe(-Infinity);

            add('notANumber', 1)(testDoc);
            expect(testDoc.notANumber).toBeNaN();

            increment('infinity')(testDoc);
            expect(testDoc.infinity).toBe(Infinity);

            decrement('negInfinity')(testDoc);
            expect(testDoc.negInfinity).toBe(-Infinity);
        });

        test('should not mutate the original function', () => {
            const operation1 = add('age', 5);
            const operation2 = add('age', 10);

            const doc1 = { age: 20 };
            const doc2 = { age: 30 };

            operation1(doc1);
            operation2(doc2);

            expect(doc1.age).toBe(25);
            expect(doc2.age).toBe(40);
        });

        test('should handle operations on frozen objects (should throw)', () => {
            const frozenDoc = Object.freeze({ ...testDoc });

            expect(() => {
                set('name', 'New Name')(frozenDoc);
            }).toThrow();

            expect(() => {
                deleteOp('name')(frozenDoc);
            }).toThrow();

            expect(() => {
                add('age', 5)(frozenDoc);
            }).toThrow();
        });

        test('should preserve document reference', () => {
            const originalRef = testDoc;

            set('name', 'New Name')(testDoc);
            add('age', 5)(testDoc);
            increment('score')(testDoc);

            expect(testDoc).toBe(originalRef);
            expect(testDoc.name).toBe('New Name');
            expect(testDoc.age).toBe(35);
            expect(testDoc.score).toBe(101);
        });
    });

    describe('Type safety and return values', () => {
        test('operations should return undefined (void)', () => {
            expect(deleteOp('name')(testDoc)).toBeUndefined();
            expect(set('name', 'test')(testDoc)).toBeUndefined();
            expect(add('age', 5)(testDoc)).toBeUndefined();
            expect(subtract('age', 5)(testDoc)).toBeUndefined();
            expect(increment('age')(testDoc)).toBeUndefined();
            expect(decrement('age')(testDoc)).toBeUndefined();
        });

        test('operations should return functions', () => {
            expect(typeof deleteOp('name')).toBe('function');
            expect(typeof set('name', 'test')).toBe('function');
            expect(typeof add('age', 5)).toBe('function');
            expect(typeof subtract('age', 5)).toBe('function');
            expect(typeof increment('age')).toBe('function');
            expect(typeof decrement('age')).toBe('function');
        });
    });
});

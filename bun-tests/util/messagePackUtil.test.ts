import { test, expect, describe, beforeEach } from "bun:test";
import { MessagePackUtil } from "../../src/utils/MessagePackUtil";

describe("MessagePackUtil", () => {
  describe("Basic Types", () => {
    test("should encode and decode null", () => {
      const encoded = MessagePackUtil.encode(null);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toBe(null);
    });

    test("should encode and decode boolean true", () => {
      const encoded = MessagePackUtil.encode(true);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toBe(true);
    });

    test("should encode and decode boolean false", () => {
      const encoded = MessagePackUtil.encode(false);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toBe(false);
    });
  });

  describe("Numbers", () => {
    test("should encode and decode positive fixint (0-127)", () => {
      const values = [0, 1, 42, 127];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode negative fixint (-32 to -1)", () => {
      const values = [-1, -15, -32];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode uint8 (128-255)", () => {
      const values = [128, 200, 255];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode uint16 (256-65535)", () => {
      const values = [256, 1000, 65535];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode uint32 (65536-4294967295)", () => {
      const values = [65536, 1000000, 4294967295];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode int8 (-128 to -33)", () => {
      const values = [-33, -100, -128];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode int16 (-32768 to -129)", () => {
      const values = [-129, -1000, -32768];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode int32 (-2147483648 to -32769)", () => {
      const values = [-32769, -1000000, -2147483648];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode float64", () => {
      const values = [3.14159, -2.718, 0.5, 1.23456789];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBeCloseTo(value, 10);
      }
    });

    test("should handle special float values", () => {
      const values = [Infinity, -Infinity, NaN];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        if (Number.isNaN(value)) {
          expect(Number.isNaN(decoded)).toBe(true);
        } else {
          expect(decoded).toBe(value);
        }
      }
    });
  });

  describe("Strings", () => {
    test("should encode and decode empty string", () => {
      const value = "";
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toBe(value);
    });

    test("should encode and decode fixstr (0-31 bytes)", () => {
      const values = ["a", "hello", "this is a test string"];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should encode and decode str8 (32-255 bytes)", () => {
      const value = "a".repeat(100);
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toBe(value);
    });

    test("should encode and decode str16 (256-65535 bytes)", () => {
      const value = "a".repeat(1000);
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toBe(value);
    });

    test("should encode and decode unicode strings", () => {
      const values = ["🚀", "こんにちは", "🎉🎊✨", "café"];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });
  });

  describe("Arrays", () => {
    test("should encode and decode empty array", () => {
      const value: any[] = [];
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });

    test("should encode and decode fixarray (0-15 elements)", () => {
      const values = [
        [1],
        [1, 2, 3],
        ["a", "b", "c"],
        [1, "hello", true, null],
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
      ];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toEqual(value);
      }
    });

    test("should encode and decode array16 (16-65535 elements)", () => {
      const value = Array.from({ length: 100 }, (_, i) => i);
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });

    test("should encode and decode nested arrays", () => {
      const value = [[1, 2], [3, 4], [[5, 6], [7, 8]]];
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });

  describe("Objects", () => {
    test("should encode and decode empty object", () => {
      const value = {};
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });

    test("should encode and decode fixmap (0-15 keys)", () => {
      const values = [
        { a: 1 },
        { name: "John", age: 30 },
        { x: 1, y: 2, z: 3 },
        { a: 1, b: "hello", c: true, d: null }
      ];
      for (const value of values) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toEqual(value);
      }
    });

    test("should encode and decode map16 (16-65535 keys)", () => {
      const value: Record<string, number> = {};
      for (let i = 0; i < 20; i++) {
        value[`key${i}`] = i;
      }
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });

    test("should encode and decode nested objects", () => {
      const value = {
        user: {
          name: "John",
          profile: {
            age: 30,
            settings: {
              theme: "dark"
            }
          }
        }
      };
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });

  describe("Complex Data Structures", () => {
    test("should handle mixed arrays and objects", () => {
      const value = {
        users: [
          { id: 1, name: "Alice", active: true },
          { id: 2, name: "Bob", active: false }
        ],
        metadata: {
          count: 2,
          tags: ["user", "profile"]
        }
      };
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });

    test("should handle deeply nested structures", () => {
      const value = {
        level1: {
          level2: {
            level3: {
              level4: {
                data: [1, 2, 3, { nested: true }]
              }
            }
          }
        }
      };
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });

    test("should handle arrays with mixed types", () => {
      const value = [
        1,
        "string",
        true,
        null,
        { key: "value" },
        [1, 2, 3],
        3.14
      ];
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });

  describe("Edge Cases", () => {
    test("should handle very large objects", () => {
      const value: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        value[`key${i}`] = i;
      }
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });

    test("should handle very large arrays", () => {
      const value = Array.from({ length: 1000 }, (_, i) => i);
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });

    test("should handle objects with special characters in keys", () => {
      const value = {
        "key with spaces": 1,
        "key-with-dashes": 2,
        "key_with_underscores": 3,
        "🚀": 4
      };
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });

  describe("Error Handling", () => {
    test("should throw error for unsupported types", () => {
      const unsupportedValue = () => {};
      expect(() => MessagePackUtil.encode(unsupportedValue)).toThrow("Unsupported type: function");
    });

    test("should throw error for circular references", () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      expect(() => MessagePackUtil.encode(obj)).toThrow();
    });

    test("should throw error for invalid MessagePack data", () => {
      // Use a reserved/unknown MessagePack type code
      const invalidData = new Uint8Array([0xc1]); // Reserved type in MessagePack spec
      expect(() => MessagePackUtil.decode(invalidData)).toThrow("Unknown MessagePack type: 0xc1");
    });
  });

  describe("Performance and Binary Size", () => {
    test("should produce compact binary representation", () => {
      const value = { id: 1, name: "test" };
      const encoded = MessagePackUtil.encode(value);
      const jsonString = JSON.stringify(value);
      
      // MessagePack should generally be more compact than JSON
      expect(encoded.length).toBeLessThan(jsonString.length);
    });

    test("should handle round-trip consistency", () => {
      const originalValues = [
        { users: [1, 2, 3], active: true },
        [1, "test", { nested: [4, 5, 6] }],
        { count: 100, data: null, valid: false }
      ];

      for (const original of originalValues) {
        const encoded = MessagePackUtil.encode(original);
        const decoded = MessagePackUtil.decode(encoded);
        const reEncoded = MessagePackUtil.encode(decoded);
        const reDecoded = MessagePackUtil.decode(reEncoded);
        
        expect(reDecoded).toEqual(original);
      }
    });
  });

  describe("Type Preservation", () => {
    test("should preserve null vs undefined (null only)", () => {
      const value = { a: null, b: 1 };
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded.a).toBe(null);
      expect(decoded.b).toBe(1);
    });

    test("should preserve number types", () => {
      const value = {
        int: 42,
        float: 3.14,
        negative: -100,
        zero: 0
      };
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      
      expect(decoded.int).toBe(42);
      expect(decoded.float).toBeCloseTo(3.14);
      expect(decoded.negative).toBe(-100);
      expect(decoded.zero).toBe(0);
    });

    test("should preserve array order", () => {
      const value = [3, 1, 4, 1, 5, 9, 2, 6];
      const encoded = MessagePackUtil.encode(value);
      const decoded = MessagePackUtil.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });

  describe("Boundary Value Testing", () => {
    test("should handle integer boundary values correctly", () => {
      const boundaries = [
        // Positive fixint boundaries
        { value: 0, description: "minimum positive fixint" },
        { value: 127, description: "maximum positive fixint" },
        
        // Negative fixint boundaries
        { value: -1, description: "maximum negative fixint" },
        { value: -32, description: "minimum negative fixint" },
        
        // uint8 boundaries
        { value: 128, description: "minimum uint8" },
        { value: 255, description: "maximum uint8" },
        
        // uint16 boundaries
        { value: 256, description: "minimum uint16" },
        { value: 65535, description: "maximum uint16" },
        
        // uint32 boundaries
        { value: 65536, description: "minimum uint32" },
        { value: 4294967295, description: "maximum uint32" },
        
        // int8 boundaries
        { value: -33, description: "maximum int8" },
        { value: -128, description: "minimum int8" },
        
        // int16 boundaries
        { value: -129, description: "maximum int16" },
        { value: -32768, description: "minimum int16" },
        
        // int32 boundaries
        { value: -32769, description: "maximum int32" },
        { value: -2147483648, description: "minimum int32" }
      ];

      for (const { value, description } of boundaries) {
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
      }
    });

    test("should handle string length boundaries", () => {
      const boundaries = [
        { length: 0, type: "empty string" },
        { length: 31, type: "maximum fixstr" },
        { length: 32, type: "minimum str8" },
        { length: 255, type: "maximum str8" },
        { length: 256, type: "minimum str16" },
        { length: 65535, type: "maximum str16" }
      ];

      for (const { length, type } of boundaries) {
        const value = "a".repeat(length);
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(value);
        expect(decoded.length).toBe(length);
      }
    });

    test("should handle array length boundaries", () => {
      const boundaries = [
        { length: 0, type: "empty array" },
        { length: 15, type: "maximum fixarray" },
        { length: 16, type: "minimum array16" },
        { length: 100, type: "medium array16" }
      ];

      for (const { length, type } of boundaries) {
        const value = Array.from({ length }, (_, i) => i);
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toEqual(value);
        expect(decoded.length).toBe(length);
      }
    });

    test("should handle object key count boundaries", () => {
      const boundaries = [
        { keyCount: 0, type: "empty object" },
        { keyCount: 15, type: "maximum fixmap" },
        { keyCount: 16, type: "minimum map16" },
        { keyCount: 50, type: "medium map16" }
      ];

      for (const { keyCount, type } of boundaries) {
        const value: Record<string, number> = {};
        for (let i = 0; i < keyCount; i++) {
          value[`key${i}`] = i;
        }
        const encoded = MessagePackUtil.encode(value);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toEqual(value);
        expect(Object.keys(decoded).length).toBe(keyCount);
      }
    });
  });

  describe("Stress Testing", () => {
    test("should handle maximum depth nesting", () => {
      // Create deeply nested object (within reasonable limits)
      let nested: any = { value: "deep" };
      for (let i = 0; i < 50; i++) {
        nested = { level: i, data: nested };
      }

      const encoded = MessagePackUtil.encode(nested);
      const decoded = MessagePackUtil.decode(encoded);
      
      // Verify the structure is preserved
      let current = decoded;
      for (let i = 49; i >= 0; i--) {
        expect(current.level).toBe(i);
        current = current.data;
      }
      expect(current.value).toBe("deep");
    });

    test("should handle very large string with unicode", () => {
      const unicodeChars = "🚀🎉✨🌟💫⭐🔥💎🎯🎪";
      const largeUnicodeString = unicodeChars.repeat(1000);
      
      const encoded = MessagePackUtil.encode(largeUnicodeString);
      const decoded = MessagePackUtil.decode(encoded);
      
      expect(decoded).toBe(largeUnicodeString);
      expect(decoded.length).toBe(largeUnicodeString.length);
    });

    test("should handle array with many different types", () => {
      const mixedArray = [
        null,
        true,
        false,
        0,
        -1,
        42,
        3.14159,
        -2.718,
        "",
        "hello",
        "🚀",
        [],
        [1, 2, 3],
        {},
        { key: "value" },
        ["nested", { deep: true }]
      ];

      const encoded = MessagePackUtil.encode(mixedArray);
      const decoded = MessagePackUtil.decode(encoded);
      
      expect(decoded).toEqual(mixedArray);
    });

    test("should handle object with many different value types", () => {
      const mixedObject = {
        nullValue: null,
        boolTrue: true,
        boolFalse: false,
        zero: 0,
        negativeInt: -42,
        positiveInt: 42,
        float: 3.14159,
        negativeFloat: -2.718,
        emptyString: "",
        string: "hello world",
        unicode: "🚀🎉✨",
        emptyArray: [],
        numberArray: [1, 2, 3],
        mixedArray: [1, "two", true],
        emptyObject: {},
        nestedObject: { a: 1, b: { c: 2 } }
      };

      const encoded = MessagePackUtil.encode(mixedObject);
      const decoded = MessagePackUtil.decode(encoded);
      
      expect(decoded).toEqual(mixedObject);
    });
  });

  describe("Data Integrity and Validation", () => {
    test("should maintain data integrity across multiple encode/decode cycles", () => {
      const originalData = {
        id: 12345,
        name: "Test User",
        active: true,
        score: 98.5,
        tags: ["user", "premium", "verified"],
        metadata: {
          created: "2024-01-01",
          settings: {
            theme: "dark",
            notifications: true
          }
        }
      };

      // Perform 10 encode/decode cycles
      let current = originalData;
      for (let i = 0; i < 10; i++) {
        const encoded = MessagePackUtil.encode(current);
        current = MessagePackUtil.decode(encoded);
      }

      expect(current).toEqual(originalData);
    });

    test("should handle identical objects correctly", () => {
      const obj = { x: 1, y: 2 };
      const data = [obj, obj, obj]; // Same object reference
      
      const encoded = MessagePackUtil.encode(data);
      const decoded = MessagePackUtil.decode(encoded);
      
      // Should decode to separate but equal objects
      expect(decoded).toEqual([{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 2 }]);
      expect(decoded[0]).toEqual(decoded[1]);
      expect(decoded[1]).toEqual(decoded[2]);
    });

    test("should preserve object key order", () => {
      const obj = { z: 3, a: 1, m: 2, b: 4 };
      const encoded = MessagePackUtil.encode(obj);
      const decoded = MessagePackUtil.decode(encoded);
      
      expect(Object.keys(decoded)).toEqual(Object.keys(obj));
    });

    test("should handle sparse arrays correctly", () => {
      // MessagePack doesn't support undefined, so create a dense array with nulls
      const denseArray = ["first", null, null, null, null, "sixth", null, null, null, null, "eleventh"];
      
      const encoded = MessagePackUtil.encode(denseArray);
      const decoded = MessagePackUtil.decode(encoded);
      
      expect(decoded.length).toBe(11);
      expect(decoded[0]).toBe("first");
      expect(decoded[5]).toBe("sixth");
      expect(decoded[10]).toBe("eleventh");
      expect(decoded).toEqual(denseArray);
    });
  });

  describe("Binary Format Validation", () => {
    test("should produce deterministic output for same input", () => {
      const data = { id: 1, name: "test", values: [1, 2, 3] };
      
      const encoded1 = MessagePackUtil.encode(data);
      const encoded2 = MessagePackUtil.encode(data);
      
      expect(encoded1).toEqual(encoded2);
    });

    test("should use correct MessagePack format codes", () => {
      const testCases = [
        { value: null, expectedFirstByte: 0xc0 },
        { value: false, expectedFirstByte: 0xc2 },
        { value: true, expectedFirstByte: 0xc3 },
        { value: 42, expectedFirstByte: 42 }, // positive fixint
        { value: -1, expectedFirstByte: 0xff }, // negative fixint
        { value: {}, expectedFirstByte: 0x80 }, // fixmap with 0 elements
        { value: [], expectedFirstByte: 0x90 }, // fixarray with 0 elements
        { value: "", expectedFirstByte: 0xa0 } // fixstr with 0 length
      ];

      for (const { value, expectedFirstByte } of testCases) {
        const encoded = MessagePackUtil.encode(value);
        expect(encoded[0]).toBe(expectedFirstByte);
      }
    });

    test("should handle different string encodings correctly", () => {
      const testStrings = [
        "ASCII only",
        "Mixed ASCII and émojis 🚀",
        "Ñoño español",
        "中文字符",
        "العربية",
        "🇺🇸🇪🇸🇫🇷🇩🇪🇯🇵",
        "\n\t\r\0\x01\x02", // Control characters
        "\"'`\\", // Quote and escape characters
      ];

      for (const str of testStrings) {
        const encoded = MessagePackUtil.encode(str);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(str);
      }
    });
  });

  describe("Memory and Performance Edge Cases", () => {
    test("should handle large integers efficiently", () => {
      // Test large integers that fit in the MessagePack integer range
      const largeIntegers = [
        4294967295, // Max uint32
        -2147483648 // Min int32
      ];

      for (const num of largeIntegers) {
        const encoded = MessagePackUtil.encode(num);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBe(num);
      }
    });

    test("should handle empty containers efficiently", () => {
      const emptyContainers = [
        [],
        {},
        "",
        [[], {}, ""]
      ];

      for (const container of emptyContainers) {
        const encoded = MessagePackUtil.encode(container);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toEqual(container);
      }
    });

    test("should handle repeated patterns efficiently", () => {
      const repeatedPattern = {
        pattern: Array(100).fill({ x: 1, y: 2, z: 3 }),
        meta: Array(50).fill("repeated string")
      };

      const encoded = MessagePackUtil.encode(repeatedPattern);
      const decoded = MessagePackUtil.decode(encoded);
      
      expect(decoded).toEqual(repeatedPattern);
    });
  });

  describe("Error Scenarios and Recovery", () => {
    test("should handle truncated data gracefully", () => {
      const originalData = { test: "data", numbers: [1, 2, 3, 4, 5] };
      const encoded = MessagePackUtil.encode(originalData);
      
      // Truncate the encoded data
      const truncated = encoded.slice(0, encoded.length - 5);
      
      expect(() => MessagePackUtil.decode(truncated)).toThrow();
    });

    test("should handle insufficient data for operations", () => {
      // Test with completely empty buffer
      const emptyData = new Uint8Array([]);
      
      expect(() => MessagePackUtil.decode(emptyData)).toThrow();
    });

    test("should handle malformed array length", () => {
      // Create a malformed MessagePack with incorrect array length
      const malformedData = new Uint8Array([0xdc, 0x00, 0x0a]); // array16 with length 10 but no elements follow
      
      expect(() => MessagePackUtil.decode(malformedData)).toThrow();
    });

    test("should handle malformed object length", () => {
      // Create a malformed MessagePack with incorrect object length
      const malformedData = new Uint8Array([0xde, 0x00, 0x05]); // map16 with length 5 but no pairs follow
      
      expect(() => MessagePackUtil.decode(malformedData)).toThrow();
    });

    test("should handle all reserved type codes", () => {
      const reservedCodes = [0xc1, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9]; // Various reserved codes
      
      for (const code of reservedCodes) {
        const invalidData = new Uint8Array([code]);
        expect(() => MessagePackUtil.decode(invalidData)).toThrow();
      }
    });
  });

  describe("Compatibility and Standards Compliance", () => {
    test("should handle all valid MessagePack type ranges", () => {
      // Test all the different type ranges to ensure comprehensive coverage
      const testData = {
        // All integer types
        positiveFixint: 100,
        negativeFixint: -20,
        uint8: 200,
        uint16: 50000,
        uint32: 3000000000,
        int8: -100,
        int16: -20000,
        int32: -2000000000,
        
        // Float
        float64: Math.PI,
        
        // Strings of different sizes
        fixstr: "hello",
        str8: "a".repeat(100),
        str16: "b".repeat(1000),
        
        // Arrays of different sizes
        fixarray: [1, 2, 3],
        array16: Array(100).fill(1),
        
        // Objects of different sizes
        fixmap: { a: 1, b: 2 },
        map16: Object.fromEntries(Array(20).fill(0).map((_, i) => [`key${i}`, i]))
      };

      const encoded = MessagePackUtil.encode(testData);
      const decoded = MessagePackUtil.decode(encoded);
      
      expect(decoded.positiveFixint).toBe(100);
      expect(decoded.negativeFixint).toBe(-20);
      expect(decoded.uint8).toBe(200);
      expect(decoded.uint16).toBe(50000);
      expect(decoded.uint32).toBe(3000000000);
      expect(decoded.int8).toBe(-100);
      expect(decoded.int16).toBe(-20000);
      expect(decoded.int32).toBe(-2000000000);
      expect(decoded.float64).toBeCloseTo(Math.PI);
      expect(decoded.fixstr).toBe("hello");
      expect(decoded.str8).toBe("a".repeat(100));
      expect(decoded.str16).toBe("b".repeat(1000));
      expect(decoded.fixarray).toEqual([1, 2, 3]);
      expect(decoded.array16).toEqual(Array(100).fill(1));
      expect(decoded.fixmap).toEqual({ a: 1, b: 2 });
      expect(Object.keys(decoded.map16)).toHaveLength(20);
    });

    test("should maintain precision for reasonable scientific notation numbers", () => {
      const scientificNumbers = [
        1e-5,
        1e5,
        1.23e-3,
        9.87e3,
        -1.234e-4,
        -5.678e4
      ];

      for (const num of scientificNumbers) {
        const encoded = MessagePackUtil.encode(num);
        const decoded = MessagePackUtil.decode(encoded);
        expect(decoded).toBeCloseTo(num, 6);
      }
    });
  });
});
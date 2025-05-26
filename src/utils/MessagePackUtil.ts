/**
 * MessagePack serialization utilities V2
 * Uses the high-performance msgpackr library for efficient binary serialization
 */

import { pack, unpack } from 'msgpackr';

export class MessagePackUtil {
    /**
     * Fix format codes to match expected MessagePack standards
     * @param data - The encoded data
     * @param original - The original object
     * @returns Fixed encoded data
     */
    private static fixFormatCodes(data: Uint8Array, original: any): Uint8Array {
        // For empty objects, ensure we use fixmap format (0x80) instead of map16 (0xde)
        if (typeof original === 'object' && original !== null && !Array.isArray(original) && Object.keys(original).length === 0) {
            if (data.length >= 3 && data[0] === 0xde && data[1] === 0x00 && data[2] === 0x00) {
                // Replace map16 with fixmap for empty object
                return new Uint8Array([0x80]);
            }
        }
        return data;
    }
    /**
     * Encode an object to MessagePack binary format
     * @param obj - The object to encode
     * @returns Uint8Array containing the encoded data
     */
    static encode(obj: any): Uint8Array {
        // Check for unsupported types
        if (typeof obj === 'function') {
            throw new Error(`Unsupported type: function`);
        }
        if (typeof obj === 'symbol') {
            throw new Error(`Unsupported type: symbol`);
        }
        
        // Check for circular references (only check if it's an object/array)
        if (obj && typeof obj === 'object') {
            const seen = new WeakSet();
            const checkCircular = (value: any, path: string[] = []): void => {
                if (value && typeof value === 'object') {
                    if (seen.has(value)) {
                        throw new Error('Converting circular structure to MessagePack');
                    }
                    seen.add(value);
                    try {
                        if (Array.isArray(value)) {
                            value.forEach((item, index) => checkCircular(item, [...path, String(index)]));
                        } else {
                            Object.entries(value).forEach(([key, val]) => checkCircular(val, [...path, key]));
                        }
                    } finally {
                        seen.delete(value);
                    }
                }
            };
            checkCircular(obj);
        }
        
        try {
            const result = pack(obj);
            // Post-process to fix format codes for compatibility
            return this.fixFormatCodes(result, obj);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to encode object: ${message}`);
        }
    }

    /**
     * Decode MessagePack binary data to an object
     * @param data - The Uint8Array containing MessagePack data
     * @returns The decoded object
     */
    static decode(data: Uint8Array): any {
        // Check for reserved type codes
        if (data.length > 0) {
            const firstByte = data[0];
            const reservedCodes = [0xc1, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9];
            if (reservedCodes.includes(firstByte)) {
                throw new Error(`Unknown MessagePack type: 0x${firstByte.toString(16).padStart(2, '0')}`);
            }
        }
        
        try {
            return unpack(data);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to decode MessagePack data: ${message}`);
        }
    }

    /**
     * Get the size of encoded data without actually encoding
     * @param obj - The object to measure
     * @returns The size in bytes
     */
    static getEncodedSize(obj: any): number {
        return this.encode(obj).length;
    }

    /**
     * Check if data is valid MessagePack format
     * @param data - The data to validate
     * @returns true if valid MessagePack data
     */
    static isValidMessagePack(data: Uint8Array): boolean {
        try {
            this.decode(data);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Encode multiple values into a single MessagePack array
     * @param values - Array of values to encode
     * @returns Uint8Array containing the encoded array
     */
    static encodeArray(values: any[]): Uint8Array {
        return this.encode(values);
    }

    /**
     * Decode MessagePack data expecting an array
     * @param data - The MessagePack data
     * @returns Decoded array
     */
    static decodeArray(data: Uint8Array): any[] {
        const result = this.decode(data);
        if (!Array.isArray(result)) {
            throw new Error('Decoded data is not an array');
        }
        return result;
    }

    /**
     * Encode an object as a MessagePack map
     * @param obj - Object to encode
     * @returns Uint8Array containing the encoded map
     */
    static encodeObject(obj: Record<string, any>): Uint8Array {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            throw new Error('Input must be a non-null object');
        }
        return this.encode(obj);
    }

    /**
     * Decode MessagePack data expecting an object
     * @param data - The MessagePack data
     * @returns Decoded object
     */
    static decodeObject(data: Uint8Array): Record<string, any> {
        const result = this.decode(data);
        if (
            typeof result !== 'object' ||
            result === null ||
            Array.isArray(result)
        ) {
            throw new Error('Decoded data is not an object');
        }
        return result;
    }

    /**
     * Compare two objects by encoding them and comparing the binary data
     * @param obj1 - First object
     * @param obj2 - Second object
     * @returns true if both objects encode to the same binary data
     */
    static binaryCompare(obj1: any, obj2: any): boolean {
        try {
            const encoded1 = this.encode(obj1);
            const encoded2 = this.encode(obj2);

            if (encoded1.length !== encoded2.length) {
                return false;
            }

            for (let i = 0; i < encoded1.length; i++) {
                if (encoded1[i] !== encoded2[i]) {
                    return false;
                }
            }

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create a deep clone of an object using MessagePack serialization
     * @param obj - Object to clone
     * @returns Deep cloned object
     */
    static deepClone<T>(obj: T): T {
        return this.decode(this.encode(obj));
    }

    /**
     * Estimate compression ratio compared to JSON
     * @param obj - Object to analyze
     * @returns Object containing size comparison data
     */
    static compressionAnalysis(obj: any): {
        jsonSize: number;
        messagePackSize: number;
        compressionRatio: number;
        savings: number;
    } {
        const jsonString = JSON.stringify(obj);
        const jsonSize = new TextEncoder().encode(jsonString).length;
        const messagePackSize = this.getEncodedSize(obj);
        const compressionRatio = messagePackSize / jsonSize;
        const savings = jsonSize - messagePackSize;

        return {
            jsonSize,
            messagePackSize,
            compressionRatio,
            savings,
        };
    }
}

// Export msgpackr functions for direct access if needed
export { pack, unpack } from 'msgpackr';

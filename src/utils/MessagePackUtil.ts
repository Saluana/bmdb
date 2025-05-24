/**
 * MessagePack serialization utilities
 * Implements a subset of MessagePack format for efficient binary serialization
 */

// Cached encoder/decoder instances for performance optimization
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class MessagePackUtil {
  // MessagePack format types
  private static readonly FIXMAP_PREFIX = 0x80;
  private static readonly FIXARRAY_PREFIX = 0x90;
  private static readonly FIXSTR_PREFIX = 0xa0;
  private static readonly NIL = 0xc0;
  private static readonly FALSE = 0xc2;
  private static readonly TRUE = 0xc3;
  private static readonly UINT8 = 0xcc;
  private static readonly UINT16 = 0xcd;
  private static readonly UINT32 = 0xce;
  private static readonly INT8 = 0xd0;
  private static readonly INT16 = 0xd1;
  private static readonly INT32 = 0xd2;
  private static readonly FLOAT64 = 0xcb;
  private static readonly STR8 = 0xd9;
  private static readonly STR16 = 0xda;
  private static readonly STR32 = 0xdb;
  private static readonly ARRAY16 = 0xdc;
  private static readonly ARRAY32 = 0xdd;
  private static readonly MAP16 = 0xde;
  private static readonly MAP32 = 0xdf;

  static encode(obj: any): Uint8Array {
    const chunks: Uint8Array[] = [];
    this.encodeValue(obj, chunks);
    
    // Calculate total length
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    
    // Copy all chunks
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result;
  }

  static decode(data: Uint8Array): any {
    const decoder = new MessagePackDecoder(data);
    return decoder.decode();
  }

  private static encodeValue(value: any, chunks: Uint8Array[]): void {
    if (value === null) {
      chunks.push(new Uint8Array([this.NIL]));
    } else if (typeof value === 'boolean') {
      chunks.push(new Uint8Array([value ? this.TRUE : this.FALSE]));
    } else if (typeof value === 'number') {
      this.encodeNumber(value, chunks);
    } else if (typeof value === 'string') {
      this.encodeString(value, chunks);
    } else if (Array.isArray(value)) {
      this.encodeArray(value, chunks);
    } else if (typeof value === 'object') {
      this.encodeObject(value, chunks);
    } else {
      throw new Error(`Unsupported type: ${typeof value}`);
    }
  }

  private static encodeNumber(value: number, chunks: Uint8Array[]): void {
    if (Number.isInteger(value)) {
      if (value >= 0) {
        if (value <= 0x7f) {
          // positive fixint
          chunks.push(new Uint8Array([value]));
        } else if (value <= 0xff) {
          chunks.push(new Uint8Array([this.UINT8, value]));
        } else if (value <= 0xffff) {
          const buf = new Uint8Array(3);
          buf[0] = this.UINT16;
          new DataView(buf.buffer).setUint16(1, value, false);
          chunks.push(buf);
        } else if (value <= 0xffffffff) {
          const buf = new Uint8Array(5);
          buf[0] = this.UINT32;
          new DataView(buf.buffer).setUint32(1, value, false);
          chunks.push(buf);
        }
      } else {
        if (value >= -32) {
          // negative fixint
          chunks.push(new Uint8Array([value & 0xff]));
        } else if (value >= -128) {
          chunks.push(new Uint8Array([this.INT8, value & 0xff]));
        } else if (value >= -32768) {
          const buf = new Uint8Array(3);
          buf[0] = this.INT16;
          new DataView(buf.buffer).setInt16(1, value, false);
          chunks.push(buf);
        } else if (value >= -2147483648) {
          const buf = new Uint8Array(5);
          buf[0] = this.INT32;
          new DataView(buf.buffer).setInt32(1, value, false);
          chunks.push(buf);
        }
      }
    } else {
      // float64
      const buf = new Uint8Array(9);
      buf[0] = this.FLOAT64;
      new DataView(buf.buffer).setFloat64(1, value, false);
      chunks.push(buf);
    }
  }

  private static encodeString(value: string, chunks: Uint8Array[]): void {
    const utf8 = textEncoder.encode(value);
    const length = utf8.length;

    if (length <= 31) {
      // fixstr
      chunks.push(new Uint8Array([this.FIXSTR_PREFIX | length]));
    } else if (length <= 0xff) {
      chunks.push(new Uint8Array([this.STR8, length]));
    } else if (length <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = this.STR16;
      new DataView(buf.buffer).setUint16(1, length, false);
      chunks.push(buf);
    } else if (length <= 0xffffffff) {
      const buf = new Uint8Array(5);
      buf[0] = this.STR32;
      new DataView(buf.buffer).setUint32(1, length, false);
      chunks.push(buf);
    }
    
    chunks.push(utf8);
  }

  private static encodeArray(value: any[], chunks: Uint8Array[]): void {
    const length = value.length;

    if (length <= 15) {
      // fixarray
      chunks.push(new Uint8Array([this.FIXARRAY_PREFIX | length]));
    } else if (length <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = this.ARRAY16;
      new DataView(buf.buffer).setUint16(1, length, false);
      chunks.push(buf);
    } else if (length <= 0xffffffff) {
      const buf = new Uint8Array(5);
      buf[0] = this.ARRAY32;
      new DataView(buf.buffer).setUint32(1, length, false);
      chunks.push(buf);
    }

    for (const item of value) {
      this.encodeValue(item, chunks);
    }
  }

  private static encodeObject(value: Record<string, any>, chunks: Uint8Array[]): void {
    const keys = Object.keys(value);
    const length = keys.length;

    if (length <= 15) {
      // fixmap
      chunks.push(new Uint8Array([this.FIXMAP_PREFIX | length]));
    } else if (length <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = this.MAP16;
      new DataView(buf.buffer).setUint16(1, length, false);
      chunks.push(buf);
    } else if (length <= 0xffffffff) {
      const buf = new Uint8Array(5);
      buf[0] = this.MAP32;
      new DataView(buf.buffer).setUint32(1, length, false);
      chunks.push(buf);
    }

    for (const key of keys) {
      this.encodeValue(key, chunks);
      this.encodeValue(value[key], chunks);
    }
  }
}

class MessagePackDecoder {
  private data: Uint8Array;
  private view: DataView;
  private offset: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  decode(): any {
    const byte = this.data[this.offset++];

    // Positive fixint
    if (byte <= 0x7f) {
      return byte;
    }

    // Fixmap
    if ((byte & 0xf0) === 0x80) {
      return this.decodeMap(byte & 0x0f);
    }

    // Fixarray
    if ((byte & 0xf0) === 0x90) {
      return this.decodeArray(byte & 0x0f);
    }

    // Fixstr
    if ((byte & 0xe0) === 0xa0) {
      return this.decodeString(byte & 0x1f);
    }

    // Negative fixint
    if (byte >= 0xe0) {
      return byte - 0x100;
    }

    switch (byte) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xcc: return this.data[this.offset++];
      case 0xcd: {
        const value = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return value;
      }
      case 0xce: {
        const value = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return value;
      }
      case 0xd0: return this.view.getInt8(this.offset++);
      case 0xd1: {
        const value = this.view.getInt16(this.offset, false);
        this.offset += 2;
        return value;
      }
      case 0xd2: {
        const value = this.view.getInt32(this.offset, false);
        this.offset += 4;
        return value;
      }
      case 0xcb: {
        const value = this.view.getFloat64(this.offset, false);
        this.offset += 8;
        return value;
      }
      case 0xd9: return this.decodeString(this.data[this.offset++]);
      case 0xda: {
        const length = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return this.decodeString(length);
      }
      case 0xdb: {
        const length = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return this.decodeString(length);
      }
      case 0xdc: {
        const length = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return this.decodeArray(length);
      }
      case 0xdd: {
        const length = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return this.decodeArray(length);
      }
      case 0xde: {
        const length = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return this.decodeMap(length);
      }
      case 0xdf: {
        const length = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return this.decodeMap(length);
      }
      default:
        throw new Error(`Unknown MessagePack type: 0x${byte.toString(16)}`);
    }
  }

  private decodeString(length: number): string {
    const bytes = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return textDecoder.decode(bytes);
  }

  private decodeArray(length: number): any[] {
    const result = new Array(length);
    for (let i = 0; i < length; i++) {
      result[i] = this.decode();
    }
    return result;
  }

  private decodeMap(length: number): Record<string, any> {
    const result: Record<string, any> = {};
    for (let i = 0; i < length; i++) {
      const key = this.decode();
      const value = this.decode();
      result[key] = value;
    }
    return result;
  }
}
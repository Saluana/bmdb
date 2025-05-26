/**
 * File system wrapper that uses Bun's native file system when available,
 * falling back to Node.js fs otherwise.
 */

// Runtime detection
const isBun = typeof Bun !== 'undefined';

// Dynamic imports for Node.js
let nodeFs: any = null;
let nodePromisesFs: any = null;

// Initialize Node.js imports if not in Bun
if (!isBun) {
    try {
        nodeFs = require('fs');
        nodePromisesFs = require('fs').promises;
    } catch (error) {
        console.warn('Failed to load Node.js fs module:', error);
    }
}

export class FileSystem {
    /**
     * Check if a file or directory exists
     */
    static exists(path: string): boolean {
        if (isBun) {
            try {
                // For Bun, fallback to Node.js fs.existsSync for consistent sync behavior
                const fs = require('fs');
                return fs.existsSync(path);
            } catch {
                return false;
            }
        } else {
            return nodeFs.existsSync(path);
        }
    }

    /**
     * Read file contents synchronously
     * Note: Bun's file operations are async, so this uses a workaround for sync behavior
     */
    static readSync(path: string, encoding?: BufferEncoding): string | Buffer {
        if (isBun) {
            // For Bun, fall back to Node.js fs for sync operations
            const fs = require('fs');
            if (encoding) {
                return fs.readFileSync(path, encoding);
            } else {
                return fs.readFileSync(path);
            }
        } else {
            if (encoding) {
                return nodeFs.readFileSync(path, encoding);
            } else {
                return nodeFs.readFileSync(path);
            }
        }
    }

    /**
     * Read file contents asynchronously
     */
    static async read(path: string, encoding?: BufferEncoding): Promise<string | Buffer> {
        if (isBun) {
            const file = Bun.file(path);
            if (encoding) {
                return await file.text();
            } else {
                return Buffer.from(await file.arrayBuffer());
            }
        } else {
            if (encoding) {
                return await nodePromisesFs.readFile(path, encoding);
            } else {
                return await nodePromisesFs.readFile(path);
            }
        }
    }

    /**
     * Write file contents synchronously
     * Note: Bun.write is async, so this uses Node.js fs for true sync behavior
     */
    static writeSync(path: string, data: string | Buffer | Uint8Array): void {
        if (isBun) {
            // For Bun, fall back to Node.js fs for sync operations
            const fs = require('fs');
            fs.writeFileSync(path, data);
        } else {
            nodeFs.writeFileSync(path, data);
        }
    }

    /**
     * Write file contents asynchronously
     */
    static async write(path: string, data: string | Buffer | Uint8Array): Promise<void> {
        if (isBun) {
            await Bun.write(path, data);
        } else {
            await nodePromisesFs.writeFile(path, data);
        }
    }

    /**
     * Delete a file
     */
    static unlinkSync(path: string): void {
        if (isBun) {
            // Bun doesn't have a direct unlink API, use Node.js fs
            const fs = require('fs');
            fs.unlinkSync(path);
        } else {
            nodeFs.unlinkSync(path);
        }
    }

    /**
     * Get file stats
     */
    static statSync(path: string): { mtime: Date; size: number } {
        if (isBun) {
            try {
                const file = Bun.file(path);
                return {
                    mtime: new Date((file as any).lastModified),
                    size: (file as any).size
                };
            } catch (error) {
                // Fallback to Node.js fs for compatibility
                const fs = require('fs');
                const stats = fs.statSync(path);
                return {
                    mtime: stats.mtime,
                    size: stats.size
                };
            }
        } else {
            const stats = nodeFs.statSync(path);
            return {
                mtime: stats.mtime,
                size: stats.size
            };
        }
    }

    /**
     * Open file descriptor (for locking)
     */
    static openSync(path: string, flags: string): number {
        if (isBun) {
            // Bun doesn't have file descriptor APIs, fallback to Node.js
            const fs = require('fs');
            return fs.openSync(path, flags);
        } else {
            return nodeFs.openSync(path, flags);
        }
    }

    /**
     * Close file descriptor
     */
    static closeSync(fd: number): void {
        if (isBun) {
            // Bun doesn't have file descriptor APIs, fallback to Node.js
            const fs = require('fs');
            fs.closeSync(fd);
        } else {
            nodeFs.closeSync(fd);
        }
    }

    /**
     * Append data to file synchronously
     */
    static appendSync(path: string, data: string | Buffer | Uint8Array): void {
        if (isBun) {
            // For Bun, fall back to Node.js fs for sync operations
            const fs = require('fs');
            fs.appendFileSync(path, data);
        } else {
            nodeFs.appendFileSync(path, data);
        }
    }

    /**
     * Rename/move file
     */
    static renameSync(oldPath: string, newPath: string): void {
        if (isBun) {
            const fs = require('fs');
            fs.renameSync(oldPath, newPath);
        } else {
            nodeFs.renameSync(oldPath, newPath);
        }
    }

    /**
     * Copy file
     */
    static copyFileSync(src: string, dest: string): void {
        if (isBun) {
            const fs = require('fs');
            fs.copyFileSync(src, dest);
        } else {
            nodeFs.copyFileSync(src, dest);
        }
    }

    /**
     * Get file stats with size
     */
    static fstatSync(fd: number): { size: number } {
        if (isBun) {
            const fs = require('fs');
            return fs.fstatSync(fd);
        } else {
            return nodeFs.fstatSync(fd);
        }
    }

    /**
     * Truncate file to specified size
     */
    static ftruncateSync(fd: number, len: number): void {
        if (isBun) {
            const fs = require('fs');
            fs.ftruncateSync(fd, len);
        } else {
            nodeFs.ftruncateSync(fd, len);
        }
    }

    /**
     * Read from file descriptor
     */
    static readSyncFd(fd: number, buffer: Buffer, offset: number, length: number, position: number): number {
        if (isBun) {
            const fs = require('fs');
            return fs.readSync(fd, buffer, offset, length, position);
        } else {
            return nodeFs.readSync(fd, buffer, offset, length, position);
        }
    }

    /**
     * Write to file descriptor
     */
    static writeSyncFd(fd: number, buffer: Buffer, offset: number, length: number, position: number): number {
        if (isBun) {
            const fs = require('fs');
            return fs.writeSync(fd, buffer, offset, length, position);
        } else {
            return nodeFs.writeSync(fd, buffer, offset, length, position);
        }
    }

    /**
     * Check if running in Bun environment
     */
    static get isBun(): boolean {
        return isBun;
    }

    /**
     * Get environment name
     */
    static get runtime(): 'bun' | 'node' {
        return isBun ? 'bun' : 'node';
    }
}
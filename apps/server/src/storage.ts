// Tiny storage adapter. Default impl writes to a local directory; downstream
// users can swap in S3/R2 by implementing this interface.

import { createReadStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Readable } from 'node:stream';

export interface Storage {
  /** Return a filesystem path the renderer can write to for this key. */
  absolutePath(key: string): Promise<string>;
  /** Open a readable stream for a previously-stored object (or null if missing). */
  openReadable(key: string): Promise<ReadableStream | null>;
}

export class LocalFsStorage implements Storage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = isAbsolute(baseDir) ? baseDir : resolve(baseDir);
  }

  async absolutePath(key: string): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    return join(this.baseDir, key);
  }

  async openReadable(key: string): Promise<ReadableStream | null> {
    const path = join(this.baseDir, key);
    if (!existsSync(path)) return null;
    // Node Readable → Web ReadableStream.
    return Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
  }
}

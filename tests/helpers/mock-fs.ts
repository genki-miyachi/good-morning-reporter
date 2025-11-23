/**
 * Mock filesystem helper for testing
 */

import * as fs from 'node:fs/promises';

export interface MockFS {
  files: Map<string, string>;
}

let mockFS: MockFS | null = null;

/**
 * Set up mock filesystem
 */
export function setupMockFS(): MockFS {
  mockFS = {
    files: new Map(),
  };
  return mockFS;
}

/**
 * Reset mock filesystem
 */
export function resetMockFS(): void {
  mockFS = null;
}

/**
 * Get mock filesystem instance
 */
export function getMockFS(): MockFS | null {
  return mockFS;
}

/**
 * Mock fs.readFile
 */
export async function mockReadFile(
  path: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<string> {
  if (!mockFS) {
    throw new Error('Mock FS not set up');
  }
  const content = mockFS.files.get(path);
  if (content === undefined) {
    throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  }
  return content;
}

/**
 * Mock fs.writeFile
 */
export async function mockWriteFile(
  path: string,
  data: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<void> {
  if (!mockFS) {
    throw new Error('Mock FS not set up');
  }
  mockFS.files.set(path, data);
}


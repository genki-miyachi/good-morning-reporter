/**
 * Mock fetch helper for testing
 */

export interface MockFetchResponse {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Headers | Record<string, string>;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

export type MockFetchHandler = (
  url: string,
  options?: RequestInit
) => MockFetchResponse | Promise<MockFetchResponse>;

let mockHandler: MockFetchHandler | null = null;

/**
 * Set up mock fetch
 */
export function setupMockFetch(handler: MockFetchHandler): void {
  mockHandler = handler;
  // @ts-expect-error - Mocking global fetch
  global.fetch = async (url: string, options?: RequestInit) => {
    const response = await mockHandler!(url, options);
    return {
      ok: response.ok ?? (response.status ? response.status >= 200 && response.status < 300 : true),
      status: response.status ?? 200,
      statusText: response.statusText ?? 'OK',
      headers: response.headers instanceof Headers
        ? response.headers
        : new Headers(response.headers ?? {}),
      json: response.json ?? (async () => ({})),
      text: response.text ?? (async () => ''),
    } as Response;
  };
}

/**
 * Reset mock fetch
 */
export function resetMockFetch(): void {
  mockHandler = null;
  // @ts-expect-error - Resetting global fetch
  delete global.fetch;
}


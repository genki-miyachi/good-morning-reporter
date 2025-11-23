/**
 * Mock Gemini API helper for testing
 */

export interface MockGeminiResponse {
  text: string;
}

export type MockGeminiHandler = (prompt: string) => MockGeminiResponse | Promise<MockGeminiResponse>;

let mockHandler: MockGeminiHandler | null = null;

/**
 * Set up mock Gemini API
 */
export function setupMockGemini(handler: MockGeminiHandler): void {
  mockHandler = handler;
}

/**
 * Reset mock Gemini API
 */
export function resetMockGemini(): void {
  mockHandler = null;
}

/**
 * Get mock Gemini handler
 */
export function getMockGeminiHandler(): MockGeminiHandler | null {
  return mockHandler;
}


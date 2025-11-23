/**
 * Gemini API type definitions
 */

export interface GeminiGenerateContentRequest {
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{
      text: string;
    }>;
  }>;
}

export interface GeminiGenerateContentResponse {
  response: {
    text: () => string;
  };
}

export interface GeminiAPIError extends Error {
  status?: number;
  code?: number;
  response?: {
    status: number;
  };
}


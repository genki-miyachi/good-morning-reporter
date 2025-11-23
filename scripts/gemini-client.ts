/**
 * Gemini API client
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import { GeminiAPIError } from './types/gemini.js';

config();

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_API_KEY is required');
}

const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
console.log(`Using Gemini model: ${modelName}`);
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: modelName });

export interface GenerateMessageOptions {
  timeoutMs?: number;
}

/**
 * Generate message using Gemini API
 */
export async function generateMessage(
  prompt: string,
  { timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || 15000 }: GenerateMessageOptions = {}
): Promise<string> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    });

    const text = result.response.text().trim();
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini API timeout after ${timeoutMs}ms`);
    }

    // Wrap error with status if available
    const apiError = error as GeminiAPIError;
    if (apiError.status || apiError.code) {
      throw apiError;
    }

    throw error;
  } finally {
    clearTimeout(id);
  }
}


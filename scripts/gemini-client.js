import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';

config();

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_API_KEY is required');
}

const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: modelName });

export async function generateMessage(prompt, { timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || 15000 } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
    });

    const text = result.response.text().trim();
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    return text;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Gemini API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
}

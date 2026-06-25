import axios from 'axios';
import { Mistral } from '@mistralai/mistralai';
import Groq from 'groq-sdk';

// --- Types ---
export interface AIResponse {
  text: string;
  source: string;
}

export type APIProvider = 'mistral' | 'groq' | 'together' | 'huggingface';

// --- Cache System ---
class CacheSystem {
  private cache = new Map<string, { response: AIResponse; timestamp: number }>();
  private readonly TTL = 1000 * 60 * 60; // 1 hour

  get(key: string): AIResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  set(key: string, response: AIResponse): void {
    this.cache.set(key, { response, timestamp: Date.now() });
  }
}

// --- Queue Manager ---
class QueueManager {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private readonly maxConcurrency = 2;
  private lastRequestTime = 0;
  private readonly minDelay = 1000; // 1s rate limiting

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          // Rate limiting delay
          const now = Date.now();
          const timeSinceLast = now - this.lastRequestTime;
          if (timeSinceLast < this.minDelay) {
            await new Promise(r => setTimeout(r, this.minDelay - timeSinceLast));
          }
          this.lastRequestTime = Date.now();

          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) return;

    this.activeCount++;
    const task = this.queue.shift();
    if (task) {
      await task();
    }
    this.activeCount--;
    this.process();
  }
}

// --- API Handler ---
class APIHandler {
  private mistral: Mistral;
  private groq: Groq;

  constructor() {
    this.mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || '' });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
  }

  async callMistral(prompt: string, isJson = false, signal?: AbortSignal): Promise<AIResponse> {
    const response = await this.mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      responseFormat: isJson ? { type: "json_object" } : undefined
    }, { signal });

    const content = response.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : (Array.isArray(content) ? content.map(c => (c as any).text || '').join('') : '');

    return {
      text: text || '',
      source: 'mistral'
    };
  }

  async callGroq(prompt: string, isJson = false, signal?: AbortSignal): Promise<AIResponse> {
    const response = await this.groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: isJson ? { type: "json_object" } : undefined
    }, { signal });

    return {
      text: response.choices?.[0]?.message?.content || '',
      source: 'groq'
    };
  }

  async callTogether(prompt: string, isJson = false, signal?: AbortSignal): Promise<AIResponse> {
    const response = await axios.post('https://api.together.xyz/v1/chat/completions', {
      model: "mistralai/Mistral-7B-Instruct-v0.2",
      messages: [{ role: "user", content: prompt }],
      response_format: isJson ? { type: "json_object" } : undefined
    }, {
      headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}` },
      signal
    });

    return {
      text: response.data.choices[0].message.content,
      source: 'together'
    };
  }

  async callHuggingFace(prompt: string, isJson = false, signal?: AbortSignal): Promise<AIResponse> {
    // Note: HF Inference API doesn't strictly support response_format: json_object for all models
    // We'll just pass the prompt and hope for the best, or add "Return JSON" to prompt
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2`,
      { inputs: isJson ? `${prompt}\n\nReturn valid JSON only.` : prompt },
      {
        headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}` },
        signal
      }
    );

    const text = Array.isArray(response.data) 
      ? response.data[0].generated_text 
      : response.data.generated_text;

    return {
      text: text || '',
      source: 'huggingface'
    };
  }
}

// --- Retry & Fallback Manager ---
export class AIManager {
  private queue = new QueueManager();
  private cache = new CacheSystem();
  private handler = new APIHandler();
  private readonly TIMEOUT = 8000; // 8 seconds

  async request(prompt: string, isJson = false, useCache = true): Promise<AIResponse> {
    if (useCache) {
      const cached = this.cache.get(prompt);
      if (cached) return cached;
    }

    return this.queue.add(() => this.executeWithFallback(prompt, isJson));
  }

  private async executeWithFallback(prompt: string, isJson: boolean): Promise<AIResponse> {
    // Stage 1: Parallel Mistral + Groq
    try {
      const result = await this.raceParallel(['mistral', 'groq'], prompt, isJson);
      this.cache.set(prompt, result);
      return result;
    } catch (e) {
      console.warn('[AI MANAGER] Parallel Stage 1 failed, trying Together AI...', e);
    }

    // Stage 2: Together AI
    try {
      const result = await this.retryWithBackoff('together', prompt, isJson);
      this.cache.set(prompt, result);
      return result;
    } catch (e) {
      console.warn('[AI MANAGER] Together AI failed, trying Hugging Face...', e);
    }

    // Stage 3: Hugging Face
    try {
      const result = await this.retryWithBackoff('huggingface', prompt, isJson);
      this.cache.set(prompt, result);
      return result;
    } catch (e) {
      console.error('[AI MANAGER] All AI providers failed.');
      return {
        text: isJson ? '{"error": "All AI providers failed"}' : "I'm currently having trouble connecting to my AI services. Please try again in a moment.",
        source: 'error'
      };
    }
  }

  private async raceParallel(providers: APIProvider[], prompt: string, isJson: boolean): Promise<AIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      const promises = providers.map(p => this.callProvider(p, prompt, isJson, controller.signal));
      
      const first = await Promise.any(promises);
      controller.abort(); // Cancel others
      return first;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async retryWithBackoff(provider: APIProvider, prompt: string, isJson: boolean, maxRetries = 4): Promise<AIResponse> {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      try {
        const result = await this.callProvider(provider, prompt, isJson, controller.signal);
        return result;
      } catch (error: any) {
        const isRateLimit = error.response?.status === 429 || error.message?.includes('429');
        const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout');

        if (i === maxRetries - 1 || (!isRateLimit && !isTimeout)) throw error;

        console.warn(`[AI MANAGER] ${provider} attempt ${i + 1} failed (${error.message}). Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw new Error(`${provider} failed after ${maxRetries} retries`);
  }

  private async callProvider(provider: APIProvider, prompt: string, isJson: boolean, signal: AbortSignal): Promise<AIResponse> {
    switch (provider) {
      case 'mistral': return this.handler.callMistral(prompt, isJson, signal);
      case 'groq': return this.handler.callGroq(prompt, isJson, signal);
      case 'together': return this.handler.callTogether(prompt, isJson, signal);
      case 'huggingface': return this.handler.callHuggingFace(prompt, isJson, signal);
      default: throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

// --- Debounce Utility ---
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export const aiManager = new AIManager();

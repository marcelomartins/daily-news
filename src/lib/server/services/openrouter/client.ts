/**
 * OpenRouter API Client
 * Independent module for communicating with OpenRouter API
 */

import type {
    ChatMessage,
    ChatCompletionRequest,
    ChatCompletionResponse
} from './types';
import { env } from '$env/dynamic/private';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3-next-80b-a3b-instruct:free';
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1500;
const DEFAULT_TIMEOUT_MS = 30000;

class OpenRouterRequestError extends Error {
    status: number;

    constructor(status: number, details: string) {
        super(`OpenRouter API error: ${status} - ${details}`);
        this.status = status;
        this.name = 'OpenRouterRequestError';
    }
}

function parseNonNegativeInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(rawValue || '', 10);
    if (Number.isNaN(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
}

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(rawValue || '', 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function parseFallbackModels(rawModels: string | undefined): string[] {
    if (!rawModels) {
        return [];
    }

    return rawModels
        .split(',')
        .map(model => model.trim())
        .filter(Boolean);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class OpenRouterClient {
    private apiKey: string;
    private model: string;
    private maxRetries: number;
    private retryDelayMs: number;
    private fallbackModels: string[];
    private requestTimeoutMs: number;

    constructor(apiKey?: string, model?: string) {
        const dedicatedHeadlinesKey = env.HEADLINES_OPENROUTER_API_KEY || '';

        this.apiKey = apiKey || dedicatedHeadlinesKey || env.OPENROUTER_API_KEY || '';
        this.model = model || env.OPENROUTER_MODEL || DEFAULT_MODEL;
        this.maxRetries = parseNonNegativeInt(env.OPENROUTER_MAX_RETRIES, DEFAULT_MAX_RETRIES);
        this.retryDelayMs = parseNonNegativeInt(env.OPENROUTER_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS);
        this.fallbackModels = parseFallbackModels(env.OPENROUTER_FALLBACK_MODELS);
        this.requestTimeoutMs = parsePositiveInt(env.OPENROUTER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

        if (dedicatedHeadlinesKey) {
            console.log('[OpenRouter] Using HEADLINES_OPENROUTER_API_KEY for requests');
        }

        if (!this.apiKey) {
            console.warn('[OpenRouter] API key not configured. Set OPENROUTER_API_KEY environment variable.');
        }
    }

    /**
     * Check if the client is properly configured
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Send a chat completion request to OpenRouter
     */
    async chat(
        messages: ChatMessage[],
        options?: { model?: string; temperature?: number; maxTokens?: number }
    ): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error('OpenRouter API key not configured');
        }

        const selectedModel = options?.model || this.model;
        const modelsToTry = [
            selectedModel,
            ...this.fallbackModels.filter(modelName => modelName !== selectedModel)
        ];

        let lastError: Error | null = null;

        for (const modelName of modelsToTry) {
            try {
                return await this.chatWithRetries(messages, modelName, options);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                const isAuthError =
                    error instanceof OpenRouterRequestError &&
                    (error.status === 401 || error.status === 403);

                if (isAuthError) {
                    break;
                }

                if (modelName !== modelsToTry[modelsToTry.length - 1]) {
                    console.warn(
                        `[OpenRouter] Model "${modelName}" failed, trying fallback model...`
                    );
                }
            }
        }

        throw lastError || new Error('OpenRouter request failed');
    }

    private async chatWithRetries(
        messages: ChatMessage[],
        model: string,
        options?: { temperature?: number; maxTokens?: number }
    ): Promise<string> {
        let attempt = 0;

        while (true) {
            try {
                return await this.requestChat(messages, model, options);
            } catch (error) {
                const isRetryable =
                    error instanceof OpenRouterRequestError &&
                    (error.status === 408 || error.status === 429 || (error.status >= 500 && error.status < 600));

                if (!isRetryable || attempt >= this.maxRetries) {
                    throw error;
                }

                const requestError = error as OpenRouterRequestError;
                const waitMs = this.retryDelayMs * 2 ** attempt;
                console.warn(
                    `[OpenRouter] Temporary error ${requestError.status} on model "${model}". Retry ${attempt + 1}/${this.maxRetries} in ${waitMs}ms.`
                );
                await sleep(waitMs);
                attempt += 1;
            }
        }
    }

    private async requestChat(
        messages: ChatMessage[],
        model: string,
        options?: { temperature?: number; maxTokens?: number }
    ): Promise<string> {

        const request: ChatCompletionRequest = {
            model,
            messages,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens
        };

        const abortController = new AbortController();
        const timeoutHandle = setTimeout(() => {
            abortController.abort();
        }, this.requestTimeoutMs);

        let response: Response;

        try {
            response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://daily-news.local',
                    'X-Title': 'Daily News Aggregator'
                },
                body: JSON.stringify(request),
                signal: abortController.signal
            });
        } catch (error) {
            const isAbortError = error instanceof Error && error.name === 'AbortError';
            if (isAbortError) {
                throw new OpenRouterRequestError(408, `Request timeout after ${this.requestTimeoutMs}ms`);
            }

            throw error;
        } finally {
            clearTimeout(timeoutHandle);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new OpenRouterRequestError(response.status, errorText);
        }

        const data: ChatCompletionResponse = await response.json();

        if (!data.choices || data.choices.length === 0) {
            throw new Error('No response from OpenRouter');
        }

        return data.choices[0].message.content;
    }

    /**
     * Send a simple prompt and get a response
     */
    async prompt(userPrompt: string, systemPrompt?: string): Promise<string> {
        const messages: ChatMessage[] = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        messages.push({ role: 'user', content: userPrompt });

        return this.chat(messages);
    }
}

// Singleton instance for convenience
let defaultClient: OpenRouterClient | null = null;

export function getOpenRouterClient(): OpenRouterClient {
    if (!defaultClient) {
        defaultClient = new OpenRouterClient();
    }
    return defaultClient;
}

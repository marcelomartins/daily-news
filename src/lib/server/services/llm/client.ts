/**
 * LLM API Client
 * Provider-agnostic client for any OpenAI-compatible chat completions API
 * (OpenRouter, Cloudflare Workers AI, Cloudflare AI Gateway, OpenAI, Ollama, ...)
 */

import type {
    ChatMessage,
    ChatCompletionRequest,
    ChatCompletionResponse
} from './types';
import { env } from '$env/dynamic/private';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'qwen/qwen3-next-80b-a3b-instruct:free';
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1500;
const DEFAULT_TIMEOUT_MS = 30000;
const CHAT_COMPLETIONS_PATH = '/chat/completions';

class LlmRequestError extends Error {
    status: number;

    constructor(status: number, details: string) {
        super(`LLM API error: ${status} - ${details}`);
        this.status = status;
        this.name = 'LlmRequestError';
    }
}

/**
 * Read a setting from the new AI_* variable, falling back to the legacy
 * OPENROUTER_* name so existing deployments keep working unchanged.
 */
function readSetting(name: string, legacyName: string): string | undefined {
    return env[name] || env[legacyName] || undefined;
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

/**
 * Accepts either an API base URL (".../v1") or an already complete
 * chat completions endpoint, so providers with unusual paths — such as
 * Cloudflare's "/client/v4/accounts/{id}/ai/v1" — need no special casing.
 */
function resolveEndpoint(rawBaseUrl: string | undefined): string {
    const baseUrl = (rawBaseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');

    if (baseUrl.endsWith(CHAT_COMPLETIONS_PATH)) {
        return baseUrl;
    }

    return `${baseUrl}${CHAT_COMPLETIONS_PATH}`;
}

/**
 * Optional provider-specific headers as a JSON object, e.g. OpenRouter's
 * attribution headers or AI Gateway's "cf-aig-authorization".
 */
function parseExtraHeaders(rawHeaders: string | undefined): Record<string, string> {
    if (!rawHeaders || !rawHeaders.trim()) {
        return {};
    }

    try {
        const parsed = JSON.parse(rawHeaders);

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            console.warn('[LLM] AI_EXTRA_HEADERS must be a JSON object. Ignoring.');
            return {};
        }

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
                headers[key] = value;
            } else {
                console.warn(`[LLM] Ignoring non-string value for extra header "${key}".`);
            }
        }

        return headers;
    } catch {
        console.warn('[LLM] Could not parse AI_EXTRA_HEADERS as JSON. Ignoring.');
        return {};
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class LlmClient {
    private apiKey: string;
    private endpoint: string;
    private model: string;
    private maxRetries: number;
    private retryDelayMs: number;
    private fallbackModels: string[];
    private requestTimeoutMs: number;
    private extraHeaders: Record<string, string>;

    constructor(apiKey?: string, model?: string) {
        const dedicatedHeadlinesKey =
            readSetting('HEADLINES_AI_API_KEY', 'HEADLINES_OPENROUTER_API_KEY') || '';

        this.apiKey =
            apiKey || dedicatedHeadlinesKey || readSetting('AI_API_KEY', 'OPENROUTER_API_KEY') || '';
        this.endpoint = resolveEndpoint(env.AI_BASE_URL);
        this.model = model || readSetting('AI_MODEL', 'OPENROUTER_MODEL') || DEFAULT_MODEL;
        this.maxRetries = parseNonNegativeInt(
            readSetting('AI_MAX_RETRIES', 'OPENROUTER_MAX_RETRIES'),
            DEFAULT_MAX_RETRIES
        );
        this.retryDelayMs = parseNonNegativeInt(
            readSetting('AI_RETRY_DELAY_MS', 'OPENROUTER_RETRY_DELAY_MS'),
            DEFAULT_RETRY_DELAY_MS
        );
        this.fallbackModels = parseFallbackModels(
            readSetting('AI_FALLBACK_MODELS', 'OPENROUTER_FALLBACK_MODELS')
        );
        this.requestTimeoutMs = parsePositiveInt(
            readSetting('AI_TIMEOUT_MS', 'OPENROUTER_TIMEOUT_MS'),
            DEFAULT_TIMEOUT_MS
        );
        this.extraHeaders = parseExtraHeaders(env.AI_EXTRA_HEADERS);

        if (dedicatedHeadlinesKey) {
            console.log('[LLM] Using dedicated headlines API key for requests');
        }

        if (!this.apiKey) {
            console.warn('[LLM] API key not configured. Set AI_API_KEY environment variable.');
        }
    }

    /**
     * Check if the client is properly configured
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Model used when no per-request override is given
     */
    getModel(): string {
        return this.model;
    }

    /**
     * Chat completions endpoint currently in use
     */
    getEndpoint(): string {
        return this.endpoint;
    }

    /**
     * Send a chat completion request to the configured provider
     */
    async chat(
        messages: ChatMessage[],
        options?: { model?: string; temperature?: number; maxTokens?: number }
    ): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error('LLM API key not configured');
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
                    error instanceof LlmRequestError &&
                    (error.status === 401 || error.status === 403);

                if (isAuthError) {
                    break;
                }

                if (modelName !== modelsToTry[modelsToTry.length - 1]) {
                    console.warn(
                        `[LLM] Model "${modelName}" failed, trying fallback model...`
                    );
                }
            }
        }

        throw lastError || new Error('LLM request failed');
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
                    error instanceof LlmRequestError &&
                    (error.status === 408 || error.status === 429 || (error.status >= 500 && error.status < 600));

                if (!isRetryable || attempt >= this.maxRetries) {
                    throw error;
                }

                const requestError = error as LlmRequestError;
                const waitMs = this.retryDelayMs * 2 ** attempt;
                console.warn(
                    `[LLM] Temporary error ${requestError.status} on model "${model}". Retry ${attempt + 1}/${this.maxRetries} in ${waitMs}ms.`
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
            response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    ...this.extraHeaders,
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(request),
                signal: abortController.signal
            });
        } catch (error) {
            const isAbortError = error instanceof Error && error.name === 'AbortError';
            if (isAbortError) {
                throw new LlmRequestError(408, `Request timeout after ${this.requestTimeoutMs}ms`);
            }

            throw error;
        } finally {
            clearTimeout(timeoutHandle);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new LlmRequestError(response.status, errorText);
        }

        const data: ChatCompletionResponse = await response.json();

        if (!data.choices || data.choices.length === 0) {
            throw new Error('No response from LLM provider');
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
let defaultClient: LlmClient | null = null;

export function getLlmClient(): LlmClient {
    if (!defaultClient) {
        defaultClient = new LlmClient();
    }
    return defaultClient;
}

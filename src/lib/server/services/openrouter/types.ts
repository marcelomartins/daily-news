/**
 * OpenRouter API Types
 */

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
}

export interface ChatCompletionChoice {
    index: number;
    message: ChatMessage;
    finish_reason: string;
}

export interface ChatCompletionResponse {
    id: string;
    model: string;
    choices: ChatCompletionChoice[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface HeadlineItem {
    title: string;
    description?: string;
    url?: string;
}

export interface HeadlinesExtractionResult {
    headlines: HeadlineItem[];
}

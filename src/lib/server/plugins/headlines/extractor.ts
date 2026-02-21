/**
 * Headline Extractor
 * Uses LLM to extract headlines from Markdown content
 */

import { getOpenRouterClient } from '$lib/server/services/openrouter';
import type { HeadlineItem, HeadlinesExtractionResult } from '$lib/server/services/openrouter/types';
import { sanitizeExtractedHeadlines } from './filters';

function timestamp(): string {
    return new Date().toLocaleString('pt-BR');
}

function log(message: string): void {
    console.log(`[${timestamp()}] [PLUGIN-headline][extractor] ${message}`);
}

function warn(message: string, error?: unknown): void {
    if (error) {
        console.warn(`[${timestamp()}] [PLUGIN-headline][extractor] ${message}`, error);
        return;
    }

    console.warn(`[${timestamp()}] [PLUGIN-headline][extractor] ${message}`);
}

function errorLog(message: string): void {
    console.error(`[${timestamp()}] [PLUGIN-headline][extractor] ${message}`);
}

const EXTRACTION_PROMPT = `# TASK: News Portal Headline Extraction

You are a specialized system designed to extract the main headlines from news portals.

## INPUT
You will receive the content of a news homepage converted to Markdown.

## OBJECTIVE
Identify and extract the **featured headlines** - the most important news items appearing with the highest visibility on the homepage.

## SELECTION CRITERIA (in order of priority)
1. **Main headline** (hero/central feature) - usually the largest on the page
2. **Secondary headlines** - smaller features but still in a privileged position
3. **Recent news** with visibility on the homepage
4. Prioritize news items with identifiable links

## OUTPUT FORMAT
Return EXCLUSIVELY a valid JSON object, without markdown, without explanations:

{"headlines":[{"title":"Exact title","description":"Optional short summary","url":"https://full-link"}]}

## MANDATORY RULES
1. Extract **at most 10 headlines**
2. **title**: Copy the title EXACTLY as it appears (do not modify, do not translate)
3. **description**: Only if a summary/subtitle exists on the page (1-2 sentences max)
4. **url**: Complete and valid **individual article** URL (direct link to a specific news item)
5. DO NOT invent, DO NOT hallucinate - extract ONLY what is present in the content
6. DO NOT include: menus, footers, advertisements, navigation links
7. Respond ONLY with the JSON - without \`\`\`, without text before/after

## MANDATORY URL FILTER (GENERIC)
Include only links that appear to be a real article/news item. Exclude links from:
- homepage/root of the site
- sections/categories (e.g., economy, sports, technology, politics)
- tag, topic, subject, search, index pages
- author/columnist/profile pages
- landing pages, newsletters, podcasts, video, live, specials, galleries
- institutional pages, subscription/login, apps, help, contact

Common signs of a real news link (use together):
- specific headline slug (usually long and descriptive)
- date in the path (year/month/day) and/or content ID
- deep path with article context, not just a section word

If in doubt between a "section page" and an "individual article", discard the doubtful item.
It's better to return fewer valid items than to include generic links.

## EXAMPLE OF A CORRECT RESPONSE
{"headlines":[{"title":"Government announces new economic package","description":"Measures aim to control inflation","url":"https://example.com/news-1"},{"title":"Team wins national championship","url":"https://example.com/news-2"}]}`;

/**
 * Extract headlines from Markdown content using LLM
 */
export async function extractHeadlines(markdown: string): Promise<HeadlineItem[]> {
    const client = getOpenRouterClient();

    if (!client.isConfigured()) {
        warn('OpenRouter not configured, skipping headline extraction');
        return [];
    }

    if (!markdown || markdown.trim().length === 0) {
        warn('Empty markdown content');
        return [];
    }

    try {
        // Limit the content to avoid exceeding tokens
        const truncatedMarkdown = markdown.length > 15000
            ? markdown.slice(0, 15000) + '\n\n[...truncated content...]'
            : markdown;

        const userPrompt = `Analyze the content below and extract the main headlines.

---
HOMEPAGE CONTENT:
---
${truncatedMarkdown}
---

 Return ONLY the JSON with the extracted headlines (maximum 10 items), applying the URL filter to keep only real articles. Do not add extra text.`;

        const response = await client.prompt(
            userPrompt,
            EXTRACTION_PROMPT
        );

        // Parse JSON response
        const parsed = parseJsonResponse(response);

        if (!parsed || !Array.isArray(parsed.headlines)) {
            warn('Invalid response format from LLM');
            return [];
        }

        const sanitized = sanitizeExtractedHeadlines(parsed.headlines);
        log(`Extracted ${parsed.headlines.length} headlines, kept ${sanitized.length} after validation`);

        return sanitized;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errorLog(`Error extracting headlines: ${errorMessage}`);
        return [];
    }
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJsonResponse(response: string): HeadlinesExtractionResult | null {
    // Remove markdown code blocks if present
    let cleaned = response.trim();

    // Handle ```json ... ``` format
    if (cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        lines.shift(); // Remove first ```json line
        if (lines[lines.length - 1] === '```') {
            lines.pop(); // Remove last ``` line
        }
        cleaned = lines.join('\n');
    }

    // Handle <think>...</think> tags (some models use this)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');

    // Find JSON object in response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        warn('No JSON object found in response');
        return null;
    }

    try {
        return JSON.parse(jsonMatch[0]) as HeadlinesExtractionResult;
    } catch (e) {
        warn('Failed to parse JSON', e);
        return null;
    }
}

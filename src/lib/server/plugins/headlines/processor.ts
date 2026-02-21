/**
 * Headline Processor
 * Merges extracted headlines with existing JSON data
 * Headlines from all sources com [headline] sao inseridas no inicio, intercaladas
 */

import fs from 'fs';
import path from 'path';
import type { HeadlineItem } from '$lib/server/services/openrouter/types';
import { normalizeNewsLinkForCompare, resolveNewsLink } from '$lib/utils/news-links';
import { isValidHeadlineCandidate } from './filters';
import { writeJsonAtomic } from '$lib/server/utils/atomic-file.js';
import { withKeyLock } from '$lib/server/utils/locks.js';
import { sanitizeCategoryIdentifier, sanitizeUserIdentifier } from '$lib/server/utils/identifiers.js';
import { env } from '$env/dynamic/private';

const DATA_DIR = path.join(process.cwd(), 'data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');

function timestamp(): string {
    return new Date().toLocaleString('pt-BR');
}

function log(message: string): void {
    console.log(`[${timestamp()}] [PLUGIN-headline][processor] ${message}`);
}

function errorLog(message: string): void {
    console.error(`[${timestamp()}] [PLUGIN-headline][processor] ${message}`);
}

function getFeedCategoryLockKey(feedBasename: string, category: string): string {
    return `feed:${feedBasename}:${category}`;
}

function resolveSafeFeedAndCategory(feedBasename: string, category: string): { feed: string; category: string } | null {
    const safeFeed = sanitizeUserIdentifier(feedBasename);
    const safeCategory = sanitizeCategoryIdentifier(category);

    if (!safeFeed || !safeCategory) {
        return null;
    }

    return {
        feed: safeFeed,
        category: safeCategory
    };
}

interface NewsItem {
    title: string;
    link: string;
    description: string;
    fullContent?: string;
    pubDate: string;
    category: string[];
    feedCategory: string;
    source: string;
    sourceUrl: string;
    flag?: boolean;
    headline?: boolean;
    headlineSource?: string;
}

interface PageData {
    lastUpdated: string;
    feedFile: string;
    category: string;
    page: number;
    totalPages: number;
    itemsPerPage: number;
    count: number;
    totalItems: number;
    allCategories: string[];
    items: NewsItem[];
}

/**
 * Merge headlines into existing JSON files for a specific feed
 * Headlines are collected and stored temporarily for later interleaving
 * Headlines de fontes com [headline] ficam antes dos itens RSS
 */
export async function mergeHeadlines(
    feedBasename: string,
    category: string,
    headlines: HeadlineItem[],
    homepageUrl: string,
    openInNewTab = false
): Promise<number> {
    const safePair = resolveSafeFeedAndCategory(feedBasename, category);
    if (!safePair) {
        log(`mergeHeadlines ignorado por identificadores invalidos: ${feedBasename}/${category}`);
        return 0;
    }

    const safeFeed = safePair.feed;
    const safeCategory = safePair.category;
    const fileName = `${safeFeed}-${safeCategory}.json`;
    const filePath = path.join(PAGES_DIR, fileName);
    const headlinesFile = path.join(PAGES_DIR, `${safeFeed}-${safeCategory}-headlines.json`);
    const lockKey = getFeedCategoryLockKey(safeFeed, safeCategory);

    return withKeyLock(lockKey, async () => {
        let sourceName = 'Unknown';
        try {
            const urlObj = new URL(homepageUrl);
            sourceName = urlObj.hostname.replace('www.', '');
        } catch {
            sourceName = homepageUrl;
        }

        if (!fs.existsSync(filePath)) {
            log(`No JSON file found for ${safeFeed}/${safeCategory}`);
            return 0;
        }

        let totalMerged = 0;
        const headlineItems: NewsItem[] = [];
        const usedUrls = new Set<string>();

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const pageData: PageData = JSON.parse(content);

            // Load existing headlines from other sources (if any)
            let allHeadlinesBySource: Record<string, NewsItem[]> = {};
            if (fs.existsSync(headlinesFile)) {
                try {
                    const existingData = JSON.parse(fs.readFileSync(headlinesFile, 'utf8'));
                    if (existingData.sources) {
                        allHeadlinesBySource = existingData.sources;
                    }
                } catch {
                    // Ignore parse errors, start fresh
                }
            }

            // Process each headline - match with existing RSS item or create new
            for (const headline of headlines) {
                const resolvedHeadlineUrl = headline.url
                    ? resolveNewsLink(headline.url, homepageUrl)
                    : '';

                if (!headline.title || !resolvedHeadlineUrl) {
                    continue;
                }

                if (!isValidHeadlineCandidate(headline.title, resolvedHeadlineUrl)) {
                    continue;
                }

                if (resolvedHeadlineUrl && usedUrls.has(normalizeNewsLinkForCompare(resolvedHeadlineUrl))) {
                    continue;
                }

                // Try to match with existing RSS item by URL
                let matchedItem: NewsItem | undefined;

                if (resolvedHeadlineUrl) {
                    const headlineUrlNormalized = normalizeNewsLinkForCompare(resolvedHeadlineUrl);
                    matchedItem = pageData.items.find(item =>
                        item.link === resolvedHeadlineUrl ||
                        normalizeNewsLinkForCompare(item.link) === headlineUrlNormalized
                    );
                }

                // If not matched by URL, try by title similarity
                if (!matchedItem && headline.title) {
                    matchedItem = pageData.items.find(item =>
                        !usedUrls.has(normalizeNewsLinkForCompare(item.link)) &&
                        titleSimilarity(item.title, headline.title) > 0.6
                    );
                }

                if (matchedItem) {
                    // Use existing item data but mark as headline
                    const headlineItem: NewsItem = {
                        ...matchedItem,
                        ...(openInNewTab && { flag: true }),
                        headline: true,
                        headlineSource: sourceName
                    };
                    headlineItems.push(headlineItem);
                    usedUrls.add(normalizeNewsLinkForCompare(matchedItem.link));
                    totalMerged++;
                } else if (resolvedHeadlineUrl && headline.title) {
                    // Create a new headline item (not found in RSS)
                    const newItem: NewsItem = {
                        title: headline.title,
                        link: resolvedHeadlineUrl,
                        description: headline.description || '',
                        pubDate: new Date().toISOString(),
                        category: [],
                        feedCategory: safeCategory,
                        source: sourceName,
                        sourceUrl: homepageUrl,
                        ...(openInNewTab && { flag: true }),
                        headline: true,
                        headlineSource: sourceName
                    };
                    headlineItems.push(newItem);
                    usedUrls.add(normalizeNewsLinkForCompare(resolvedHeadlineUrl));
                    totalMerged++;
                }
            }

            if (headlineItems.length === 0) {
                if (allHeadlinesBySource[sourceName]) {
                    delete allHeadlinesBySource[sourceName];
                    await writeJsonAtomic(headlinesFile, {
                        schemaVersion: 1,
                        updatedAt: new Date().toISOString(),
                        sources: allHeadlinesBySource
                    });
                    log(`Cleared stale headlines for source ${sourceName} in ${fileName}`);
                } else {
                    log(`No headlines to add for ${sourceName}`);
                }
                return 0;
            }

            // Add/update headlines for this source
            allHeadlinesBySource[sourceName] = headlineItems;

            // Save headlines by source for later interleaving
            await writeJsonAtomic(headlinesFile, {
                schemaVersion: 1,
                updatedAt: new Date().toISOString(),
                sources: allHeadlinesBySource
            });

            log(`Saved ${headlineItems.length} headlines from ${sourceName} for ${fileName}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errorLog(`Error processing ${fileName}: ${errorMessage}`);
        }

        return totalMerged;
    });
}

/**
 * Finalize headlines by interleaving all sources and prepending to JSON file
 * This should be called after all headlines from all sources have been collected
 */
export async function finalizeHeadlines(
    feedBasename: string,
    category: string
): Promise<number> {
    const safePair = resolveSafeFeedAndCategory(feedBasename, category);
    if (!safePair) {
        log(`finalizeHeadlines ignorado por identificadores invalidos: ${feedBasename}/${category}`);
        return 0;
    }

    const safeFeed = safePair.feed;
    const safeCategory = safePair.category;
    const fileName = `${safeFeed}-${safeCategory}.json`;
    const filePath = path.join(PAGES_DIR, fileName);
    const headlinesFile = path.join(PAGES_DIR, `${safeFeed}-${safeCategory}-headlines.json`);
    const lockKey = getFeedCategoryLockKey(safeFeed, safeCategory);

    return withKeyLock(lockKey, async () => {
        if (!fs.existsSync(filePath)) {
            log(`No JSON file found for ${safeFeed}/${safeCategory}`);
            return 0;
        }

        if (!fs.existsSync(headlinesFile)) {
            log(`No headlines file found for ${safeFeed}/${safeCategory}`);
            return 0;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const pageData: PageData = JSON.parse(content);

            const headlinesData = JSON.parse(fs.readFileSync(headlinesFile, 'utf8'));
            const allHeadlinesBySource: Record<string, NewsItem[]> = headlinesData.sources || {};
            const sources = Object.keys(allHeadlinesBySource);

            // Always rebuild from non-headline items to avoid stale leftovers
            const baseItems = pageData.items.filter(item => !item.headlineSource);

            if (sources.length === 0) {
                pageData.items = baseItems.map(item => {
                    delete item.headline;
                    delete item.headlineSource;
                    return item;
                });

                pageData.count = pageData.items.length;
                pageData.totalItems = pageData.items.length;
                pageData.totalPages = Math.ceil(pageData.items.length / (pageData.itemsPerPage || 12)) || 1;
                pageData.page = 1;

                await writeJsonAtomic(filePath, pageData);
                log(`No active sources, cleaned stale headlines in ${fileName}`);
                return 0;
            }

            const ITEMS_PER_PAGE = pageData.itemsPerPage || 12;
            const MAX_HEADLINES_PER_SOURCE = 6;

            // Limit headlines per source
            for (const source of sources) {
                if (allHeadlinesBySource[source].length > MAX_HEADLINES_PER_SOURCE) {
                    allHeadlinesBySource[source] = allHeadlinesBySource[source].slice(0, MAX_HEADLINES_PER_SOURCE);
                }
            }

            // Interleave headlines from all sources - one from each source at a time
            const interleavedHeadlines: NewsItem[] = [];
            let hasMore = true;
            let index = 0;

            while (hasMore) {
                hasMore = false;
                for (const source of sources) {
                    const sourceItems = allHeadlinesBySource[source];
                    if (index < sourceItems.length) {
                        interleavedHeadlines.push(sourceItems[index]);
                        hasMore = true;
                    }
                }
                index++;
            }

            // Remove headline markers from current base items
            baseItems.forEach(item => {
                delete item.headline;
                delete item.headlineSource;
            });

            // Get URLs of all headlines to exclude from RSS items
            const headlineUrls = new Set(
                interleavedHeadlines.map(item => normalizeNewsLinkForCompare(item.link))
            );

            // Filter out items that are now headlines (to avoid duplicates)
            const rssItems: NewsItem[] = baseItems.filter(
                item => !headlineUrls.has(normalizeNewsLinkForCompare(item.link))
            );

            // Final list: ALL headlines first (interleaved), then RSS items
            const finalItems = [...interleavedHeadlines, ...rssItems];
            pageData.items = finalItems;
            pageData.count = finalItems.length;
            pageData.totalItems = finalItems.length;
            pageData.totalPages = Math.ceil(finalItems.length / ITEMS_PER_PAGE) || 1;
            pageData.page = 1;

            await writeJsonAtomic(filePath, pageData);

            // Manter arquivo de headlines para o cron poder usar
            // (não apagar mais - arquitetura de plugins)

            log(`Finalized ${interleavedHeadlines.length} headlines from ${sources.length} sources at the START of ${fileName}`);

            return interleavedHeadlines.length;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errorLog(`Error finalizing ${fileName}: ${errorMessage}`);
            return 0;
        }
    });
}

/**
 * Calculate title similarity (simple word overlap)
 */
function titleSimilarity(title1: string, title2: string): number {
    const normalize = (s: string) =>
        s.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2);

    const words1 = new Set(normalize(title1));
    const words2 = new Set(normalize(title2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let overlap = 0;
    for (const word of words1) {
        if (words2.has(word)) overlap++;
    }

    return (overlap * 2) / (words1.size + words2.size);
}

/**
 * Get all JSON files in pages directory
 */
export function getPageFiles(): string[] {
    if (!fs.existsSync(PAGES_DIR)) {
        return [];
    }
    return fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.json') && !f.includes('-headlines'));
}

/**
 * Normalize model output into plain text with paragraphs
 */
function normalizeTranslatedArticleText(text: string): string {
    let cleaned = (text || '').trim();

    if (!cleaned) {
        return '';
    }

    cleaned = cleaned
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^```[a-zA-Z]*\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .replace(/\r\n/g, '\n')
        .trim();

    const rawParagraphs = cleaned
        .split(/\n{2,}/)
        .map(paragraph =>
            paragraph
                .replace(/\n+/g, ' ')
                .replace(/^[-*#>\s]+/, '')
                .replace(/\s+/g, ' ')
                .trim()
        )
        .filter(Boolean);

    if (rawParagraphs.length === 0) {
        return '';
    }

    if (rawParagraphs.length > 1) {
        return rawParagraphs.join('\n\n');
    }

    const sentenceChunks = rawParagraphs[0]
        .split(/(?<=[.!?])\s+/)
        .map(sentence => sentence.trim())
        .filter(Boolean);

    if (sentenceChunks.length < 4) {
        return rawParagraphs[0];
    }

    const rebuiltParagraphs: string[] = [];
    let currentParagraph = '';

    for (const sentence of sentenceChunks) {
        const next = currentParagraph ? `${currentParagraph} ${sentence}` : sentence;
        if (next.length > 520 && currentParagraph) {
            rebuiltParagraphs.push(currentParagraph);
            currentParagraph = sentence;
        } else {
            currentParagraph = next;
        }
    }

    if (currentParagraph) {
        rebuiltParagraphs.push(currentParagraph);
    }

    return rebuiltParagraphs.join('\n\n');
}

function buildDescriptionFromFullContent(fullContent: string): string {
    const firstParagraph = fullContent
        .split(/\n{2,}/)
        .map(p => p.trim())
        .find(Boolean);

    if (!firstParagraph) {
        return '';
    }

    return firstParagraph.length > 260
        ? `${firstParagraph.slice(0, 257).trim()}...`
        : firstParagraph;
}

async function processArticleWithLLM(
    client: {
        chat: (
            messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
            options?: { model?: string; temperature?: number; maxTokens?: number }
        ) => Promise<string>;
    },
    title: string,
    articleMarkdown: string
): Promise<string> {
    const targetLang = env.TRANSLATION_TARGET_LANG?.trim();

    // Base instructions
    const extractionRule = '- Extract ONLY the story body (exclude menus, ads, navigation links, and footers).';
    const formattingRule = '- Deliver the final text split cleanly into paragraphs (separated by empty lines).\n- DO NOT include the title, bullet points, markdown formatting, comments, warnings or additional explanations.';

    let systemTask = '';
    let userTask = '';

    if (targetLang) {
        systemTask = `${extractionRule}\n- Translate the content into ${targetLang} naturally and faithfully following the original intent.\n${formattingRule}\nReply exclusively with the final translated article text in ${targetLang}.`;
        userTask = `Return ONLY the article body translated to ${targetLang}, split into paragraphs.`;
    } else {
        systemTask = `${extractionRule}\n- DO NOT translate. Keep the original language of the text.\n${formattingRule}\nReply exclusively with the final extracted article text in the original language.`;
        userTask = `Return ONLY the article body in its original language, split into paragraphs.`;
    }

    const systemPrompt = `You are a specialized journalism editor.
You will receive the raw text of an article in markdown format.
Your task:
${systemTask}`;

    const userPrompt = `Original Title: ${title}

Raw article content (markdown):
${articleMarkdown}

${userTask}`;

    const response = await client.chat(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        { temperature: 0.2, maxTokens: 3200 }
    );

    return normalizeTranslatedArticleText(response);
}

/**
 * Fetch full article body for all headline items
 * Translate to pt-BR and store formatted content in JSON
 */
export async function enrichHeadlineArticles(feedBasename: string, category: string): Promise<number> {
    const safePair = resolveSafeFeedAndCategory(feedBasename, category);
    if (!safePair) {
        log(`enrichHeadlineArticles ignorado por identificadores invalidos: ${feedBasename}/${category}`);
        return 0;
    }

    const safeFeed = safePair.feed;
    const safeCategory = safePair.category;
    const lockKey = getFeedCategoryLockKey(safeFeed, safeCategory);

    return withKeyLock(lockKey, async () => {
        const pattern = `${safeFeed}-${safeCategory}.json`;
        const files = fs.readdirSync(PAGES_DIR).filter(f => f === pattern);

        if (files.length === 0) {
            return 0;
        }

        const filePath = path.join(PAGES_DIR, files[0]);
        const headlinesFilePath = path.join(PAGES_DIR, `${safeFeed}-${safeCategory}-headlines.json`);
        let enrichedCount = 0;
        let closeBrowserFn: (() => Promise<void>) | null = null;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const pageData: PageData = JSON.parse(content);

            // Always enrich all headline items from plugin output
            const itemsToEnrich = pageData.items.filter(item => item.headline);

            if (itemsToEnrich.length === 0) {
                log(`No headlines found for full article enrichment in ${files[0]}`);
                return 0;
            }

            log(`Enriching full content for ${itemsToEnrich.length} headlines...`);

            // Import scraper and LLM client dynamically to avoid circular deps
            const { scrapePage, closeBrowser } = await import('./scraper');
            closeBrowserFn = closeBrowser;
            const { getOpenRouterClient } = await import('$lib/server/services/openrouter');
            const client = getOpenRouterClient();

            if (!client.isConfigured()) {
                log('OpenRouter not configured, skipping full article enrichment');
                return 0;
            }

            const enrichedByUrl = new Map<string, { fullContent: string; description: string }>();

            for (const item of itemsToEnrich) {
                try {
                    if (!item.link || !item.link.trim()) {
                        log(`Skipping headline with empty link: ${item.title.slice(0, 60)}...`);
                        continue;
                    }

                    const normalizedUrl = normalizeNewsLinkForCompare(item.link);
                    const cached = enrichedByUrl.get(normalizedUrl);
                    if (cached) {
                        item.fullContent = cached.fullContent;
                        item.description = cached.description || item.description;
                        continue;
                    }

                    log(`Fetching: ${item.link}`);

                    // Scrape article page
                    const articleContent = await scrapePage(item.link);

                    if (!articleContent || articleContent.length < 300) {
                        log(`No usable content from: ${item.link}`);
                        continue;
                    }

                    const truncatedContent = articleContent.slice(0, 28000);
                    const processedFullContent = await processArticleWithLLM(
                        client,
                        item.title,
                        truncatedContent
                    );

                    if (!processedFullContent) {
                        log(`No processed full content returned for: ${item.link}`);
                        continue;
                    }

                    const description = buildDescriptionFromFullContent(processedFullContent);

                    item.fullContent = processedFullContent;
                    if (description) {
                        item.description = description;
                    }

                    enrichedByUrl.set(normalizedUrl, {
                        fullContent: processedFullContent,
                        description: description || item.description || ''
                    });

                    enrichedCount++;
                    log(`Enriched full content: ${item.title.slice(0, 50)}...`);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    log(`Error enriching ${item.link}: ${errorMessage}`);
                }
            }

            if (enrichedCount > 0) {
                await writeJsonAtomic(filePath, pageData);
                log(`Saved ${enrichedCount} full article contents to ${files[0]}`);

                if (fs.existsSync(headlinesFilePath)) {
                    try {
                        const headlinesData = JSON.parse(fs.readFileSync(headlinesFilePath, 'utf8'));
                        const sources = headlinesData.sources || {};
                        let updatedPluginItems = 0;

                        for (const sourceItems of Object.values(sources) as NewsItem[][]) {
                            for (const sourceItem of sourceItems) {
                                const normalizedUrl = normalizeNewsLinkForCompare(sourceItem.link || '');
                                const enriched = enrichedByUrl.get(normalizedUrl);
                                if (!enriched) {
                                    continue;
                                }

                                sourceItem.fullContent = enriched.fullContent;
                                if (enriched.description) {
                                    sourceItem.description = enriched.description;
                                }
                                updatedPluginItems++;
                            }
                        }

                        if (updatedPluginItems > 0) {
                            headlinesData.schemaVersion = 1;
                            headlinesData.updatedAt = new Date().toISOString();
                            await writeJsonAtomic(headlinesFilePath, headlinesData);
                            log(`Updated ${updatedPluginItems} headline cache items in ${path.basename(headlinesFilePath)}`);
                        }
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        errorLog(`Error updating headline cache with full content: ${errorMessage}`);
                    }
                }
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errorLog(`Error in enrichHeadlineArticles: ${errorMessage}`);
        } finally {
            if (closeBrowserFn) {
                await closeBrowserFn().catch(() => { });
            }
        }

        return enrichedCount;
    });
}

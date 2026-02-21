/**
 * Headlines Plugin
 * Main entry point for the headlines extraction plugin
 */

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { scrapePage, getHomepageFromFeedUrl, closeBrowser } from './scraper';
import { extractHeadlines } from './extractor';
import { mergeHeadlines, enrichHeadlineArticles, finalizeHeadlines } from './processor';
import { getOpenRouterClient } from '$lib/server/services/openrouter';
import { sanitizeCategoryIdentifier, sanitizeUserIdentifier } from '$lib/server/utils/identifiers.js';
import { parseFeedSourceLine } from '$lib/server/utils/feed-flags.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DEFAULT_INTERVAL_MINUTES = 120;
const DEFAULT_STARTUP_DELAY_MS = 10000;
const STARTUP_DELAY_MS = Number.parseInt(
    process.env.HEADLINES_STARTUP_DELAY_MS || String(DEFAULT_STARTUP_DELAY_MS),
    10
);

let isInitialized = false;
let isRunInProgress = false;

function timestamp(): string {
    return new Date().toLocaleString('pt-BR');
}

function log(message: string): void {
    console.log(`[${timestamp()}] [PLUGIN-headline] ${message}`);
}

function warn(message: string): void {
    console.warn(`[${timestamp()}] [PLUGIN-headline] ${message}`);
}

function errorLog(message: string, error?: unknown): void {
    if (error) {
        console.error(`[${timestamp()}] [PLUGIN-headline] ${message}`, error);
        return;
    }
    console.error(`[${timestamp()}] [PLUGIN-headline] ${message}`);
}

function getCronExpression(intervalMinutes: number): string {
    if (intervalMinutes < 1) {
        return '*/1 * * * *';
    }

    if (intervalMinutes % 60 === 0) {
        const hours = intervalMinutes / 60;
        return `0 */${hours} * * *`;
    }

    return `*/${intervalMinutes} * * * *`;
}

interface FeedWithHeadlines {
    feedBasename: string;
    category: string;
    homepageUrl: string;
    openInNewTab: boolean;
}

/**
 * Parse all .feeds files and extract URLs marked with [headline]
 */
function getHeadlineFeeds(): FeedWithHeadlines[] {
    log('Lendo arquivos .feeds...');
    const feeds: FeedWithHeadlines[] = [];

    if (!fs.existsSync(DATA_DIR)) {
        warn('Diretorio data/ nao encontrado');
        return feeds;
    }

    const feedFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.feeds'));
    log(`Encontrados ${feedFiles.length} arquivos .feeds`);

    for (const feedFile of feedFiles) {
        const feedBasename = sanitizeUserIdentifier(path.basename(feedFile, '.feeds'));
        if (!feedBasename) {
            warn(`Arquivo .feeds ignorado por nome invalido: ${feedFile}`);
            continue;
        }

        const filePath = path.join(DATA_DIR, feedFile);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').map(l => l.trim());

        let currentCategory = 'Geral';

        for (const line of lines) {
            if (!line || line.startsWith('#')) continue;

            // Check for category header
            const categoryMatch = line.match(/^\[(.+)\]$/);
            if (categoryMatch) {
                const safeCategory = sanitizeCategoryIdentifier(categoryMatch[1]);
                if (safeCategory) {
                    currentCategory = safeCategory;
                }
                continue;
            }

            const parsedFeed = parseFeedSourceLine(line);
            if (!parsedFeed) {
                continue;
            }

            if (parsedFeed.unknownFlags.length > 0) {
                warn(`Flags desconhecidas ignoradas em ${feedFile}: ${parsedFeed.unknownFlags.join(', ')} (${line})`);
            }

            if (!parsedFeed.flags.headline) {
                continue;
            }

            const homepageUrl = getHomepageFromFeedUrl(parsedFeed.url);
            if (!homepageUrl) {
                continue;
            }

            // Avoid duplicates (same homepage for same feed/category)
            const exists = feeds.some(f =>
                f.feedBasename === feedBasename &&
                f.category === currentCategory &&
                f.homepageUrl === homepageUrl
            );

            if (!exists) {
                log(`URL com [headline]: ${line}`);
                log(`  -> Homepage: ${homepageUrl}`);
                log(`  -> Categoria: ${currentCategory}`);
                feeds.push({
                    feedBasename,
                    category: currentCategory,
                    homepageUrl,
                    openInNewTab: parsedFeed.flags.newTab
                });
            }
        }
    }

    return feeds;
}

/**
 * Run the headline extraction process
 */
async function runHeadlineExtraction(): Promise<void> {
    if (isRunInProgress) {
        warn('Execucao ignorada: extracao anterior ainda em andamento');
        return;
    }

    isRunInProgress = true;

    log('═══════════════════════════════════════════════════════════');
    log('Iniciando extracao de headlines...');
    log('═══════════════════════════════════════════════════════════');

    try {
        const client = getOpenRouterClient();
        if (!client.isConfigured()) {
            warn('OpenRouter nao configurado');
            warn('Configure OPENROUTER_API_KEY no arquivo .env');
            return;
        }
        log('OpenRouter configurado');

        const feeds = getHeadlineFeeds();

        if (feeds.length === 0) {
            warn('Nenhum feed com flag [headline] encontrado');
            warn('Adicione [headline] no final das URLs do arquivo .feeds para habilitar');
            return;
        }

        log(`Total: ${feeds.length} feeds com flag [headline]`);

    // Group by homepage URL to avoid duplicate scraping
        const uniqueHomepages = new Map<string, FeedWithHeadlines[]>();
        for (const feed of feeds) {
            const existing = uniqueHomepages.get(feed.homepageUrl) || [];
            existing.push(feed);
            uniqueHomepages.set(feed.homepageUrl, existing);
        }

        log(`${uniqueHomepages.size} homepages unicas para scrape`);

        let processedCount = 0;
        let errorCount = 0;

    // Track all unique feed/category combinations for finalization
        const processedFeedCategories = new Set<string>();

    // Process each unique homepage
        for (const [homepageUrl, feedsForHomepage] of uniqueHomepages) {
            processedCount++;
            log('─────────────────────────────────────────────');
            log(`[${processedCount}/${uniqueHomepages.size}] ${homepageUrl}`);

            try {
            // Step 1: Scrape
            log('Fazendo scrape da pagina...');
            const markdown = await scrapePage(homepageUrl);

            if (!markdown) {
                warn('Nenhum conteudo obtido');
                errorCount++;
                continue;
            }
            log(`Scrape concluido (${markdown.length} caracteres)`);

            // Step 2: Extract with LLM
            log('Enviando para LLM extrair headlines...');
            const headlines = await extractHeadlines(markdown);

            if (headlines.length === 0) {
                warn('Nenhuma headline extraida');
                for (const feed of feedsForHomepage) {
                    await mergeHeadlines(feed.feedBasename, feed.category, [], homepageUrl, feed.openInNewTab);
                    processedFeedCategories.add(`${feed.feedBasename}|${feed.category}`);
                }
                continue;
            }
            log(`${headlines.length} headlines extraidas:`);
            headlines.slice(0, 5).forEach((h, i) => {
                log(`  ${i + 1}. ${h.title.substring(0, 60)}...`);
            });

            // Step 3: Collect headlines for each feed (will be finalized later)
            log('Coletando headlines...');
            for (const feed of feedsForHomepage) {
                const merged = await mergeHeadlines(
                    feed.feedBasename,
                    feed.category,
                    headlines,
                    homepageUrl,
                    feed.openInNewTab
                );
                log(`  -> ${feed.feedBasename}/${feed.category}: ${merged} headlines coletadas`);
                processedFeedCategories.add(`${feed.feedBasename}|${feed.category}`);
            }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errorLog(`Erro: ${errorMessage}`);
                errorCount++;
            }
        }

        // Step 4: Finalize all headlines - interleave from all sources and prepend to JSON
        log('Finalizando headlines (mesclando todas as fontes)...');
        for (const feedCategory of processedFeedCategories) {
            const [feedBasename, category] = feedCategory.split('|');
            const finalized = await finalizeHeadlines(feedBasename, category);
            if (finalized > 0) {
                log(`  -> ${feedBasename}/${category}: ${finalized} headlines no inicio`);
            }

            // Step 5: Enrich full translated article text for all headlines
            const enriched = await enrichHeadlineArticles(feedBasename, category);
            if (enriched > 0) {
                log(`  -> ${enriched} textos completos enriquecidos`);
            }
        }

        // Cleanup browser
        log('Fechando browser...');
        await closeBrowser();

        log('═══════════════════════════════════════════════════════════');
        log('Extracao concluida');
        log(`Homepages processadas: ${processedCount - errorCount}/${processedCount}`);
        log(`Feed/categorias atualizadas: ${processedFeedCategories.size}`);
        if (errorCount > 0) {
            warn(`Erros: ${errorCount}`);
        }
        log('═══════════════════════════════════════════════════════════');
    } finally {
        isRunInProgress = false;
    }
}

/**
 * Initialize the Headlines Plugin
 */
export function init(): void {
    if (isInitialized) {
        warn('Init ignorado: plugin ja inicializado neste processo');
        return;
    }
    isInitialized = true;

    log('╔═══════════════════════════════════════════════════════════╗');
    log('║          HEADLINES PLUGIN - INICIALIZANDO                 ║');
    log('╚═══════════════════════════════════════════════════════════╝');

    const parsedInterval = parseInt(
        process.env.HEADLINES_INTERVAL_MINUTES || String(DEFAULT_INTERVAL_MINUTES),
        10
    );
    const intervalMinutes = Number.isNaN(parsedInterval)
        ? DEFAULT_INTERVAL_MINUTES
        : Math.max(1, parsedInterval);

    const startupDelayMs = Number.isNaN(STARTUP_DELAY_MS)
        ? DEFAULT_STARTUP_DELAY_MS
        : Math.max(0, STARTUP_DELAY_MS);

    log('Configuracao:');
    log(`  - Intervalo: ${intervalMinutes} minuto(s)`);
    log(`  - Delay inicial: ${Math.floor(startupDelayMs / 1000)} segundo(s)`);
    log(`  - Modelo: ${process.env.OPENROUTER_MODEL || 'qwen/qwen3-next-80b-a3b-instruct:free'}`);

    // Run after initial delay (give cron.js time to run first)
    log(`Primeira execucao em ${Math.floor(startupDelayMs / 1000)} segundo(s)...`);
    setTimeout(() => {
        log('Tempo de espera concluido, iniciando primeira execucao...');
        runHeadlineExtraction().catch(err => {
            errorLog('Erro na primeira execucao', err);
        });
    }, startupDelayMs);

    // Schedule periodic runs
    const cronExpression = getCronExpression(intervalMinutes);
    log(`Cron programado: ${cronExpression}`);

    cron.schedule(cronExpression, () => {
        log('Execucao agendada iniciando...');
        runHeadlineExtraction().catch(err => {
            errorLog('Erro na execucao agendada', err);
        });
    });

    log('Plugin inicializado com sucesso');
}

/**
 * Run headline extraction manually (for testing)
 */
export async function run(): Promise<void> {
    await runHeadlineExtraction();
}

// Export everything for external use
export const HeadlinesPlugin = {
    init,
    run
};

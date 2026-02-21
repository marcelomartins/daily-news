/**
 * Generic Web Scraper
 * Uses Puppeteer to load pages (including JS-heavy sites) and converts to Markdown
 */

import type { Browser, Page } from 'puppeteer';

function timestamp(): string {
    return new Date().toLocaleString('pt-BR');
}

function log(message: string): void {
    console.log(`[${timestamp()}] [PLUGIN-headline][scraper] ${message}`);
}

function warn(message: string): void {
    console.warn(`[${timestamp()}] [PLUGIN-headline][scraper] ${message}`);
}

function errorLog(message: string): void {
    console.error(`[${timestamp()}] [PLUGIN-headline][scraper] ${message}`);
}

// Lazy import to avoid loading Puppeteer if not needed
let puppeteer: typeof import('puppeteer') | null = null;
let TurndownService: typeof import('turndown') | null = null;

async function getPuppeteer() {
    if (!puppeteer) {
        puppeteer = await import('puppeteer');
    }
    return puppeteer;
}

async function getTurndown() {
    if (!TurndownService) {
        const module = await import('turndown');
        TurndownService = module.default;
    }
    return TurndownService;
}

// Browser instance pool (reuse to save resources)
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    const pptr = await getPuppeteer();

    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await pptr.default.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080'
            ]
        });
    }

    return browserInstance;
}

/**
 * Extract the homepage URL from a feed URL
 * Example: "https://g1.globo.com/rss/g1[headline]" -> "https://g1.globo.com"
 */
export function getHomepageFromFeedUrl(feedUrl: string): string {
	const cleanUrl = feedUrl.replace(/\[[^\]]*\]$/, '');

    try {
        const url = new URL(cleanUrl);
        return `${url.protocol}//${url.hostname}`;
    } catch {
        warn(`Invalid URL: ${feedUrl}`);
        return '';
    }
}

/**
 * Scrape a webpage and convert to Markdown
 */
export async function scrapePage(url: string): Promise<string> {
    if (!url || !url.trim()) {
        warn('Skipping scrape: empty URL');
        return '';
    }

    log(`Scraping: ${url}`);

    let page: Page | null = null;

    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        // Set user agent to avoid bot detection
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Navigate to page
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for content to load (dynamic sites)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Extract body HTML (remove scripts, styles, etc)
        const html = await page.evaluate(() => {
            // Remove unwanted elements
            const elementsToRemove = document.querySelectorAll(
                'script, style, noscript, iframe, svg, canvas, video, audio, ' +
                'header nav, footer, .cookie-banner, .advertisement, .ad, ' +
                '[role="banner"], [role="navigation"], [role="contentinfo"]'
            );
            elementsToRemove.forEach(el => el.remove());

            // Get main content or body
            const main = document.querySelector('main, article, [role="main"], .content, #content');
            return (main || document.body).innerHTML;
        });

        // Convert HTML to Markdown
        const Turndown = await getTurndown();
        const turndownService = new Turndown({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });

        // Remove images and links to reduce tokens
        turndownService.remove(['img', 'figure', 'picture']);

        const markdown = turndownService.turndown(html);

        log(`Successfully scraped ${url} (${markdown.length} chars)`);

        return markdown;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errorLog(`Error scraping ${url}: ${errorMessage}`);
        return '';

    } finally {
        if (page) {
            await page.close().catch(() => { });
        }
    }
}

/**
 * Close the browser instance (cleanup)
 */
export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close().catch(() => { });
        browserInstance = null;
    }
}


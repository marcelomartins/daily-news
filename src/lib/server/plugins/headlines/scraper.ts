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

const PRIVATE_IPV4_PATTERNS = [
    /^0\./,                                  // "this network"
    /^10\./,                                 // RFC1918
    /^127\./,                                // loopback
    /^169\.254\./,                           // link-local / cloud metadata
    /^172\.(1[6-9]|2\d|3[01])\./,            // RFC1918
    /^192\.168\./,                           // RFC1918
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./ // CGNAT
];

const PRIVATE_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];

function allowsPrivateHosts(): boolean {
    const rawValue = (process.env.SCRAPER_ALLOW_PRIVATE_HOSTS || '').toLowerCase();
    return rawValue === 'true' || rawValue === '1' || rawValue === 'on';
}

/**
 * Feed pages and LLM-extracted links are untrusted input. Without this, a
 * hostile page can point the scraper at the loopback interface, the LAN or the
 * cloud metadata endpoint and have the response published as a news article.
 */
function isBlockedScrapeTarget(rawUrl: string): { blocked: boolean; reason: string } {
    let parsed: URL;

    try {
        parsed = new URL(rawUrl);
    } catch {
        return { blocked: true, reason: 'malformed URL' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { blocked: true, reason: `unsupported protocol "${parsed.protocol}"` };
    }

    if (allowsPrivateHosts()) {
        return { blocked: false, reason: '' };
    }

    // URL keeps IPv6 literals wrapped in brackets
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (hostname === 'localhost' || PRIVATE_HOSTNAME_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
        return { blocked: true, reason: `private hostname "${hostname}"` };
    }

    if (PRIVATE_IPV4_PATTERNS.some(pattern => pattern.test(hostname))) {
        return { blocked: true, reason: `private IPv4 address "${hostname}"` };
    }

    // IPv6 loopback (::1), unique local (fc00::/7) and link-local (fe80::/10)
    if (hostname === '::1' || /^f[cd][0-9a-f]{2}:/.test(hostname) || /^fe[89ab][0-9a-f]:/.test(hostname)) {
        return { blocked: true, reason: `private IPv6 address "${hostname}"` };
    }

    return { blocked: false, reason: '' };
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

    const targetCheck = isBlockedScrapeTarget(url.trim());
    if (targetCheck.blocked) {
        warn(`Blocked scrape target (${targetCheck.reason}): ${url}`);
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


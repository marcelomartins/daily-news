import type { Handle } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

// Initialize RSS feed cron jobs
import { startCronJobs } from '$lib/server/cron.js';
import { startFeedsWatcher } from '$lib/server/feedsWatcher.js';

// Headlines Plugin - Enabled
import { HeadlinesPlugin } from '$lib/server/plugins/headlines';

const jobsState = globalThis as typeof globalThis & {
    __dailyNewsBackgroundJobsStarted?: boolean;
    __dailyNewsBackgroundJobsLockOwned?: boolean;
    __dailyNewsFeedsWatcherStop?: (() => void) | null;
};

const JOBS_LOCK_PATH = path.join(process.cwd(), 'data', '.background-jobs.lock');
const DEFAULT_JOBS_LOCK_STALE_MS = 6 * 60 * 60 * 1000;

function timestamp() {
    return new Date().toLocaleString('pt-BR');
}

function isBackgroundJobsEnabled() {
    const rawValue = (process.env.DAILY_NEWS_BACKGROUND_JOBS || 'true').toLowerCase();
    return rawValue !== 'false' && rawValue !== '0' && rawValue !== 'off';
}

function isFeedsWatcherEnabled() {
    const rawValue = (process.env.DAILY_NEWS_FEEDS_WATCHER || 'true').toLowerCase();
    return rawValue !== 'false' && rawValue !== '0' && rawValue !== 'off';
}

function getJobsLockStaleMs() {
    const parsed = Number.parseInt(process.env.DAILY_NEWS_BACKGROUND_JOBS_LOCK_STALE_MS || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_JOBS_LOCK_STALE_MS;
    }
    return parsed;
}

function acquireBackgroundJobsLock() {
    try {
        fs.mkdirSync(path.dirname(JOBS_LOCK_PATH), { recursive: true });
    } catch (error) {
        console.warn(`[${timestamp()}] [Startup] Nao foi possivel criar diretorio de lock:`, error);
        return false;
    }

    try {
        const fd = fs.openSync(JOBS_LOCK_PATH, 'wx');
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
        fs.closeSync(fd);
        jobsState.__dailyNewsBackgroundJobsLockOwned = true;
        return true;
    } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
        if (code !== 'EEXIST') {
            console.warn(`[${timestamp()}] [Startup] Falha ao adquirir lock de jobs:`, error);
            return false;
        }

        try {
            const rawLock = fs.readFileSync(JOBS_LOCK_PATH, 'utf8');
            const parsedLock = JSON.parse(rawLock) as { pid?: number };

            if (parsedLock.pid && Number.isInteger(parsedLock.pid) && parsedLock.pid > 0) {
                try {
                    process.kill(parsedLock.pid, 0);
                    return false;
                } catch (pidError) {
                    const pidErrorCode = pidError && typeof pidError === 'object' && 'code' in pidError ? pidError.code : '';
                    if (pidErrorCode === 'ESRCH') {
                        fs.unlinkSync(JOBS_LOCK_PATH);
                        return acquireBackgroundJobsLock();
                    }
                }
            }

            const staleMs = getJobsLockStaleMs();
            const stats = fs.statSync(JOBS_LOCK_PATH);
            const lockAgeMs = Date.now() - stats.mtimeMs;
            if (lockAgeMs > staleMs) {
                fs.unlinkSync(JOBS_LOCK_PATH);
                return acquireBackgroundJobsLock();
            }
        } catch (lockError) {
            console.warn(`[${timestamp()}] [Startup] Falha ao validar lock existente:`, lockError);
        }

        return false;
    }
}

function releaseBackgroundJobsLock() {
    if (!jobsState.__dailyNewsBackgroundJobsLockOwned) {
        return;
    }

    try {
        if (fs.existsSync(JOBS_LOCK_PATH)) {
            fs.unlinkSync(JOBS_LOCK_PATH);
        }
    } catch (error) {
        console.warn(`[${timestamp()}] [Startup] Falha ao remover lock de jobs:`, error);
    }
}

function startRealtimeFeedsWatcherIfEnabled() {
    if (!isFeedsWatcherEnabled()) {
        console.log(`[${timestamp()}] [Startup] File watcher de feeds desabilitado por DAILY_NEWS_FEEDS_WATCHER`);
        return;
    }

    if (jobsState.__dailyNewsFeedsWatcherStop) {
        return;
    }

    const watcher = startFeedsWatcher();
    if (watcher && typeof watcher.stop === 'function') {
        jobsState.__dailyNewsFeedsWatcherStop = watcher.stop;
        console.log(`[${timestamp()}] [Startup] File watcher de feeds iniciado`);
    }
}

function stopRealtimeFeedsWatcher() {
    if (!jobsState.__dailyNewsFeedsWatcherStop) {
        return;
    }

    try {
        jobsState.__dailyNewsFeedsWatcherStop();
    } catch (error) {
        console.warn(`[${timestamp()}] [Startup] Falha ao parar file watcher de feeds:`, error);
    } finally {
        jobsState.__dailyNewsFeedsWatcherStop = null;
    }
}

if (!jobsState.__dailyNewsBackgroundJobsStarted) {
    if (!isBackgroundJobsEnabled()) {
        console.log(`[${timestamp()}] [Startup] Jobs em background desabilitados por DAILY_NEWS_BACKGROUND_JOBS`);
        jobsState.__dailyNewsBackgroundJobsStarted = true;
    } else if (!acquireBackgroundJobsLock()) {
        console.log(`[${timestamp()}] [Startup] Outro processo esta executando os jobs em background; inicializacao local ignorada`);
        jobsState.__dailyNewsBackgroundJobsStarted = true;
    }
}

if (!jobsState.__dailyNewsBackgroundJobsStarted) {
    jobsState.__dailyNewsBackgroundJobsStarted = true;
    console.log(`[${timestamp()}] [Startup] Iniciando jobs em background (RSS + Headlines)`);
    startCronJobs();
    startRealtimeFeedsWatcherIfEnabled();
    HeadlinesPlugin.init();
} else if (jobsState.__dailyNewsBackgroundJobsLockOwned) {
    console.log(`[${timestamp()}] [Startup] Jobs de background ja estavam iniciados neste processo`);
} else {
    console.log(`[${timestamp()}] [Startup] Jobs em background nao foram iniciados neste processo`);
}

process.once('exit', () => {
    stopRealtimeFeedsWatcher();
    releaseBackgroundJobsLock();
});

process.once('SIGINT', () => {
    stopRealtimeFeedsWatcher();
    releaseBackgroundJobsLock();
    process.exit(0);
});

process.once('SIGTERM', () => {
    stopRealtimeFeedsWatcher();
    releaseBackgroundJobsLock();
    process.exit(0);
});

type Theme = 'light' | 'dark';

function isTheme(value: string | undefined): value is Theme {
    return value === 'light' || value === 'dark';
}

function injectDarkThemeClass(html: string): string {
    return html.replace(/<html\b([^>]*)>/i, (fullMatch, attributes) => {
        const classMatch = attributes.match(/\sclass=(['"])(.*?)\1/i);
        if (!classMatch) {
            return `<html${attributes} class="dark-theme">`;
        }

        const quote = classMatch[1];
        const classes = classMatch[2].split(/\s+/).filter(Boolean);
        if (!classes.includes('dark-theme')) {
            classes.push('dark-theme');
        }

        const updatedClassAttribute = ` class=${quote}${classes.join(' ')}${quote}`;
        return `<html${attributes.replace(classMatch[0], updatedClassAttribute)}>`;
    });
}

export const handle: Handle = async ({ event, resolve }) => {
    const themeCookie = event.cookies.get('theme');
    const prefersDark = event.request.headers.get('sec-ch-prefers-color-scheme') === 'dark';
    const resolvedTheme: Theme = isTheme(themeCookie)
        ? themeCookie
        : (prefersDark ? 'dark' : 'light');

    event.locals.theme = resolvedTheme;

    event.cookies.set('theme', resolvedTheme, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        httpOnly: false,
        secure: event.url.protocol === 'https:'
    });

    const response = await resolve(event, {
        transformPageChunk: ({ html }) => {
            if (resolvedTheme === 'dark') {
                return injectDarkThemeClass(html);
            }
            return html;
        }
    });

    return response;
};

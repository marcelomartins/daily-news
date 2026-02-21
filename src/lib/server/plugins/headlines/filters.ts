import type { HeadlineItem } from '$lib/server/services/openrouter/types';
import { resolveNewsLink } from '$lib/utils/news-links';

const SECTION_TERMS = new Set([
    'news',
    'noticia',
    'noticias',
    'ultimas',
    'latest',
    'economia',
    'esporte',
    'esportes',
    'sport',
    'sports',
    'tecnologia',
    'technology',
    'tech',
    'politica',
    'politics',
    'mundo',
    'world',
    'brasil',
    'entertainment',
    'entretenimento',
    'cultura',
    'culture',
    'opiniao',
    'opinion',
    'video',
    'videos',
    'podcast'
]);

const NON_ARTICLE_PATH_PATTERNS = [
    /\/(tag|tags|topic|topics|categoria|categorias|category|categories)\//,
    /\/(autor|author|colunista|columnist|perfil|profile)\//,
    /\/(busca|search)(\/|$)/,
    /\/(video|videos|podcast|podcasts|newsletter)(\/|$)/,
    /\/(live|ao-vivo|especial|especiais|gallery|galeria)(\/|$)/,
    /\/(contato|contact|about|sobre|help|ajuda)(\/|$)/,
    /\/(login|signin|signup|assine|subscribe)(\/|$)/
];

const SECTION_ROOT_SEGMENTS = new Set([
    'news',
    'noticias',
    'economia',
    'esporte',
    'esportes',
    'tecnologia',
    'politica',
    'mundo',
    'brasil',
    'business',
    'sports',
    'tech',
    'world'
]);

function normalizeText(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function cleanTitle(title: string): string {
    return title.replace(/\s+/g, ' ').trim();
}

function cleanDescription(description: string | undefined): string | undefined {
    const cleaned = (description || '').replace(/\s+/g, ' ').trim();
    return cleaned || undefined;
}

function isSectionLikeTitle(title: string): boolean {
    const normalized = normalizeText(title);
    if (!normalized) return true;

    if (normalized.includes('rss')) {
        return true;
    }

    if (/^[a-z0-9._-]{2,}\s+(news|noticias|economia|esporte|esportes|tecnologia|politica|sports|business|tech|world)$/.test(normalized)) {
        return true;
    }

    const words = normalized.split(' ').filter(Boolean);
    const genericWords = words.filter(word => SECTION_TERMS.has(word));

    if (words.length <= 2 && genericWords.length >= 1) {
        return true;
    }

    if (words.length <= 3 && genericWords.length >= 2) {
        return true;
    }

    return false;
}

function isLikelyArticleUrl(rawUrl: string): boolean {
    const resolved = resolveNewsLink(rawUrl);
    if (!resolved) return false;

    let parsed: URL;
    try {
        parsed = new URL(resolved);
    } catch {
        return false;
    }

    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/') {
        return false;
    }

    const normalizedPath = normalizeText(pathname);

    if (NON_ARTICLE_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath))) {
        return false;
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length === 0) {
        return false;
    }

    if (segments.length === 1 && SECTION_ROOT_SEGMENTS.has(segments[0])) {
        return false;
    }

    const lastSegment = segments[segments.length - 1];
    if (!lastSegment || lastSegment.length < 3) {
        return false;
    }

    const hasDatePath = /\/20\d{2}\/(0?[1-9]|1[0-2])(\/(0?[1-9]|[12]\d|3[01]))?\//.test(normalizedPath);
    const hasArticleSlug =
        lastSegment.includes('-') && lastSegment.split('-').filter(Boolean).length >= 3;
    const hasLongNumericId = /\d{4,}/.test(lastSegment);
    const hasArticleExtension = /\.(html?|shtml|php)$/.test(lastSegment);
    const hasArticleQueryId = /[?&](id|article|story)=\d{3,}/.test(parsed.search.toLowerCase());

    if (hasDatePath || hasArticleSlug || hasLongNumericId || hasArticleExtension || hasArticleQueryId) {
        return true;
    }

    return segments.length >= 3 && lastSegment.length >= 12;
}

export function isValidHeadlineCandidate(title: string, url: string): boolean {
    const cleanedTitle = cleanTitle(title || '');
    const resolvedUrl = resolveNewsLink(url || '');

    if (!cleanedTitle || !resolvedUrl) {
        return false;
    }

    if (isSectionLikeTitle(cleanedTitle)) {
        return false;
    }

    return isLikelyArticleUrl(resolvedUrl);
}

export function sanitizeExtractedHeadlines(items: HeadlineItem[]): HeadlineItem[] {
    const sanitized: HeadlineItem[] = [];
    const dedupe = new Set<string>();

    for (const item of items) {
        const title = cleanTitle(item.title || '');
        const url = resolveNewsLink(item.url || '');

        if (!title || !url) {
            continue;
        }

        if (isSectionLikeTitle(title)) {
            continue;
        }

        if (!isLikelyArticleUrl(url)) {
            continue;
        }

        const dedupeKey = `${normalizeText(title)}|${url.replace(/\/+$/, '').toLowerCase()}`;
        if (dedupe.has(dedupeKey)) {
            continue;
        }
        dedupe.add(dedupeKey);

        sanitized.push({
            title,
            description: cleanDescription(item.description),
            url
        });

        if (sanitized.length >= 10) {
            break;
        }
    }

    return sanitized;
}

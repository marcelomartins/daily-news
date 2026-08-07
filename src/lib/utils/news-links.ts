const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Only http(s) links are usable as an article href or as a scrape target.
 * Anything else (javascript:, data:, file:, ...) arrives from untrusted feed
 * content and must never reach an `href` binding or Puppeteer.
 */
function isSafeHttpUrl(value: string): boolean {
	try {
		return SAFE_PROTOCOLS.has(new URL(value).protocol);
	} catch {
		return false;
	}
}

function resolveCandidate(candidate: string, sourceUrl?: string): string {
	if (/^https?:\/\//i.test(candidate)) {
		return candidate;
	}

	if (candidate.startsWith('//')) {
		if (sourceUrl) {
			try {
				return `${new URL(sourceUrl).protocol}${candidate}`;
			} catch {
				return `https:${candidate}`;
			}
		}

		return `https:${candidate}`;
	}

	if (/^www\./i.test(candidate)) {
		return `https://${candidate}`;
	}

	if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(candidate)) {
		return `https://${candidate}`;
	}

	if (sourceUrl) {
		try {
			return new URL(candidate, sourceUrl).toString();
		} catch {
			return candidate;
		}
	}

	return candidate;
}

/**
 * Resolves a feed-supplied link to an absolute http(s) URL.
 * Returns '' when the link cannot be resolved to a safe one, so callers
 * degrade to "no link" instead of rendering a hostile href.
 */
export function resolveNewsLink(link: string | undefined | null, sourceUrl?: string): string {
	const candidate = (link || '').trim();
	if (!candidate) return '';

	const resolved = resolveCandidate(candidate, sourceUrl);

	return isSafeHttpUrl(resolved) ? resolved : '';
}

export function normalizeNewsLinkForCompare(url: string): string {
	const resolved = resolveNewsLink(url);
	if (!resolved) return '';

	try {
		const parsed = new URL(resolved);
		return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
	} catch {
		return resolved.toLowerCase();
	}
}

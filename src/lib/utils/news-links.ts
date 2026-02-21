export function resolveNewsLink(link: string | undefined | null, sourceUrl?: string): string {
	const candidate = (link || '').trim();
	if (!candidate) return '';

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

export function normalizeNewsLinkForCompare(url: string): string {
	const resolved = resolveNewsLink(url);

	try {
		const parsed = new URL(resolved);
		return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
	} catch {
		return resolved.toLowerCase();
	}
}

import { normalizeNewsLinkForCompare, resolveNewsLink } from '$lib/utils/news-links';

interface LocalReaderInput {
	title: string;
	link: string;
	sourceUrl?: string;
	pubDate?: string;
}

function slugifyText(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function hashText(value: string): string {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return (hash >>> 0).toString(36);
}

export function buildLocalReaderSlug(item: LocalReaderInput): string {
	const resolvedLink = resolveNewsLink(item.link, item.sourceUrl);
	const stableKey = resolvedLink
		? normalizeNewsLinkForCompare(resolvedLink)
		: `${item.title}|${item.pubDate || ''}`;

	const slugBase = slugifyText(item.title) || 'materia';
	const hashSuffix = hashText(stableKey);

	return `${slugBase}-${hashSuffix}`;
}

export function buildLocalReaderHref(user: string, category: string, slug: string, page: number): string {
	return `/${encodeURIComponent(user)}/${encodeURIComponent(category)}/${page}/${encodeURIComponent(slug)}`;
}

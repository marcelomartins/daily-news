import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import { sanitizeCategoryIdentifier, sanitizeUserIdentifier } from '$lib/server/utils/identifiers.js';
import { buildLocalReaderSlug } from '$lib/server/utils/local-reader';

interface StoredNewsItem {
	title?: string;
	link?: string;
	description?: string;
	pubDate?: string;
	fullContent?: string;
	source?: string;
	sourceUrl?: string;
	flag?: boolean;
	headline?: boolean;
	headlineSource?: string;
}

interface StoredPageData {
	itemsPerPage?: number;
	items?: StoredNewsItem[];
}

function splitParagraphs(content: string): string[] {
	return content
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

function toItemForSlug(item: StoredNewsItem) {
	return {
		title: typeof item.title === 'string' ? item.title : '',
		link: typeof item.link === 'string' ? item.link : '',
		sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : undefined,
		pubDate: typeof item.pubDate === 'string' ? item.pubDate : undefined
	};
}

export const load: PageServerLoad = async ({ params, url, locals, cookies }) => {
	const user = sanitizeUserIdentifier(params.user || '');
	if (!user) {
		throw error(404, 'Usuario invalido');
	}

	const category = sanitizeCategoryIdentifier(params.category || '');
	if (!category) {
		throw error(404, 'Categoria invalida');
	}

	const parsedPage = Number.parseInt(params.page || '', 10);
	const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	if (String(requestedPage) !== params.page) {
		throw redirect(
			302,
			`/${encodeURIComponent(user)}/${encodeURIComponent(category)}/${requestedPage}/${encodeURIComponent(params.slug || '')}`
		);
	}

	const pageFilePath = path.join(process.cwd(), 'data', 'pages', `${user}-${category}.json`);

	if (url.searchParams.get('theme') === 'toggle') {
		const currentTheme = cookies.get('theme') || locals.theme;
		const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

		cookies.set('theme', nextTheme, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax',
			httpOnly: false,
			secure: url.protocol === 'https:'
		});

		throw redirect(302, url.pathname);
	}

	let pageData: StoredPageData;
	try {
		const rawContent = await fs.readFile(pageFilePath, 'utf8');
		pageData = JSON.parse(rawContent) as StoredPageData;
	} catch (rawError) {
		if (rawError && typeof rawError === 'object' && 'code' in rawError && rawError.code === 'ENOENT') {
			throw redirect(302, `/${encodeURIComponent(user)}/${encodeURIComponent(category)}/1`);
		}

		throw rawError;
	}

	const allItems = Array.isArray(pageData.items) ? pageData.items : [];
	const matchedArticle = allItems.find((item) => {
		if (!item || typeof item.fullContent !== 'string' || !item.fullContent.trim()) {
			return false;
		}

		return buildLocalReaderSlug(toItemForSlug(item)) === params.slug;
	});

	if (!matchedArticle) {
		throw error(404, 'Materia nao encontrada');
	}

	const itemsPerPage = Number.isFinite(pageData.itemsPerPage)
		? Math.max(1, Number(pageData.itemsPerPage))
		: 12;
	const totalPages = Math.max(1, Math.ceil(allItems.length / itemsPerPage));
	const page = Math.min(requestedPage, totalPages);

	const encodedUser = encodeURIComponent(user);
	const encodedCategory = encodeURIComponent(category);
	const backHref = `/${encodedUser}/${encodedCategory}/${page}`;
	const themeToggleHref = `${url.pathname}?theme=toggle`;
	const fullContent = matchedArticle.fullContent || '';

	return {
		user,
		category,
		page,
		totalPages,
		isDarkMode: locals.theme === 'dark',
		backHref,
		themeToggleHref,
		article: {
			title: matchedArticle.title || '',
			link: matchedArticle.link || '',
			description: matchedArticle.description || '',
			pubDate: matchedArticle.pubDate || '',
			fullContent,
			source: matchedArticle.source,
			sourceUrl: matchedArticle.sourceUrl,
			flag: matchedArticle.flag,
			headline: matchedArticle.headline,
			headlineSource: matchedArticle.headlineSource
		},
		paragraphs: splitParagraphs(fullContent || matchedArticle.description || '')
	};
};

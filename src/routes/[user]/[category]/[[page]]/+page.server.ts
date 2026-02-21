
import type { PageServerLoad } from './$types';
import { getUserNewsAsync, getAllCategoriesAsync } from '$lib/server/cron.js';
import { error, redirect } from '@sveltejs/kit';
import path from 'path';
import { sanitizeCategoryIdentifier, sanitizeUserIdentifier } from '$lib/server/utils/identifiers.js';
import { buildLocalReaderHref, buildLocalReaderSlug } from '$lib/server/utils/local-reader';

function createEmptyNews(user: string, category: string, allCategories: string[]) {
    return {
        lastUpdated: new Date().toISOString(),
        feedFile: `${user}.feeds`,
        category,
        page: 1,
        totalPages: 1,
        itemsPerPage: 12,
        count: 0,
        totalItems: 0,
        allCategories,
        items: []
    };
}

export const load: PageServerLoad = async ({ params, locals, url, cookies }) => {
    console.log(`[${new Date().toLocaleString('pt-BR')}] [PAGE-user] Loading user:`, params);

    const isDarkMode = locals.theme === 'dark';
    
    // Extrai os parâmetros
    const user = sanitizeUserIdentifier(params.user || '');
    if (!user) {
        throw error(404, 'Usuario invalido');
    }

    const requestedCategory = params.category || '';
    let category = sanitizeCategoryIdentifier(requestedCategory) || '';
    if (requestedCategory && !category) {
        throw error(404, 'Categoria invalida');
    }

    const rawPageNumber = params.page ? Number.parseInt(params.page, 10) : 1;
    const pageNumber = Number.isFinite(rawPageNumber) && rawPageNumber > 0
        ? rawPageNumber
        : 1;
    
    const feedFilePath = path.join(process.cwd(), 'data', `${user}.feeds`);
    const allCategories = await getAllCategoriesAsync(feedFilePath);

    // Se categoria não foi especificada, busca a primeira categoria disponível
    if (!category) {
        if (allCategories.length > 0) {
            category = allCategories[0];
        } else {
            category = 'Geral';
        }
    }
    
    // Se não há página especificada na URL mas existe categoria, redireciona para página 1
    if (params.category && !params.page) {
        throw redirect(302, `/${encodeURIComponent(user)}/${encodeURIComponent(category)}/1`);
    }

    if (params.page && String(pageNumber) !== params.page) {
        throw redirect(302, `/${encodeURIComponent(user)}/${encodeURIComponent(category)}/${pageNumber}`);
    }

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
    
    // Busca as notícias específicas do usuário, categoria e página
    const newsData = await getUserNewsAsync(user, category, pageNumber);

    if (!newsData) {
        if (pageNumber !== 1) {
            throw redirect(302, `/${encodeURIComponent(user)}/${encodeURIComponent(category)}/1`);
        }

        return {
            user: user,
            category: category,
            page: String(pageNumber),
            pageNumber: pageNumber,
            time: new Date().toLocaleTimeString(),
            news: createEmptyNews(user, category, allCategories),
            isDarkMode
        };
    }
    
	return {
		user: user,
		category: category,
		page: String(pageNumber),
		pageNumber: pageNumber,
		time: new Date().toLocaleTimeString(),
		news: {
			...newsData,
			items: (newsData.items || []).map((item: any) => {
				if (!item?.fullContent || !String(item.fullContent).trim()) {
					return item;
				}

				const slug = buildLocalReaderSlug({
					title: String(item.title || ''),
					link: String(item.link || ''),
					sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : undefined,
					pubDate: typeof item.pubDate === 'string' ? item.pubDate : undefined
				});

				return {
					...item,
					localReaderHref: buildLocalReaderHref(user, category, slug, pageNumber)
				};
			})
		},
		isDarkMode
	};
};

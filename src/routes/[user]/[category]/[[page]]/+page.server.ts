
import type { PageServerLoad } from './$types';
import { getUserNews, getAllCategories } from '$lib/server/cron.js';
import { redirect } from '@sveltejs/kit';
import path from 'path';

export const load: PageServerLoad = async ({ params, cookies }) => {
    console.log("Loading user:", params);
    
    // Detecta tema do cookie
    const preferredTheme = cookies.get('theme') || 'light';
    
    // Extrai os parâmetros
    const user = params.user || '';
    let category = params.category || '';
    const pageNumber = params.page ? parseInt(params.page) : 1;
    
    // Se categoria não foi especificada, busca a primeira categoria disponível
    if (!category) {
        const feedFilePath = path.join(process.cwd(), 'data', `${user}.feeds`);
        const allCategories = getAllCategories(feedFilePath);
        if (allCategories.length > 0) {
            category = allCategories[0];
        } else {
            category = 'Geral';
        }
    }
    
    // Se não há página especificada na URL mas existe categoria, redireciona para página 1
    if (params.category && !params.page) {
        throw redirect(302, `/${user}/${category}/1`);
    }
    
    // Busca as notícias específicas do usuário, categoria e página
    const newsData = getUserNews(user, category, pageNumber);
    
	return {
		user: params.user,
		category: category,
		page: params.page,
		pageNumber: pageNumber,
		time: new Date().toLocaleTimeString(),
		news: newsData,
		isDarkMode: preferredTheme === 'dark'
	};
};
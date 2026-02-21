import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import path from 'path';
import { getAllCategoriesAsync } from '$lib/server/cron.js';
import { sanitizeUserIdentifier, sanitizeCategoryIdentifier } from '$lib/server/utils/identifiers.js';

export const load: PageServerLoad = async ({ params }) => {
    const user = sanitizeUserIdentifier(params.user || '');
    if (!user) {
        throw error(404, 'Usuario invalido');
    }

    const feedFilePath = path.join(process.cwd(), 'data', `${user}.feeds`);
    const [rawFirstCategory = 'Geral'] = await getAllCategoriesAsync(feedFilePath);
    const firstCategory = sanitizeCategoryIdentifier(rawFirstCategory) || 'Geral';

    throw redirect(302, `/${encodeURIComponent(user)}/${encodeURIComponent(firstCategory)}`);
};

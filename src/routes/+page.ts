import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import fs from 'fs';
import path from 'path';

export const load: PageLoad = async () => {
	// Busca dinamicamente o primeiro usuário disponível
	const dataDir = path.join(process.cwd(), 'data');
	
	const files = fs.readdirSync(dataDir);
	const feedFiles = files.filter(file => file.endsWith('.feeds'));
	
	// Usa o primeiro usuário encontrado (remove a extensão .feeds)
	const firstUser = path.basename(feedFiles[0], '.feeds');
	throw redirect(302, `/${firstUser}`);
};

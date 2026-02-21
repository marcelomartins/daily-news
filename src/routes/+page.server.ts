import { error, redirect } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import { sanitizeUserIdentifier } from '$lib/server/utils/identifiers.js';

export const load = async () => {
	// Busca dinamicamente o primeiro usuário disponível
	const dataDir = path.join(process.cwd(), 'data');

	let files = [];
	try {
		files = await fs.readdir(dataDir);
	} catch (err) {
		if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
			throw error(503, 'Diretorio data/ nao encontrado');
		}

		throw err;
	}

	const feedFiles = files.filter(file => file.endsWith('.feeds'));
	const safeUsers = feedFiles
		.map(file => sanitizeUserIdentifier(path.basename(file, '.feeds')))
		.filter(Boolean);

	if (safeUsers.length === 0) {
		throw error(503, 'Nenhum arquivo .feeds encontrado em data/');
	}

	// Usa o primeiro usuário encontrado (remove a extensão .feeds)
	const firstUser = safeUsers[0];
	throw redirect(302, `/${firstUser}`);
};

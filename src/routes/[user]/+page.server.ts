import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

export const load: PageServerLoad = async ({ params }) => {
    const user = params.user || '';
    
    // Busca a primeira categoria disponível para o usuário
    const feedFilePath = path.join(process.cwd(), 'data', `${user}.feeds`);
    
    let firstCategory = 'Geral';
    
    if (fs.existsSync(feedFilePath)) {
        try {
            const data = fs.readFileSync(feedFilePath, 'utf8');
            const lines = data.split('\n').map(line => line.trim());
            
            for (const line of lines) {
                if (!line || line.startsWith('#')) {
                    continue;
                }
                
                const categoryMatch = line.match(/^\[(.+)\]$/);
                if (categoryMatch) {
                    firstCategory = categoryMatch[1];
                    break; // Pega a primeira categoria encontrada
                }
            }
        } catch (error) {
            console.error('Erro ao ler arquivo de feeds:', error);
        }
    }
    
    // Redireciona para a primeira categoria
    throw redirect(302, `/${user}/${firstCategory}`);
};

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // Detecta tema preferido dos cookies ou headers
    const themeCookie = event.cookies.get('theme');
    const prefersDark = event.request.headers.get('sec-ch-prefers-color-scheme') === 'dark' ||
                       event.request.headers.get('user-agent')?.includes('dark') ||
                       false;
    
    // Define tema padrão se não houver cookie
    if (!themeCookie) {
        const defaultTheme = prefersDark ? 'dark' : 'light';
        event.cookies.set('theme', defaultTheme, { 
            path: '/', 
            maxAge: 60 * 60 * 24 * 365 // 1 ano
        });
    }

    const response = await resolve(event, {
        transformPageChunk: ({ html }) => {
            // Injeta classe dark-theme no HTML se necessário
            const isDark = (themeCookie === 'dark') || (!themeCookie && prefersDark);
            if (isDark) {
                return html.replace('<html lang="en">', '<html lang="en" class="dark-theme">');
            }
            return html;
        }
    });

    return response;
};

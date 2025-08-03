import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import xml2js from 'xml2js';

const DATA_DIR = path.join(process.cwd(), 'data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');

// Configurações
const ITEMS_PER_PAGE = 12; // Número de notícias por página
const MAX_DESCRIPTION_LENGTH = 800; // Máximo de caracteres na descrição

/**
 * Converte data em português para inglês para parsing correto
 * @param {string} dateString
 * @returns {string}
 */
function convertPortugueseDateToEnglish(dateString) {
    if (!dateString || typeof dateString !== 'string') return dateString;
    
    // Mapeamento de dias da semana português -> inglês
    const dayMap = {
        'Dom': 'Sun',
        'Seg': 'Mon', 
        'Ter': 'Tue',
        'Qua': 'Wed',
        'Qui': 'Thu',
        'Sex': 'Fri',
        'Sáb': 'Sat',
        'Sab': 'Sat'
    };
    
    // Mapeamento de meses português -> inglês
    const monthMap = {
        'Jan': 'Jan',
        'Fev': 'Feb',
        'Mar': 'Mar',
        'Abr': 'Apr',
        'Mai': 'May',
        'Jun': 'Jun',
        'Jul': 'Jul',
        'Ago': 'Aug',
        'Set': 'Sep',
        'Out': 'Oct',
        'Nov': 'Nov',
        'Dez': 'Dec'
    };
    
    let convertedDate = dateString;
    
    // Converte dias da semana
    Object.entries(dayMap).forEach(([pt, en]) => {
        convertedDate = convertedDate.replace(new RegExp(`\\b${pt}\\b`, 'g'), en);
    });
    
    // Converte meses
    Object.entries(monthMap).forEach(([pt, en]) => {
        convertedDate = convertedDate.replace(new RegExp(`\\b${pt}\\b`, 'g'), en);
    });
    
    return convertedDate;
}

/**
 * @param {string} title
 * @returns {string}
 */
function cleanTitle(title) {
    if (!title || typeof title !== 'string') return '';
    
    // Remove CDATA
    let cleaned = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    
    // Remove tags HTML
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    
    // Decodifica entidades HTML básicas
    cleaned = cleaned
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        // Entidades de acentos comuns
        .replace(/&aacute;/g, 'á')
        .replace(/&agrave;/g, 'à')
        .replace(/&acirc;/g, 'â')
        .replace(/&atilde;/g, 'ã')
        .replace(/&ccedil;/g, 'ç')
        .replace(/&eacute;/g, 'é')
        .replace(/&egrave;/g, 'è')
        .replace(/&ecirc;/g, 'ê')
        .replace(/&iacute;/g, 'í')
        .replace(/&oacute;/g, 'ó')
        .replace(/&ocirc;/g, 'ô')
        .replace(/&otilde;/g, 'õ')
        .replace(/&uacute;/g, 'ú')
        .replace(/&uuml;/g, 'ü')
        // Entidades numéricas
        .replace(/&#(\d+);/g, (match, num) => {
            try {
                return String.fromCharCode(parseInt(num, 10));
            } catch (e) {
                return match;
            }
        })
        // Entidades hexadecimais
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
            try {
                return String.fromCharCode(parseInt(hex, 16));
            } catch (e) {
                return match;
            }
        });
    
    return cleaned.trim();
}

/**
 * @param {string} description
 * @returns {string}
 */
function cleanDescription(description) {
    if (!description) return '';
    
    // Garantir que description é uma string
    if (typeof description !== 'string') {
        return '';
    }
    
    // Remove tags HTML
    let cleaned = description.replace(/<[^>]*>/g, '');
    
    // Decodifica entidades HTML mais completa
    cleaned = cleaned
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#8230;/g, '...')
        .replace(/&hellip;/g, '...')
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&#8216;/g, "'")
        .replace(/&#8217;/g, "'")
        .replace(/&#8218;/g, ",")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8222;/g, '„')
        .replace(/&#8226;/g, '•')
        .replace(/&#169;/g, '©')
        .replace(/&#174;/g, '®')
        .replace(/&#8482;/g, '™')
        // Entidades numéricas específicas para caracteres latinos
        .replace(/&#224;/g, 'à')
        .replace(/&#225;/g, 'á')
        .replace(/&#226;/g, 'â')
        .replace(/&#227;/g, 'ã')
        .replace(/&#231;/g, 'ç')
        .replace(/&#232;/g, 'è')
        .replace(/&#233;/g, 'é')
        .replace(/&#234;/g, 'ê')
        .replace(/&#237;/g, 'í')
        .replace(/&#243;/g, 'ó')
        .replace(/&#244;/g, 'ô')
        .replace(/&#245;/g, 'õ')
        .replace(/&#250;/g, 'ú')
        .replace(/&#252;/g, 'ü')
        // Entidades nomeadas para caracteres acentuados
        .replace(/&aacute;/g, 'á')
        .replace(/&agrave;/g, 'à')
        .replace(/&acirc;/g, 'â')
        .replace(/&atilde;/g, 'ã')
        .replace(/&ccedil;/g, 'ç')
        .replace(/&eacute;/g, 'é')
        .replace(/&egrave;/g, 'è')
        .replace(/&ecirc;/g, 'ê')
        .replace(/&iacute;/g, 'í')
        .replace(/&oacute;/g, 'ó')
        .replace(/&ocirc;/g, 'ô')
        .replace(/&otilde;/g, 'õ')
        .replace(/&uacute;/g, 'ú')
        .replace(/&uuml;/g, 'ü')
        // Remove outras entidades numéricas genéricas
        .replace(/&#(\d+);/g, (match, num) => {
            try {
                return String.fromCharCode(parseInt(num, 10));
            } catch (e) {
                return match;
            }
        })
        // Remove outras entidades hexadecimais
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
            try {
                return String.fromCharCode(parseInt(hex, 16));
            } catch (e) {
                return match;
            }
        });
    
    // Remove quebras de linha excessivas e espaços extras
    cleaned = cleaned
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Trunca para o tamanho máximo
    if (cleaned.length > MAX_DESCRIPTION_LENGTH) {
        cleaned = cleaned.substring(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
    }
    
    return cleaned;
}

export function startCronJobs() {
    // Executa imediatamente na subida da aplicação
    console.log('Executando busca inicial de notícias...');
    fetchNews();
    
    // Agora executa apenas a cada 15 minutos como backup
    // O File System Watcher cuidará das mudanças em tempo real
    cron.schedule('*/15 * * * *', () => {
        console.log('Executando sincronização de backup a cada 15 minutos:', new Date().toLocaleTimeString());
        fetchNews();
    });

    console.log('Cron jobs iniciado (backup a cada 15 minutos)!');
}

function getAllFeedFiles() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            console.warn('Diretório data não encontrado:', DATA_DIR);
            return [];
        }

        const files = fs.readdirSync(DATA_DIR);
        const feedFiles = files.filter(file => file.endsWith('.feeds'));
        
        return feedFiles.map(file => ({
            filename: file,
            filepath: path.join(DATA_DIR, file),
            basename: path.basename(file, '.feeds') // nome sem extensão para usar nos arquivos JSON
        }));
    } catch (error) {
        console.error('Erro ao buscar arquivos .feeds:', error);
        return [];
    }
}

/**
 * @param {string} feedFilePath
 * @returns {Array<{url: string, category: string}>}
 */
function getRssFeedsWithCategories(feedFilePath) {
    try {
        if (fs.existsSync(feedFilePath)) {
            const data = fs.readFileSync(feedFilePath, 'utf8');
            const lines = data.split('\n').map(line => line.trim());
            
            const feeds = [];
            let currentCategory = '';
            
            for (const line of lines) {
                if (!line || line.startsWith('#')) {
                    continue; // Pula linhas vazias e comentários
                }
                
                // Verifica se é uma categoria [Nome da Categoria]
                const categoryMatch = line.match(/^\[(.+)\]$/);
                if (categoryMatch) {
                    currentCategory = categoryMatch[1];
                    continue;
                }
                
                // Se é uma URL, adiciona com a categoria atual
                if (line.startsWith('http')) {
                    feeds.push({
                        url: line,
                        category: currentCategory
                    });
                }
            }
            
            return feeds;
        }
        console.warn('Arquivo de feeds RSS não encontrado:', feedFilePath);
        return [];
    } catch (error) {
        console.error('Erro ao ler arquivo de feeds RSS:', error);
        return [];
    }
}

/**
 * Extrai todas as categorias de um arquivo .feeds
 * @param {string} feedFilePath
 * @returns {string[]}
 */
export function getAllCategories(feedFilePath) {
    try {
        if (fs.existsSync(feedFilePath)) {
            const data = fs.readFileSync(feedFilePath, 'utf8');
            const lines = data.split('\n').map(line => line.trim());
            
            /** @type {string[]} */
            const categories = [];
            
            for (const line of lines) {
                if (!line || line.startsWith('#')) {
                    continue; // Pula linhas vazias e comentários
                }
                
                // Verifica se é uma categoria [Nome da Categoria]
                const categoryMatch = line.match(/^\[(.+)\]$/);
                if (categoryMatch) {
                    const category = categoryMatch[1];
                    if (!categories.includes(category)) {
                        categories.push(category);
                    }
                }
            }
            
            return categories;
        }
        console.warn('Arquivo de feeds RSS não encontrado:', feedFilePath);
        return [];
    } catch (error) {
        console.error('Erro ao ler arquivo de feeds RSS:', error);
        return [];
    }
}

/**
 * @param {string} feedFilePath
 * @returns {string[]}
 */
function getRssFeeds(feedFilePath) {
    // Mantém compatibilidade com código existente
    return getRssFeedsWithCategories(feedFilePath).map(feed => feed.url);
}

/**
 * @param {string} url
 * @param {string} category
 * @param {boolean} flag
 * @returns {Promise<any[]>}
 */
async function fetchNewsFromUrl(url, category = '', flag = false) {
    try {
        console.log(`Buscando notícias de: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                'Accept-Charset': 'utf-8'
            }
        });
        
        if (!response.ok) {
            console.warn(`❌ Feed indisponível [${response.status}]: ${url}`);
            return [];
        }
        
        // Obtém o buffer da resposta para detectar encoding
        const buffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        
        // Detecta encoding do cabeçalho Content-Type
        const contentType = response.headers.get('content-type') || '';
        let detectedCharset = 'utf-8';
        
        const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
        if (charsetMatch) {
            detectedCharset = charsetMatch[1].toLowerCase();
        }
        
        // Tenta decodificar usando o charset detectado ou fallback
        let xmlData;
        try {
            xmlData = new TextDecoder(detectedCharset).decode(uint8Array);
        } catch (e) {
            console.log(`⚠️ Falha ao decodificar com ${detectedCharset}, tentando UTF-8...`);
            try {
                xmlData = new TextDecoder('utf-8').decode(uint8Array);
            } catch (e2) {
                console.log('⚠️ Falha com UTF-8, tentando ISO-8859-1...');
                try {
                    xmlData = new TextDecoder('iso-8859-1').decode(uint8Array);
                } catch (e3) {
                    console.log('⚠️ Usando fallback padrão...');
                    // Como último recurso, converte o buffer para string
                    xmlData = String.fromCharCode.apply(null, Array.from(uint8Array));
                }
            }
        }
        
        // Verifica se há declaração de encoding no XML e tenta usar se diferente
        const xmlEncodingMatch = xmlData.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);
        if (xmlEncodingMatch && xmlEncodingMatch[1].toLowerCase() !== detectedCharset) {
            const xmlCharset = xmlEncodingMatch[1].toLowerCase();
            console.log(`🔍 XML declara encoding: ${xmlCharset}, tentando redecodificar...`);
            try {
                xmlData = new TextDecoder(xmlCharset).decode(uint8Array);
            } catch (e) {
                console.log(`⚠️ Falha ao redecodificar com ${xmlCharset}, mantendo versão anterior`);
            }
        }
        
        // Verifica se o conteúdo é realmente XML/RSS válido
        if (!xmlData.includes('<?xml') && !xmlData.includes('<rss') && !xmlData.includes('<feed')) {
            console.warn(`❌ Resposta não é RSS/Atom válido: ${url}`);
            return [];
        }
        
        // Converte XML para JSON com opções para preservar encoding
        const parser = new xml2js.Parser({
            trim: true,
            normalize: true,
            explicitArray: true,
            mergeAttrs: false,
            ignoreAttrs: false
        });
        const result = await parser.parseStringPromise(xmlData);
        
        // Extrai o título do site/canal RSS
        let siteTitle = '';
        if (result.rss && result.rss.channel && result.rss.channel[0].title) {
            siteTitle = cleanTitle(result.rss.channel[0].title[0] || '');
        } else if (result.feed && result.feed.title) {
            siteTitle = cleanTitle(result.feed.title[0]._ || result.feed.title[0] || '');
        }
        
        // Se não conseguir extrair o título, usa o domínio da URL
        if (!siteTitle) {
            try {
                const urlObj = new URL(url);
                siteTitle = urlObj.hostname;
            } catch {
                siteTitle = url;
            }
        }
        
        // Extrai as notícias do feed (suporta tanto RSS quanto Atom)
        let items = [];
        if (result.rss && result.rss.channel && result.rss.channel[0].item) {
            // Feed RSS tradicional
            items = result.rss.channel[0].item;
        } else if (result.feed && result.feed.entry) {
            // Feed Atom
            items = result.feed.entry;
        }

        const news = items.map((/** @type {any} */ item) => {
            // Para feeds Atom (como Reddit) - detecta pela presença de published/updated
            if (item.published || item.updated) {
                // Reddit/Atom: title vem como array com string ou objeto com propriedade _
                let title = '';
                if (Array.isArray(item.title)) {
                    const titleItem = item.title[0];
                    if (typeof titleItem === 'string') {
                        title = titleItem;
                    } else if (titleItem && titleItem._) {
                        title = titleItem._;
                    } else if (titleItem) {
                        title = String(titleItem);
                    }
                } else if (typeof item.title === 'string') {
                    title = item.title;
                } else if (item.title && item.title._) {
                    title = item.title._;
                } else if (item.title) {
                    title = String(item.title);
                }
                
                // Remove tags HTML e CDATA do título
                title = cleanTitle(title);
                
                // Link do Reddit: sempre array com objeto contendo $ e href
                let link = '';
                if (Array.isArray(item.link) && item.link[0] && item.link[0].$) {
                    link = item.link[0].$.href;
                } else if (typeof item.link === 'string') {
                    link = item.link;
                } else if (item.link && item.link.$) {
                    link = item.link.$.href;
                }
                
                // Conteúdo: content ou summary (Reddit usa content type="html")
                const content = item.content ? (Array.isArray(item.content) ? item.content[0] : 
                               (typeof item.content === 'string' ? item.content : 
                               (item.content._ || item.content))) :
                               (item.summary ? (Array.isArray(item.summary) ? item.summary[0] :
                               (typeof item.summary === 'string' ? item.summary : 
                               (item.summary._ || item.summary))) : '');
                
                // Data: prioriza published, depois updated - sempre arrays no Reddit
                const pubDate = item.published ? (Array.isArray(item.published) ? item.published[0] : item.published) :
                               (item.updated ? (Array.isArray(item.updated) ? item.updated[0] : item.updated) : '');
                
                // Converte data em português para inglês se necessário
                const convertedPubDate = convertPortugueseDateToEnglish(pubDate);
                
                // Categorias do Atom - sempre array com objetos $ no Reddit
                const categories = item.category ? 
                    (Array.isArray(item.category) ? 
                        item.category.map((/** @type {any} */ cat) => cat.$ ? (cat.$.term || cat.$.label) : cat) :
                        [item.category.$ ? (item.category.$.term || item.category.$.label) : item.category]
                    ) : [];
                
                return {
                    title: title,
                    link: link,
                    description: cleanDescription(content),
                    pubDate: convertedPubDate,
                    category: categories,
                    feedCategory: category, // Categoria do arquivo .feeds
                    source: siteTitle, // Mantém capitalização original
                    sourceUrl: url, // Mantém a URL original para referência
                    ...(flag && { flag: true })
                };
            }
            // Para feeds RSS tradicionais
            let rssTitle = '';
            const titleData = item.title;
            
            if (Array.isArray(titleData)) {
                const titleItem = titleData[0];
                if (typeof titleItem === 'string') {
                    rssTitle = titleItem;
                } else if (titleItem && titleItem._) {
                    rssTitle = titleItem._;
                } else if (titleItem) {
                    rssTitle = String(titleItem);
                }
            } else if (typeof titleData === 'string') {
                rssTitle = titleData;
            } else if (titleData && titleData._) {
                rssTitle = titleData._;
            } else if (titleData) {
                rssTitle = String(titleData);
            }
            
            // Remove tags HTML e CDATA do título RSS
            rssTitle = cleanTitle(rssTitle);
            
            // Converte data RSS do português para inglês se necessário
            const rssPubDate = convertPortugueseDateToEnglish(item.pubDate?.[0] || '');
            
            return {
                title: rssTitle,
                link: item.link?.[0] || '',
                description: cleanDescription(item.description?.[0] || ''),
                pubDate: rssPubDate,
                category: item.category || [],
                feedCategory: category, // Categoria do arquivo .feeds
                source: siteTitle, // Mantém capitalização original
                sourceUrl: url, // Mantém a URL original para referência
                ...(flag && { flag: true })
            };
        });

        console.log(`✅ ${news.length} notícias obtidas de: ${siteTitle}`);
        return news;
    } catch (error) {
        // Tratamento mais específico de erros
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        
        if (errorMessage.includes('HTTP error')) {
            console.warn(`❌ Feed indisponível: ${url}`);
        } else if (errorMessage.includes('fetch failed') || errorCode === 'ECONNRESET') {
            console.warn(`❌ Erro de conexão: ${url}`);
        } else if (errorMessage.includes('XML') || errorMessage.includes('Attribute')) {
            console.warn(`❌ Feed com formato XML inválido: ${url}`);
        } else if (errorMessage.includes('parseStringPromise')) {
            console.warn(`❌ Erro ao processar XML do feed: ${url}`);
        } else {
            console.warn(`❌ Erro inesperado no feed: ${url} - ${errorMessage}`);
        }
        return [];
    }
}

async function fetchNews() {
    try {
        console.log('Buscando notícias de múltiplas fontes...');
        
        // Busca todos os arquivos .feeds
        const feedFiles = getAllFeedFiles();
        
        if (feedFiles.length === 0) {
            console.warn('Nenhum arquivo .feeds encontrado');
            return;
        }

        console.log(`Encontrados ${feedFiles.length} arquivos .feeds:`, feedFiles.map(f => f.filename));

        // Cria o diretório data se não existir
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        // Cria o diretório pages se não existir
        if (!fs.existsSync(PAGES_DIR)) {
            fs.mkdirSync(PAGES_DIR, { recursive: true });
        }

        // Processa cada arquivo .feeds separadamente
        for (const feedFile of feedFiles) {
            await processFeedFile(feedFile);
        }
        
    } catch (error) {
        console.error('Erro ao buscar notícias:', error);
    }
}

/**
 * @param {any} feedFile
 * @returns {Promise<void>}
 */
export async function processFeedFile(feedFile) {
    try {
        console.log(`\n--- Processando ${feedFile.filename} ---`);
        
        // Lê os endereços RSS do arquivo com categorias
        const feedsWithCategories = getRssFeedsWithCategories(feedFile.filepath);
        
        if (feedsWithCategories.length === 0) {
            console.warn(`Nenhum feed RSS encontrado em ${feedFile.filename}`);
            return;
        }
        
        console.log(`${feedsWithCategories.length} feeds encontrados em ${feedFile.filename}`);
        
        // Busca notícias de todas as fontes em paralelo, incluindo categorias
        const newsPromises = feedsWithCategories.map(feed => {
            const flag = feed.url.endsWith('#');
            return fetchNewsFromUrl(feed.url, feed.category, flag);
        });
        const newsArrays = await Promise.all(newsPromises);
        
        // Combina todas as notícias em um array único
        const allNews = newsArrays.flat();
        
        if (allNews.length === 0) {
            console.warn(`Nenhuma notícia encontrada para ${feedFile.filename}`);
            return;
        }
        
        // Ordena por data de publicação (mais recentes primeiro)
        allNews.sort((a, b) => {
            const dateA = new Date(a.pubDate);
            const dateB = new Date(b.pubDate);
            return dateB.getTime() - dateA.getTime();
        });

        // Remove TODOS os arquivos antigos deste feed específico (para evitar páginas órfãs)
        const files = fs.readdirSync(PAGES_DIR);
        const oldFiles = files.filter(file => 
            file.startsWith(`${feedFile.basename}-`) && file.endsWith('.json')
        );
        
        console.log(`🗑️ Removendo ${oldFiles.length} arquivo(s) antigo(s) de ${feedFile.basename}`);
        oldFiles.forEach(file => {
            fs.unlinkSync(path.join(PAGES_DIR, file));
        });

        // Extrai todas as categorias do arquivo .feeds
        const allCategories = getAllCategories(feedFile.filepath);

        // Agrupa as notícias por categoria
        /** @type {{[key: string]: any[]}} */
        const newsByCategory = {};
        
        for (const news of allNews) {
            const category = news.feedCategory || 'Geral';
            if (!newsByCategory[category]) {
                newsByCategory[category] = [];
            }
            newsByCategory[category].push(news);
        }

        // Processa cada categoria separadamente
        for (const [category, categoryNews] of Object.entries(newsByCategory)) {
            const itemsPerPage = ITEMS_PER_PAGE;
            const totalPages = Math.ceil(categoryNews.length / itemsPerPage);
            
            console.log(`📁 Processando categoria "${category}" com ${categoryNews.length} notícias em ${totalPages} páginas`);
            
            // Salva cada página da categoria em um arquivo separado
            for (let page = 1; page <= totalPages; page++) {
                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const pageItems = categoryNews.slice(startIndex, endIndex);
                
                const pageData = {
                    lastUpdated: new Date().toISOString(),
                    feedFile: feedFile.filename,
                    category: category,
                    page: page,
                    totalPages: totalPages,
                    itemsPerPage: itemsPerPage,
                    count: pageItems.length,
                    totalItems: categoryNews.length,
                    allCategories: allCategories,
                    items: pageItems
                };
                
                const pageFilePath = path.join(PAGES_DIR, `${feedFile.basename}-${category}-${page}.json`);
                fs.writeFileSync(pageFilePath, JSON.stringify(pageData, null, 2), 'utf8');
            }
        }

        console.log(`✅ ${allNews.length} notícias de ${feedsWithCategories.length} fontes salvas por categoria para ${feedFile.basename}`);
        
    } catch (error) {
        console.error(`Erro ao processar ${feedFile.filename}:`, error);
    }
}

// Função para ler notícias específicas de um usuário com paginação e categoria
/**
 * @param {string} username
 * @param {string} category
 * @param {number} page
 * @returns {any}
 */
export function getUserNews(username, category = '', page = 1) {
    try {
        const pageNumber = page || 1;
        
        // Se categoria não foi especificada, busca a primeira categoria disponível
        if (!category) {
            const feedFilePath = path.join(process.cwd(), 'data', `${username}.feeds`);
            const allCategories = getAllCategories(feedFilePath);
            if (allCategories.length > 0) {
                category = allCategories[0];
            } else {
                category = 'Geral';
            }
        }
        
        const userFilePath = path.join(process.cwd(), 'data', 'pages', `${username}-${category}-${pageNumber}.json`);
        if (fs.existsSync(userFilePath)) {
            const data = fs.readFileSync(userFilePath, 'utf8');
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        console.error(`Erro ao ler notícias para usuário ${username}, categoria ${category}, página ${page}:`, error);
        return null;
    }
}
import cron from 'node-cron';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import xml2js from 'xml2js';
import { normalizeNewsLinkForCompare, resolveNewsLink } from '$lib/utils/news-links';
import { writeJsonAtomic } from '$lib/server/utils/atomic-file.js';
import { withKeyLock } from '$lib/server/utils/locks.js';
import { sanitizeCategoryIdentifier, sanitizeUserIdentifier } from '$lib/server/utils/identifiers.js';
import { parseFeedSourceLine } from '$lib/server/utils/feed-flags.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');

// Configurações
const ITEMS_PER_PAGE = 12; // Número de notícias por página
const MAX_DESCRIPTION_LENGTH = 800; // Máximo de caracteres na descrição
const DEFAULT_FEED_TIMEOUT_MS = 15000;
const DEFAULT_FEED_MAX_RETRIES = 2;
const DEFAULT_FEED_RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_FEED_FETCH_CONCURRENCY = 6;
const DEFAULT_PLUGIN_CACHE_TTL_MINUTES = 240;

/**
 * @param {string | undefined} rawValue
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveInt(rawValue, fallback) {
    const parsed = Number.parseInt(rawValue || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

const FEED_TIMEOUT_MS = parsePositiveInt(process.env.RSS_FETCH_TIMEOUT_MS, DEFAULT_FEED_TIMEOUT_MS);
const FEED_MAX_RETRIES = parsePositiveInt(process.env.RSS_FETCH_MAX_RETRIES, DEFAULT_FEED_MAX_RETRIES);
const FEED_RETRY_BASE_DELAY_MS = parsePositiveInt(process.env.RSS_FETCH_RETRY_DELAY_MS, DEFAULT_FEED_RETRY_BASE_DELAY_MS);
const FEED_FETCH_CONCURRENCY = parsePositiveInt(process.env.RSS_FETCH_CONCURRENCY, DEFAULT_FEED_FETCH_CONCURRENCY);
const PLUGIN_CACHE_TTL_MS =
    parsePositiveInt(process.env.PLUGIN_CACHE_TTL_MINUTES, DEFAULT_PLUGIN_CACHE_TTL_MINUTES) * 60 * 1000;

/**
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @template TInput, TOutput
 * @param {TInput[]} items
 * @param {number} concurrency
 * @param {(item: TInput, index: number) => Promise<TOutput>} worker
 * @returns {Promise<TOutput[]>}
 */
async function mapWithConcurrency(items, concurrency, worker) {
    if (items.length === 0) {
        return [];
    }

    const results = new Array(items.length);
    let index = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const currentIndex = index;
            index += 1;

            if (currentIndex >= items.length) {
                return;
            }

            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    });

    await Promise.all(workers);
    return results;
}

/**
 * @param {string} feedBasename
 * @param {string} category
 * @returns {string}
 */
function getFeedCategoryLockKey(feedBasename, category) {
    return `feed:${feedBasename}:${category}`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function getSafeUser(value) {
    return sanitizeUserIdentifier(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function getSafeCategory(value) {
    return sanitizeCategoryIdentifier(value);
}

/**
 * @param {string} feedBasename
 * @param {string} category
 * @returns {string}
 */
function buildCategoryPageFileName(feedBasename, category) {
    return `${feedBasename}-${category}.json`;
}

/**
 * @param {number} rawPage
 * @returns {number}
 */
function normalizePageNumber(rawPage) {
    if (!Number.isFinite(rawPage)) {
        return 1;
    }

    const parsed = Math.floor(rawPage);
    if (parsed < 1) {
        return 1;
    }

    return parsed;
}

/**
 * @param {string} pluginPath
 * @param {any} pluginData
 * @returns {Promise<boolean>}
 */
async function isPluginDataFresh(pluginPath, pluginData) {
    let pluginUpdatedAt = null;

    if (pluginData && typeof pluginData === 'object' && pluginData.updatedAt) {
        const parsed = new Date(pluginData.updatedAt);
        if (!Number.isNaN(parsed.getTime())) {
            pluginUpdatedAt = parsed;
        }
    }

    if (!pluginUpdatedAt) {
        try {
            const stats = await fsPromises.stat(pluginPath);
            pluginUpdatedAt = stats.mtime;
        } catch {
            return false;
        }
    }

    const ageMs = Date.now() - pluginUpdatedAt.getTime();
    return ageMs <= PLUGIN_CACHE_TTL_MS;
}

let isCronRunInProgress = false;

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

/**
 * @param {any} rawLink
 * @returns {string}
 */
function extractFeedItemLink(rawLink) {
    if (!rawLink) {
        return '';
    }

    if (typeof rawLink === 'string') {
        return rawLink.trim();
    }

    if (Array.isArray(rawLink)) {
        const preferredAttrLink = rawLink.find((entry) =>
            entry &&
            typeof entry === 'object' &&
            entry.$ &&
            typeof entry.$.href === 'string' &&
            (!entry.$.rel || entry.$.rel === 'alternate')
        );

        if (preferredAttrLink?.$.href) {
            return preferredAttrLink.$.href.trim();
        }

        for (const entry of rawLink) {
            if (typeof entry === 'string' && entry.trim()) {
                return entry.trim();
            }

            if (entry && typeof entry === 'object') {
                if (typeof entry._ === 'string' && entry._.trim()) {
                    return entry._.trim();
                }

                if (entry.$ && typeof entry.$.href === 'string' && entry.$.href.trim()) {
                    return entry.$.href.trim();
                }
            }
        }

        return '';
    }

    if (typeof rawLink === 'object') {
        if (rawLink.$ && typeof rawLink.$.href === 'string') {
            return rawLink.$.href.trim();
        }

        if (typeof rawLink._ === 'string') {
            return rawLink._.trim();
        }
    }

    return '';
}

export function startCronJobs() {
    const now = () => new Date().toLocaleString('pt-BR');

    /**
     * @param {string} reason
     */
    const triggerFetch = (reason) => {
        if (isCronRunInProgress) {
            console.warn(`[${now()}] [RSS] Ignorando execucao (${reason}): sincronizacao anterior ainda em andamento`);
            return;
        }

        isCronRunInProgress = true;
        fetchNews().catch((error) => {
            console.error(`[${now()}] [RSS] Erro na sincronizacao (${reason}):`, error);
        }).finally(() => {
            isCronRunInProgress = false;
        });
    };

    // Executa imediatamente na subida da aplicação
    console.log(`[${now()}] [RSS] Executando busca inicial de notícias...`);
    triggerFetch('startup');

    // Executa a cada 3 horas como backup.
    // Quando habilitado, o File System Watcher cuida das mudanças em tempo real.
    cron.schedule('0 */3 * * *', () => {
        console.log(`[${now()}] [RSS] Executando sincronização de backup a cada 3 horas`);
        triggerFetch('cron');
    });

    console.log(`[${now()}] [RSS] Cron jobs iniciado (backup a cada 3 horas)!`);
}

/**
 * @returns {Array<{filename: string, filepath: string, basename: string}>}
 */
function getAllFeedFiles() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            console.warn('Diretório data não encontrado:', DATA_DIR);
            return [];
        }

        const files = fs.readdirSync(DATA_DIR);
        const feedFiles = files.filter(file => file.endsWith('.feeds'));

        return feedFiles.reduce((/** @type {Array<{filename: string, filepath: string, basename: string}>} */ result, file) => {
            const basename = path.basename(file, '.feeds');
            const safeBasename = getSafeUser(basename);

            if (!safeBasename) {
                console.warn(`Arquivo .feeds ignorado por nome invalido: ${file}`);
                return result;
            }

            result.push({
                filename: file,
                filepath: path.join(DATA_DIR, file),
                basename: safeBasename // nome sem extensão para usar nos arquivos JSON
            });

            return result;
        }, []);
    } catch (error) {
        console.error('Erro ao buscar arquivos .feeds:', error);
        return [];
    }
}

/**
 * @param {string} feedFilePath
 * @returns {Array<{
 *   url: string,
 *   originalUrl: string,
 *   category: string,
 *   hasHeadlineMarker: boolean,
 *   openInNewTab: boolean,
 *   noRss: boolean
 * }>}
 */
function getRssFeedsWithCategories(feedFilePath) {
    try {
        if (fs.existsSync(feedFilePath)) {
            const data = fs.readFileSync(feedFilePath, 'utf8');
            const lines = data.split('\n').map(line => line.trim());

            const feeds = [];
            let currentCategory = 'Geral';

            for (const line of lines) {
                if (!line || line.startsWith('#')) {
                    continue; // Pula linhas vazias e comentários
                }

                // Verifica se é uma categoria [Nome da Categoria]
                const categoryMatch = line.match(/^\[(.+)\]$/);
                if (categoryMatch) {
                    const safeCategory = getSafeCategory(categoryMatch[1]);
                    if (!safeCategory) {
                        console.warn(`Categoria invalida ignorada em ${feedFilePath}: ${categoryMatch[1]}`);
                        currentCategory = 'Geral';
                        continue;
                    }

                    currentCategory = safeCategory;
                    continue;
                }

                // Se é uma URL, adiciona com a categoria atual
                const parsedFeed = parseFeedSourceLine(line);
                if (!parsedFeed) {
                    continue;
                }

                if (parsedFeed.unknownFlags.length > 0) {
                    console.warn(`[Feed] Flags desconhecidas ignoradas em ${feedFilePath}: ${parsedFeed.unknownFlags.join(', ')} (${line})`);
                }

                if (parsedFeed.flags.headline) {
                    console.log(`[Feed] URL com headline flag: ${line} -> ${parsedFeed.url}`);
                }

                feeds.push({
                    url: parsedFeed.url,
                    originalUrl: parsedFeed.originalUrl,
                    category: currentCategory,
                    hasHeadlineMarker: parsedFeed.flags.headline,
                    openInNewTab: parsedFeed.flags.newTab,
                    noRss: parsedFeed.flags.noRss
                });
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
 * @param {string} rawData
 * @returns {string[]}
 */
function parseCategoriesFromFeedContent(rawData) {
    const lines = rawData.split('\n').map(line => line.trim());

    /** @type {string[]} */
    const categories = [];

    for (const line of lines) {
        if (!line || line.startsWith('#')) {
            continue; // Pula linhas vazias e comentários
        }

        // Verifica se é uma categoria [Nome da Categoria]
        const categoryMatch = line.match(/^\[(.+)\]$/);
        if (categoryMatch) {
            const category = getSafeCategory(categoryMatch[1]);
            if (!category) {
                continue;
            }
            if (!categories.includes(category)) {
                categories.push(category);
            }
        }
    }

    return categories;
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
            return parseCategoriesFromFeedContent(data);
        }
        console.warn('Arquivo de feeds RSS não encontrado:', feedFilePath);
        return [];
    } catch (error) {
        console.error('Erro ao ler arquivo de feeds RSS:', error);
        return [];
    }
}

/**
 * Versão assíncrona para uso no ciclo de request.
 * @param {string} feedFilePath
 * @returns {Promise<string[]>}
 */
export async function getAllCategoriesAsync(feedFilePath) {
    try {
        const data = await fsPromises.readFile(feedFilePath, 'utf8');
        return parseCategoriesFromFeedContent(data);
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return [];
        }

        console.error('Erro ao ler arquivo de feeds RSS (async):', error);
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
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableHttpStatus(status) {
    return status === 408 || status === 429 || (status >= 500 && status < 600);
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isRetryableFetchError(error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
        message.includes('fetch failed') ||
        message.includes('timeout') ||
        message.includes('aborted') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('eai_again')
    );
}

/**
 * @param {string} url
 * @returns {Promise<Response | null>}
 */
async function requestFeedWithRetry(url) {
    for (let attempt = 0; attempt <= FEED_MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => {
            controller.abort();
        }, FEED_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                    'Accept-Charset': 'utf-8'
                },
                signal: controller.signal
            });

            if (!response.ok) {
                if (isRetryableHttpStatus(response.status) && attempt < FEED_MAX_RETRIES) {
                    const jitter = Math.floor(Math.random() * 300);
                    const delay = FEED_RETRY_BASE_DELAY_MS * 2 ** attempt + jitter;
                    console.warn(`⚠️ Feed ${url} retornou ${response.status}. Nova tentativa em ${delay}ms (${attempt + 1}/${FEED_MAX_RETRIES})`);
                    await sleep(delay);
                    continue;
                }

                console.warn(`❌ Feed indisponível [${response.status}]: ${url}`);
                return null;
            }

            return response;
        } catch (error) {
            const isAbortError = error instanceof Error && error.name === 'AbortError';
            const canRetry = (isAbortError || isRetryableFetchError(error)) && attempt < FEED_MAX_RETRIES;

            if (!canRetry) {
                if (isAbortError) {
                    console.warn(`❌ Timeout ao buscar feed (${FEED_TIMEOUT_MS}ms): ${url}`);
                }
                throw error;
            }

            const jitter = Math.floor(Math.random() * 300);
            const delay = FEED_RETRY_BASE_DELAY_MS * 2 ** attempt + jitter;
            console.warn(`⚠️ Erro temporário no feed ${url}. Nova tentativa em ${delay}ms (${attempt + 1}/${FEED_MAX_RETRIES})`);
            await sleep(delay);
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    return null;
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

        const response = await requestFeedWithRetry(url);
        if (!response) {
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
        let isAtomFeed = false;
        if (result.rss && result.rss.channel && result.rss.channel[0].item) {
            // Feed RSS tradicional
            items = result.rss.channel[0].item;
        } else if (result.feed && result.feed.entry) {
            // Feed Atom
            items = result.feed.entry;
            isAtomFeed = true;
        }

        const news = items.map((/** @type {any} */ item) => {
            if (isAtomFeed) {
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

                const link = extractFeedItemLink(item.link);

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
                    link: resolveNewsLink(link, url),
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
                link: resolveNewsLink(extractFeedItemLink(item.link), url),
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
        } else if (
            errorMessage.includes('fetch failed') ||
            errorMessage.toLowerCase().includes('aborted') ||
            errorMessage.toLowerCase().includes('timeout') ||
            errorCode === 'ECONNRESET'
        ) {
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

        const allCategories = getAllCategories(feedFile.filepath);
        const fetchableFeeds = feedsWithCategories.filter(feed => !feed.noRss);
        const skippedNoRssFeeds = feedsWithCategories.length - fetchableFeeds.length;

        if (skippedNoRssFeeds > 0) {
            console.log(`ℹ️ ${skippedNoRssFeeds} feed(s) marcados com [no-rss] foram ignorados na coleta RSS`);
        }

        // Busca notícias com limite de concorrência para evitar sobrecarga
        const newsArrays = await mapWithConcurrency(
            fetchableFeeds,
            FEED_FETCH_CONCURRENCY,
            async (feed) => {
                return fetchNewsFromUrl(feed.url, feed.category, feed.openInNewTab);
            }
        );

        // Combina todas as notícias em um array único
        const allNews = newsArrays.flat();

        if (fetchableFeeds.length > 0 && allNews.length === 0) {
            console.warn(`Nenhuma notícia encontrada para ${feedFile.filename}`);
            return;
        }

        // Ordena por data de publicação (mais recentes primeiro)
        allNews.sort((a, b) => {
            const dateA = new Date(a.pubDate);
            const dateB = new Date(b.pubDate);
            return dateB.getTime() - dateA.getTime();
        });

        // Remove arquivos principais, mas preserva arquivos de plugins (ex: -headlines.json)
        const files = fs.readdirSync(PAGES_DIR);

        // Só apaga arquivos principais: feedname-Categoria.json (sem sufixo adicional)
        const mainFileNames = allCategories.map(cat => `${feedFile.basename}-${cat}.json`);
        const oldFiles = files.filter(file => mainFileNames.includes(file));

        console.log(`🗑️ Removendo ${oldFiles.length} arquivo(s) principal(is) de ${feedFile.basename} (plugins preservados)`);
        for (const file of oldFiles) {
            const prefix = `${feedFile.basename}-`;
            const categoryFromFileRaw = file.startsWith(prefix)
                ? file.slice(prefix.length, -'.json'.length)
                : 'Geral';
            const categoryFromFile = getSafeCategory(categoryFromFileRaw) || 'Geral';
            const lockKey = getFeedCategoryLockKey(feedFile.basename, categoryFromFile);
            await withKeyLock(lockKey, async () => {
                await fsPromises.unlink(path.join(PAGES_DIR, file)).catch(() => { });
            });
        }

        // Agrupa as notícias por categoria
        /** @type {{[key: string]: any[]}} */
        const newsByCategory = {};

        for (const category of allCategories) {
            newsByCategory[category] = [];
        }

        for (const news of allNews) {
            const category = news.feedCategory || 'Geral';
            if (!newsByCategory[category]) {
                newsByCategory[category] = [];
            }
            newsByCategory[category].push(news);
        }

        // Processa cada categoria separadamente
        for (const [category, categoryNews] of Object.entries(newsByCategory)) {
            const safeCategory = getSafeCategory(category);
            if (!safeCategory) {
                console.warn(`Categoria ignorada por nome invalido: ${category}`);
                continue;
            }

            const lockKey = getFeedCategoryLockKey(feedFile.basename, safeCategory);
            await withKeyLock(lockKey, async () => {
                const itemsPerPage = ITEMS_PER_PAGE;

                // Releitura de arquivos para evitar usar lista obsoleta
                const currentFiles = fs.readdirSync(PAGES_DIR);

                // Procurar arquivos de plugins: feedname-categoria-*.json
                const pluginPrefix = `${feedFile.basename}-${safeCategory}-`;
                const pluginFiles = currentFiles.filter(f =>
                    f.startsWith(pluginPrefix) && f.endsWith('.json')
                );

                // Coletar itens de todos os plugins para inserir ANTES do RSS
                /** @type {any[]} */
                let pluginItems = [];
                for (const pf of pluginFiles) {
                    try {
                        const pluginPath = path.join(PAGES_DIR, pf);
                        const pluginData = JSON.parse(await fsPromises.readFile(pluginPath, 'utf8'));

                        const isFresh = await isPluginDataFresh(pluginPath, pluginData);
                        if (!isFresh) {
                            console.warn(`⏱️ Plugin ${pf} expirado (TTL ${Math.floor(PLUGIN_CACHE_TTL_MS / 60000)} min), ignorando cache`);
                            continue;
                        }

                        // Se tem estrutura de sources (headlines), fazer interleave
                        if (pluginData.sources && typeof pluginData.sources === 'object') {
                            const sources = Object.keys(pluginData.sources);
                            const MAX_PER_SOURCE = 6;

                            // Limitar por fonte e intercalar
                            let hasMore = true;
                            let idx = 0;
                            while (hasMore) {
                                hasMore = false;
                                for (const src of sources) {
                                    const srcItems = pluginData.sources[src];
                                    if (idx < srcItems.length && idx < MAX_PER_SOURCE) {
                                        pluginItems.push(srcItems[idx]);
                                        hasMore = true;
                                    }
                                }
                                idx++;
                            }
                        } else if (Array.isArray(pluginData.items)) {
                            // Formato simples: array de items
                            pluginItems.push(...pluginData.items);
                        }

                        console.log(`🔌 Plugin ${pf}: ${pluginItems.length} itens mesclados`);
                    } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        console.warn(`⚠️ Erro ao ler plugin ${pf}:`, errorMsg);
                    }
                }

                // Remover duplicatas: se item do plugin existe no RSS, remover do RSS
                const pluginUrls = new Set(
                    pluginItems.map(i => normalizeNewsLinkForCompare(i.link)).filter(Boolean)
                );
                const rssItemsFiltered = categoryNews.filter(
                    item => !pluginUrls.has(normalizeNewsLinkForCompare(item.link))
                );

                // Items finais: plugins PRIMEIRO, depois RSS
                const finalItems = [...pluginItems, ...rssItemsFiltered];
                const totalPages = Math.max(1, Math.ceil(finalItems.length / itemsPerPage));

                console.log(`📁 Processando categoria "${category}" com ${finalItems.length} notícias (${pluginItems.length} plugins + ${rssItemsFiltered.length} RSS) em ${totalPages} páginas`);

                const pageData = {
                    lastUpdated: new Date().toISOString(),
                    feedFile: feedFile.filename,
                    category: safeCategory,
                    page: 1,
                    totalPages: totalPages,
                    itemsPerPage: itemsPerPage,
                    count: finalItems.length,
                    totalItems: finalItems.length,
                    allCategories: allCategories,
                    items: finalItems
                };

                const pageFilePath = path.join(PAGES_DIR, buildCategoryPageFileName(feedFile.basename, safeCategory));
                await writeJsonAtomic(pageFilePath, pageData);
            });
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
        const safeUser = getSafeUser(username);
        if (!safeUser) {
            return null;
        }

        const pageNumber = normalizePageNumber(page || 1);

        // Se categoria não foi especificada, busca a primeira categoria disponível
        if (!category) {
            const feedFilePath = path.join(process.cwd(), 'data', `${safeUser}.feeds`);
            const allCategories = getAllCategories(feedFilePath);
            if (allCategories.length > 0) {
                category = allCategories[0];
            } else {
                category = 'Geral';
            }
        }

        const safeCategory = getSafeCategory(category);
        if (!safeCategory) {
            return null;
        }

        const userFilePath = path.join(process.cwd(), 'data', 'pages', buildCategoryPageFileName(safeUser, safeCategory));
        if (!fs.existsSync(userFilePath)) {
            return null;
        }

        const data = fs.readFileSync(userFilePath, 'utf8');
        const baseData = JSON.parse(data);
        const itemsPerPage = baseData.itemsPerPage || ITEMS_PER_PAGE;
        const totalItems = Array.isArray(baseData.items) ? baseData.items.length : 0;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

        if (pageNumber < 1 || pageNumber > totalPages) {
            return null;
        }

        const startIndex = (pageNumber - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageItems = baseData.items.slice(startIndex, endIndex);

        return {
            ...baseData,
            page: pageNumber,
            totalPages: totalPages,
            itemsPerPage: itemsPerPage,
            count: pageItems.length,
            totalItems: totalItems,
            items: pageItems
        };
    } catch (error) {
        console.error(`Erro ao ler notícias para usuário ${username}, categoria ${category}, página ${page}:`, error);
        return null;
    }
}

/**
 * Versão assíncrona para uso no ciclo de request.
 * @param {string} username
 * @param {string} category
 * @param {number} page
 * @returns {Promise<any>}
 */
export async function getUserNewsAsync(username, category = '', page = 1) {
    try {
        const safeUser = getSafeUser(username);
        if (!safeUser) {
            return null;
        }

        const pageNumber = normalizePageNumber(page || 1);

        // Se categoria não foi especificada, busca a primeira categoria disponível
        if (!category) {
            const feedFilePath = path.join(process.cwd(), 'data', `${safeUser}.feeds`);
            const allCategories = await getAllCategoriesAsync(feedFilePath);
            if (allCategories.length > 0) {
                category = allCategories[0];
            } else {
                category = 'Geral';
            }
        }

        const safeCategory = getSafeCategory(category);
        if (!safeCategory) {
            return null;
        }

        const userFilePath = path.join(process.cwd(), 'data', 'pages', buildCategoryPageFileName(safeUser, safeCategory));
        const data = await fsPromises.readFile(userFilePath, 'utf8');

        const baseData = JSON.parse(data);
        const itemsPerPage = baseData.itemsPerPage || ITEMS_PER_PAGE;
        const totalItems = Array.isArray(baseData.items) ? baseData.items.length : 0;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

        if (pageNumber < 1 || pageNumber > totalPages) {
            return null;
        }

        const startIndex = (pageNumber - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageItems = baseData.items.slice(startIndex, endIndex);

        return {
            ...baseData,
            page: pageNumber,
            totalPages: totalPages,
            itemsPerPage: itemsPerPage,
            count: pageItems.length,
            totalItems: totalItems,
            items: pageItems
        };
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return null;
        }

        console.error(`Erro ao ler notícias para usuário ${username}, categoria ${category}, página ${page} (async):`, error);
        return null;
    }
}

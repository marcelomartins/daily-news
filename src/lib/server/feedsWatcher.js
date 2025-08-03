import { watch } from 'fs';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// Mapa para rastrear os watchers ativos
const activeWatchers = new Map();

// Mapa para rastrear os timers de debounce
const debounceTimers = new Map();

/**
 * Processa um arquivo .feeds específico
 * Esta função é importada do cron.js para reutilizar a lógica existente
 * @param {any} feedFile
 * @returns {Promise<void>}
 */
async function processSingleFeedFile(feedFile) {
    // Importação dinâmica para evitar dependência circular
    const { processFeedFile } = await import('./cron.js');
    await processFeedFile(feedFile);
}

/**
 * Cria informações do arquivo feed
 * @param {string} filename
 * @returns {any}
 */
function createFeedFileInfo(filename) {
    return {
        filename: filename,
        filepath: path.join(DATA_DIR, filename),
        basename: path.basename(filename, '.feeds')
    };
}

/**
 * Processa um arquivo .feeds específico quando ele é alterado
 * @param {string} filename
 * @returns {Promise<void>}
 */
async function handleFeedFileChange(filename) {
    try {
        console.log(`\n🔄 Arquivo ${filename} foi alterado, reprocessando...`);
        
        const feedFile = createFeedFileInfo(filename);
        
        // Verifica se o arquivo ainda existe (pode ter sido deletado)
        if (!fs.existsSync(feedFile.filepath)) {
            console.log(`⚠️ Arquivo ${filename} foi removido, parando watcher...`);
            stopWatchingFile(filename);
            return;
        }
        
        // Processa apenas este arquivo específico
        await processSingleFeedFile(feedFile);
        
        console.log(`✅ Arquivo ${filename} processado com sucesso!`);
        
    } catch (error) {
        console.error(`❌ Erro ao processar arquivo alterado ${filename}:`, error);
    }
}

/**
 * Inicia o watcher para um arquivo .feeds específico
 * @param {string} filename
 * @returns {void}
 */
function startWatchingFile(filename) {
    const filepath = path.join(DATA_DIR, filename);
    
    // Se já existe um watcher para este arquivo, para ele primeiro
    if (activeWatchers.has(filename)) {
        stopWatchingFile(filename);
    }
    
    try {
        const watcher = watch(filepath, { persistent: true }, (eventType) => {
            if (eventType === 'change') {
                // Debounce: evita múltiplas execuções em mudanças rápidas
                const existingTimer = debounceTimers.get(filename);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                }
                
                const newTimer = setTimeout(() => {
                    handleFeedFileChange(filename);
                    debounceTimers.delete(filename);
                }, 500); // Aguarda 500ms antes de processar
                
                debounceTimers.set(filename, newTimer);
            }
        });
        
        watcher.on('error', (error) => {
            console.error(`❌ Erro no watcher do arquivo ${filename}:`, error);
            // Remove o watcher com erro
            stopWatchingFile(filename);
        });
        
        activeWatchers.set(filename, watcher);
        console.log(`👁️ Monitorando alterações em: ${filename}`);
        
    } catch (error) {
        console.error(`❌ Erro ao criar watcher para ${filename}:`, error);
    }
}

/**
 * Para o watcher de um arquivo específico
 * @param {string} filename
 * @returns {void}
 */
function stopWatchingFile(filename) {
    const watcher = activeWatchers.get(filename);
    if (watcher) {
        watcher.close();
        activeWatchers.delete(filename);
        console.log(`🔇 Parou de monitorar: ${filename}`);
    }
    
    // Limpa o timer de debounce se existir
    const timer = debounceTimers.get(filename);
    if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(filename);
    }
}

/**
 * Escaneia o diretório data e inicia watchers para todos os arquivos .feeds
 */
function scanAndWatchFeedsFiles() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            console.warn(`⚠️ Diretório ${DATA_DIR} não encontrado`);
            return;
        }
        
        // Busca todos os arquivos .feeds
        const files = fs.readdirSync(DATA_DIR);
        const feedFiles = files.filter(file => file.endsWith('.feeds'));
        
        console.log(`\n📁 Encontrados ${feedFiles.length} arquivos .feeds:`);
        feedFiles.forEach(file => console.log(`   - ${file}`));
        
        // Para watchers de arquivos que não existem mais
        for (const watchedFile of activeWatchers.keys()) {
            if (!feedFiles.includes(watchedFile)) {
                console.log(`🗑️ Arquivo ${watchedFile} não existe mais, removendo watcher`);
                stopWatchingFile(watchedFile);
            }
        }
        
        // Inicia watchers para arquivos novos ou existentes
        feedFiles.forEach(filename => {
            if (!activeWatchers.has(filename)) {
                startWatchingFile(filename);
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao escanear arquivos .feeds:', error);
    }
}

/**
 * Watcher para o diretório data (detecta novos arquivos .feeds)
 */
function startDirectoryWatcher() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            console.warn(`⚠️ Diretório ${DATA_DIR} não existe, criando...`);
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        const directoryWatcher = watch(DATA_DIR, { persistent: true }, (eventType, filename) => {
            if (filename && filename.endsWith('.feeds')) {
                if (eventType === 'rename') {
                    // Arquivo foi criado ou removido
                    console.log(`📂 Detectada mudança no diretório: ${filename}`);
                    
                    // Re-escaneia o diretório após um pequeno delay
                    setTimeout(() => {
                        scanAndWatchFeedsFiles();
                    }, 1000);
                }
            }
        });
        
        directoryWatcher.on('error', (error) => {
            console.error('❌ Erro no watcher do diretório:', error);
        });
        
        console.log(`👁️ Monitorando diretório: ${DATA_DIR}`);
        return directoryWatcher;
        
    } catch (error) {
        console.error('❌ Erro ao criar watcher do diretório:', error);
    }
}

/**
 * Inicia o sistema de monitoramento de feeds
 */
export function startFeedsWatcher() {
    console.log('\n🚀 Iniciando File System Watcher para arquivos .feeds...');
    
    // Escaneia arquivos existentes e inicia watchers
    scanAndWatchFeedsFiles();
    
    // Inicia watcher do diretório para detectar novos arquivos
    const directoryWatcher = startDirectoryWatcher();
    
    // Re-escaneia periodicamente para garantir sincronização
    const rescanInterval = setInterval(() => {
        console.log('\n🔄 Re-escaneando arquivos .feeds...');
        scanAndWatchFeedsFiles();
    }, 300000); // A cada 5 minutos

    console.log('✅ File System Watcher iniciado com sucesso!');
    
    // Função para parar todos os watchers (útil para cleanup)
    return {
        stop: () => {
            console.log('\n🛑 Parando File System Watcher...');
            
            // Para todos os watchers de arquivos
            for (const filename of activeWatchers.keys()) {
                stopWatchingFile(filename);
            }
            
            // Para o watcher do diretório
            if (directoryWatcher) {
                directoryWatcher.close();
            }
            
            // Para o intervalo de re-escaneamento
            clearInterval(rescanInterval);
            
            console.log('✅ File System Watcher parado!');
        }
    };
}

/**
 * Função utilitária para obter status dos watchers
 */
export function getWatcherStatus() {
    return {
        activeWatchers: Array.from(activeWatchers.keys()),
        watcherCount: activeWatchers.size
    };
}

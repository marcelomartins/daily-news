import { startCronJobs } from '$lib/server/cron';
import { startFeedsWatcher } from '$lib/server/feedsWatcher';

console.log('Aplicação Iniciada!');

// Inicia o sistema de cron jobs (para processamento inicial e backup)
startCronJobs();

// Inicia o File System Watcher para monitorar alterações nos arquivos .feeds
startFeedsWatcher();


import cron from 'node-cron';

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

// Amostra usada para medir a cadencia. Precisa cobrir um dia inteiro de uma
// expressao com varios horarios fixos (ex.: "0 7,13,19 * * *"), senao o maior
// intervalo do dia - justamente o que importa para o TTL - passa despercebido.
const CADENCE_SAMPLE_RUNS = 10;

export const DEFAULT_HEADLINES_INTERVAL_MINUTES = 120;

/**
 * Converte "a cada N minutos" na expressao cron mais proxima.
 *
 * Nem todo intervalo tem expressao cron exata: acima de 59 minutos o passo
 * precisa cair no campo de horas, entao algo como "a cada 90 minutos" nao e
 * representavel. Nesses casos arredondamos para a hora mais proxima e quem
 * chama avisa o usuario.
 *
 * @param {number} intervalMinutes
 * @returns {string}
 */
export function intervalMinutesToCron(intervalMinutes) {
	const minutes = Math.max(1, Math.floor(intervalMinutes));

	if (minutes >= MINUTES_PER_DAY) {
		return '0 0 * * *';
	}

	if (minutes % MINUTES_PER_HOUR === 0) {
		return `0 */${minutes / MINUTES_PER_HOUR} * * *`;
	}

	if (minutes < MINUTES_PER_HOUR) {
		return `*/${minutes} * * * *`;
	}

	const hours = Math.max(1, Math.round(minutes / MINUTES_PER_HOUR));
	return `0 */${hours} * * *`;
}

/**
 * Pergunta ao proprio node-cron quando a expressao dispara, em vez de confiar
 * na nossa aritmetica. Assim um passo fora de faixa (ex.: "*\/90" no campo de
 * minutos, que na pratica roda de hora em hora) aparece em vez de passar batido.
 *
 * @param {string} expression
 * @returns {{ uniform: boolean, intervalMinutes: number | null, maxIntervalMinutes: number, deltas: number[] } | null}
 */
export function measureCadence(expression) {
	try {
		const task = cron.createTask(expression, () => {});
		const runs = task.getNextRuns(CADENCE_SAMPLE_RUNS).map(run => new Date(run).getTime());
		task.destroy();

		if (runs.length < 2) {
			return null;
		}

		const deltas = runs.slice(1).map((run, index) => Math.round((run - runs[index]) / 60000));
		const uniform = deltas.every(delta => delta === deltas[0]);

		return {
			uniform,
			intervalMinutes: uniform ? deltas[0] : null,
			maxIntervalMinutes: Math.max(...deltas),
			deltas
		};
	} catch {
		return null;
	}
}

/**
 * Resolve o agendamento de um job a partir do ambiente.
 *
 * Uma expressao cron explicita sempre vence; o intervalo em minutos e o atalho
 * para o caso comum. Divergencias entre o intervalo pedido e o que o cron
 * realmente faz sao registradas no log.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {string | undefined} options.cronExpression
 * @param {string | undefined} options.intervalMinutes
 * @param {number} options.defaultIntervalMinutes
 * @param {(message: string) => void} [options.log]
 * @param {(message: string) => void} [options.warn]
 * @returns {{ expression: string, description: string, maxIntervalMinutes: number | null }}
 */
export function resolveSchedule({
	label,
	cronExpression,
	intervalMinutes,
	defaultIntervalMinutes,
	log = console.log,
	warn = console.warn
}) {
	const rawCron = (cronExpression || '').trim();

	if (rawCron) {
		if (cron.validate(rawCron)) {
			const cadence = measureCadence(rawCron);
			const description = cadence?.uniform
				? `${rawCron} (a cada ${cadence.intervalMinutes} min)`
				: rawCron;
			return {
				expression: rawCron,
				description,
				maxIntervalMinutes: cadence?.maxIntervalMinutes ?? null
			};
		}

		warn(`[${label}] Expressao cron invalida: "${rawCron}". Voltando para o intervalo em minutos.`);
	}

	const parsed = Number.parseInt(intervalMinutes || '', 10);
	const requestedMinutes =
		Number.isFinite(parsed) && parsed > 0 ? parsed : defaultIntervalMinutes;

	if (intervalMinutes && !(Number.isFinite(parsed) && parsed > 0)) {
		warn(`[${label}] Intervalo invalido: "${intervalMinutes}". Usando ${defaultIntervalMinutes} min.`);
	}

	const expression = intervalMinutesToCron(requestedMinutes);
	const cadence = measureCadence(expression);

	if (cadence && !cadence.uniform) {
		warn(
			`[${label}] ${requestedMinutes} min gera intervalos irregulares (${cadence.deltas.slice(0, 4).join(', ')} min). ` +
				`Use ${label}_CRON para controle exato.`
		);
	} else if (cadence && cadence.intervalMinutes !== requestedMinutes) {
		warn(
			`[${label}] Nao existe expressao cron para ${requestedMinutes} min; ` +
				`sera executado a cada ${cadence.intervalMinutes} min. Use ${label}_CRON para controle exato.`
		);
	}

	const effectiveMinutes = cadence?.intervalMinutes ?? requestedMinutes;
	return {
		expression,
		description: `${expression} (a cada ${effectiveMinutes} min)`,
		maxIntervalMinutes: cadence?.maxIntervalMinutes ?? requestedMinutes
	};
}

/**
 * Agendamento do plugin de headlines.
 *
 * Vive aqui, e nao dentro do plugin, porque o job de RSS tambem precisa saber
 * de quanto em quanto tempo o plugin roda para dimensionar o TTL do cache -
 * e importar o plugin so para isso arrastaria o Puppeteer junto.
 *
 * @param {object} [options]
 * @param {(message: string) => void} [options.log]
 * @param {(message: string) => void} [options.warn]
 * @returns {{ expression: string, description: string, maxIntervalMinutes: number | null }}
 */
export function resolveHeadlinesSchedule({ log, warn } = {}) {
	return resolveSchedule({
		label: 'HEADLINES',
		cronExpression: process.env.HEADLINES_CRON,
		intervalMinutes: process.env.HEADLINES_INTERVAL_MINUTES,
		defaultIntervalMinutes: DEFAULT_HEADLINES_INTERVAL_MINUTES,
		log,
		warn
	});
}

const lockQueues = new Map();

/**
 * Serializa execucoes assicronas por chave.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export async function withKeyLock(key, task) {
	const previous = lockQueues.get(key) || Promise.resolve();

	/** @type {(value?: unknown) => void} */
	let release = () => {};
	const signal = new Promise((resolve) => {
		release = resolve;
	});

	const queueTail = previous.then(() => signal);
	lockQueues.set(key, queueTail);

	await previous;

	try {
		return await task();
	} finally {
		release();
		if (lockQueues.get(key) === queueTail) {
			lockQueues.delete(key);
		}
	}
}

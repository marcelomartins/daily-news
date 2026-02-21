import fs from 'fs/promises';
import path from 'path';

/**
 * Escreve JSON de forma atomica para reduzir risco de arquivo parcial.
 * @param {string} filePath
 * @param {unknown} data
 * @returns {Promise<void>}
 */
export async function writeJsonAtomic(filePath, data) {
	const directory = path.dirname(filePath);
	const fileName = path.basename(filePath);
	const tempFilePath = path.join(
		directory,
		`.${fileName}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
	);

	await fs.mkdir(directory, { recursive: true });

	try {
		await fs.writeFile(tempFilePath, JSON.stringify(data, null, 2), 'utf8');
		await fs.rename(tempFilePath, filePath);
	} catch (error) {
		await fs.unlink(tempFilePath).catch(() => {});
		throw error;
	}
}

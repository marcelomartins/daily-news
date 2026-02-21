const INVALID_FILE_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/;
const RESERVED_WINDOWS_BASENAMES = new Set([
	'con',
	'prn',
	'aux',
	'nul',
	'com1',
	'com2',
	'com3',
	'com4',
	'com5',
	'com6',
	'com7',
	'com8',
	'com9',
	'lpt1',
	'lpt2',
	'lpt3',
	'lpt4',
	'lpt5',
	'lpt6',
	'lpt7',
	'lpt8',
	'lpt9'
]);

/**
 * @param {string | undefined | null} rawValue
 * @returns {string}
 */
export function normalizeIdentifier(rawValue) {
	return String(rawValue || '')
		.normalize('NFKC')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isSafeFileIdentifier(value) {
	if (!value || value.length > 120) {
		return false;
	}

	if (value === '.' || value === '..' || value.includes('..')) {
		return false;
	}

	if (INVALID_FILE_CHARS_REGEX.test(value)) {
		return false;
	}

	if (value.endsWith('.') || value.endsWith(' ')) {
		return false;
	}

	return true;
}

/**
 * @param {string | undefined | null} rawValue
 * @returns {string}
 */
export function sanitizeUserIdentifier(rawValue) {
	const normalized = normalizeIdentifier(rawValue);
	if (!isSafeFileIdentifier(normalized)) {
		return '';
	}

	const normalizedLower = normalized.toLowerCase();
	if (RESERVED_WINDOWS_BASENAMES.has(normalizedLower)) {
		return '';
	}

	return normalized;
}

/**
 * @param {string | undefined | null} rawValue
 * @returns {string}
 */
export function sanitizeCategoryIdentifier(rawValue) {
	const normalized = normalizeIdentifier(rawValue);
	if (!isSafeFileIdentifier(normalized)) {
		return '';
	}

	return normalized;
}

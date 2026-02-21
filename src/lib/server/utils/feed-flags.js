const SUPPORTED_FLAGS = new Set(['headline', 'new-tab', 'no-rss']);

/**
 * @param {string} rawFlag
 * @returns {string}
 */
function normalizeFlag(rawFlag) {
	return String(rawFlag || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/_/g, '-');
}

/**
 * @param {string} rawValue
 * @returns {{headline: boolean, newTab: boolean, noRss: boolean, unknownFlags: string[]}}
 */
function parseExplicitFlags(rawValue) {
	/** @type {{headline: boolean, newTab: boolean, noRss: boolean, unknownFlags: string[]}} */
	const result = {
		headline: false,
		newTab: false,
		noRss: false,
		unknownFlags: []
	};

	for (const token of String(rawValue || '').split(',')) {
		const normalized = normalizeFlag(token);
		if (!normalized) {
			continue;
		}

		if (!SUPPORTED_FLAGS.has(normalized)) {
			result.unknownFlags.push(normalized);
			continue;
		}

		if (normalized === 'headline') {
			result.headline = true;
		} else if (normalized === 'new-tab') {
			result.newTab = true;
		} else if (normalized === 'no-rss') {
			result.noRss = true;
		}
	}

	return result;
}

/**
 * @param {string} rawLine
 * @returns {{
 *   url: string,
 *   originalUrl: string,
 *   hasExplicitFlags: boolean,
 *   flags: {headline: boolean, newTab: boolean, noRss: boolean},
 *   unknownFlags: string[]
 * } | null}
 */
export function parseFeedSourceLine(rawLine) {
	const line = String(rawLine || '').trim();
	if (!line || line.startsWith('#')) {
		return null;
	}

	let url = line;
	let hasExplicitFlags = false;
	/** @type {{headline: boolean, newTab: boolean, noRss: boolean, unknownFlags: string[]}} */
	let parsedFlags = {
		headline: false,
		newTab: false,
		noRss: false,
		unknownFlags: []
	};

	if (line.endsWith(']')) {
		const bracketStart = line.lastIndexOf('[');
		if (bracketStart > 0) {
			hasExplicitFlags = true;
			url = line.slice(0, bracketStart).trim();
			parsedFlags = parseExplicitFlags(line.slice(bracketStart + 1, -1));
		}
	}

	if (!url.startsWith('http')) {
		return null;
	}

	return {
		url,
		originalUrl: line,
		hasExplicitFlags,
		flags: {
			headline: parsedFlags.headline,
			newTab: parsedFlags.newTab,
			noRss: parsedFlags.noRss
		},
		unknownFlags: parsedFlags.unknownFlags
	};
}

/**
 * @fileoverview Minimal .env loader for runtimes without process.loadEnvFile().
 */

import fs from "node:fs";

/**
 * Removes matching quotes from a value.
 * @param {string} value The value to unquote.
 * @returns {string} The unquoted value.
 */
function unquote(value) {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	return value;
}

/**
 * Loads environment variables from CROSSPOST_DOTENV.
 * @returns {void}
 */
export function loadCrosspostDotenv() {
	if (!process.env.CROSSPOST_DOTENV) {
		return;
	}

	const filePath =
		process.env.CROSSPOST_DOTENV === "1"
			? ".env"
			: process.env.CROSSPOST_DOTENV;

	let contents;

	try {
		contents = fs.readFileSync(filePath, "utf8");
	} catch (error) {
		const fileError = /** @type {NodeJS.ErrnoException} */ (error);

		if (fileError.code !== "ENOENT") {
			throw fileError;
		}
		return;
	}

	for (const line of contents.split(/\r?\n/u)) {
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const separatorIndex = trimmed.indexOf("=");

		if (separatorIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, separatorIndex).trim();
		const value = unquote(trimmed.slice(separatorIndex + 1).trim());

		if (key && process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

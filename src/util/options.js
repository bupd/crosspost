/**
 * @fileoverview Utilities for working with options objects.
 * @author Nicholas C. Zakas
 */

//-----------------------------------------------------------------------------
// Type Definitions
//-----------------------------------------------------------------------------

/** @typedef {import("../types.js").PostOptions} PostOptions */
/** @typedef {import("../types.js").MediaEmbedArray} MediaEmbedArray */

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

/**
 * Validates post options to ensure they meet requirements
 * @param {PostOptions} [options] The options to validate
 * @throws {TypeError} If the options are invalid
 * @returns {void}
 */
export function validatePostOptions(options) {
	if (!options) {
		return;
	}

	if (options.images && !Array.isArray(options.images)) {
		throw new TypeError("images must be an array.");
	}

	if (options.media && !Array.isArray(options.media)) {
		throw new TypeError("media must be an array.");
	}

	if (options.images) {
		for (const image of options.images) {
			if (!image.data) {
				throw new TypeError("Image must have data.");
			}
			if (!(image.data instanceof Uint8Array)) {
				throw new TypeError("Image data must be a Uint8Array.");
			}
		}
	}

	if (options.media) {
		for (const media of options.media) {
			if (!media.data) {
				throw new TypeError("Media must have data.");
			}
			if (!(media.data instanceof Uint8Array)) {
				throw new TypeError("Media data must be a Uint8Array.");
			}
			if (media.type !== "image" && media.type !== "video") {
				throw new TypeError('Media type must be "image" or "video".');
			}
			if (!media.mimeType) {
				throw new TypeError("Media must have a MIME type.");
			}
		}
	}
}

/**
 * Gets the normalized media from post options.
 * @param {PostOptions} [options] The options to inspect.
 * @returns {MediaEmbedArray|[]} The media array.
 */
export function getPostMedia(options) {
	if (options?.media) {
		return options.media;
	}

	if (options?.images) {
		return /** @type {MediaEmbedArray} */ (
			options.images.map(image => ({
				...image,
				type: "image",
				mimeType: "",
			}))
		);
	}

	return [];
}

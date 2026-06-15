/**
 * @fileoverview Twitter strategy for posting tweets.
 * @author Nicholas C. Zakas
 */
/* global Buffer */

//-----------------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------------

import { TwitterApi } from "twitter-api-v2";
import { validatePostOptions } from "../util/options.js";
import { getImageMimeType } from "../util/images.js";

//-----------------------------------------------------------------------------
// Type Definitions
//-----------------------------------------------------------------------------

/**
 * @typedef {Object} EmusksClient
 * @property {(options: Object) => Promise<any>} login Logs in to X.
 * @property {Object} media Media API.
 * @property {(source: any, options: Object) => Promise<{media_id?: string|number, media_id_string?: string}>} media.create Uploads media.
 * @property {Object} tweets Tweets API.
 * @property {(message: string, options?: Object) => Promise<object>} tweets.create Creates a tweet.
 *
 * @typedef {Object} TwitterOptions
 * @property {string} [authToken] The X auth_token cookie value for emusks.
 * @property {string} [authClient] The emusks client identity to use.
 * @property {string} [endpoint] The emusks GraphQL endpoint to use.
 * @property {string} [proxy] The proxy URL to use with emusks.
 * @property {() => EmusksClient|Promise<EmusksClient>} [createEmusksClient] Creates an emusks client.
 * @property {string} [accessTokenKey] The access token for the Twitter app.
 * @property {string} [accessTokenSecret] The access token secret for the Twitter app.
 * @property {string} [apiConsumerKey] The app (consumer) key for the Twitter app.
 * @property {string} [apiConsumerSecret] The app (consumer) secret for the Twitter app.
 *
 * @typedef {Object} TwitterPostResponse
 * @property {string} [id] The ID of the tweet.
 * @property {Object} [data] The data of the posted tweet.
 * @property {string} [data.id] The ID of the tweet.
 * @property {string} [data.text] The text content of the tweet.
 * @property {string[]} [data.edit_history_tweet_ids] The edit history tweet IDs.
 */

/** @typedef {[string]|[string,string]|[string,string,string]|[string,string,string,string]} TwitterMediaIdArray */

/** @typedef {import("../types.js").PostOptions} PostOptions */

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

/**
 * Creates an emusks client lazily to avoid import-time side effects for users who
 * don't post to X with auth-token credentials.
 * @returns {Promise<EmusksClient>} A new emusks client.
 */
async function createEmusksClientFromModule() {
	// @ts-ignore emusks doesn't currently publish TypeScript declarations.
	const { default: Emusks } = await import("emusks");
	return new Emusks();
}

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

/**
 * A strategy for posting to Twitter.
 */
export class TwitterStrategy {
	/**
	 * The ID of the strategy.
	 * @type {string}
	 * @readonly
	 */
	id = "twitter";

	/**
	 * The display name of the strategy.
	 * @type {string}
	 * @readonly
	 */
	name = "X (formerly Twitter)";

	/**
	 * Options for this instance.
	 * @type {TwitterOptions}
	 */
	#options;

	/**
	 * Creates a new instance.
	 * @param {TwitterOptions} options Options for the instance.
	 * @throws {Error} When options are missing.
	 */
	constructor(options) {
		const {
			authToken,
			accessTokenKey,
			accessTokenSecret,
			apiConsumerKey,
			apiConsumerSecret,
		} = options;

		if (authToken) {
			this.#options = options;
			return;
		}

		if (!accessTokenKey) {
			throw new TypeError("Missing Twitter access token key.");
		}

		if (!accessTokenSecret) {
			throw new TypeError("Missing Twitter access token secret.");
		}

		if (!apiConsumerKey) {
			throw new TypeError("Missing Twitter consumer key.");
		}

		if (!apiConsumerSecret) {
			throw new TypeError("Missing Twitter consumer secret.");
		}

		this.#options = options;
	}

	/**
	 * Posts a message to Twitter.
	 * @param {string} message The message to tweet.
	 * @param {PostOptions} [postOptions] Additional options for the post.
	 * @returns {Promise<object>} A promise that resolves with the tweet data.
	 */
	async post(message, postOptions) {
		if (!message) {
			throw new TypeError("Missing message to tweet.");
		}

		validatePostOptions(postOptions);
		postOptions?.signal?.throwIfAborted();

		if (this.#options.authToken) {
			return this.#postWithEmusks(message, postOptions);
		}

		return this.#postWithTwitterApi(message, postOptions);
	}

	/**
	 * Posts a message with emusks.
	 * @param {string} message The message to tweet.
	 * @param {PostOptions} [postOptions] Additional options for the post.
	 * @returns {Promise<object>} A promise that resolves with the tweet data.
	 */
	async #postWithEmusks(message, postOptions) {
		const { authToken, authClient, endpoint, proxy, createEmusksClient } =
			this.#options;
		const client = createEmusksClient
			? await createEmusksClient()
			: await createEmusksClientFromModule();

		await client.login({
			auth_token: authToken,
			client: authClient,
			endpoint,
			proxy,
		});

		postOptions?.signal?.throwIfAborted();

		if (postOptions?.images?.length) {
			const mediaIds = await Promise.all(
				postOptions.images.map(image =>
					client.media
						.create(Buffer.from(image.data), {
							alt_text: image.alt,
							mediaType: getImageMimeType(image.data),
						})
						.then(media =>
							String(media.media_id_string ?? media.media_id),
						),
				),
			);

			postOptions?.signal?.throwIfAborted();

			return client.tweets.create(message, { mediaIds });
		}

		return client.tweets.create(message);
	}

	/**
	 * Posts a message with the official Twitter API.
	 * @param {string} message The message to tweet.
	 * @param {PostOptions} [postOptions] Additional options for the post.
	 * @returns {Promise<object>} A promise that resolves with the tweet data.
	 */
	async #postWithTwitterApi(message, postOptions) {
		const {
			accessTokenKey,
			accessTokenSecret,
			apiConsumerKey,
			apiConsumerSecret,
		} = this.#options;

		const client = new TwitterApi(
			/** @type {any} */ ({
				appKey: apiConsumerKey,
				appSecret: apiConsumerSecret,
				accessToken: accessTokenKey,
				accessSecret: accessTokenSecret,
			}),
		);

		// if there are images, upload them first
		if (postOptions?.images?.length) {
			const mediaIds = await Promise.all(
				postOptions.images.map(image =>
					client.v2
						.uploadMedia(Buffer.from(image.data), {
							media_type: getImageMimeType(image.data),
						})
						.then(mediaId => {
							if (image.alt) {
								// https://docs.x.com/x-api/media/metadata-create
								return client.v2
									.post("media/metadata", {
										id: mediaId,
										metadata: {
											alt_text: {
												text: image.alt,
											},
										},
									})
									.then(() => mediaId);
							}

							return mediaId;
						}),
				),
			);

			postOptions?.signal?.throwIfAborted();

			return client.v2.tweet(message, {
				media: {
					media_ids: /** @type {TwitterMediaIdArray} */ (mediaIds),
				},
			});
		}

		return client.v2.tweet(message);
	}

	/**
	 * Extracts a URL from a Twitter API response.
	 * @param {TwitterPostResponse} response The response from the Twitter API post request.
	 * @returns {string} The URL for the tweet.
	 */
	getUrlFromResponse(response) {
		const id = response?.data?.id ?? response?.id;
		if (!id) {
			throw new Error("Tweet ID not found in response");
		}

		// This format works without knowing the username - Twitter will redirect appropriately
		return `https://x.com/i/web/status/${id}`;
	}

	/**
	 * Maximum length of a tweet in characters.
	 * @type {number}
	 * @const
	 */
	MAX_MESSAGE_LENGTH = 280;

	/**
	 * Calculates the length of a message according to Twitter's algorithm.
	 * URLs are counted as 23 characters for http:// or https:// URLs regardless of their actual length.
	 * @param {string} message The message to calculate the length of.
	 * @returns {number} The calculated length of the message.
	 */
	calculateMessageLength(message) {
		// Replace URLs with 23 characters (Twitter's t.co length)
		const urlAdjusted = message.replace(
			/https?:\/\/[^\s]+/g,
			"x".repeat(23),
		);
		return [...urlAdjusted].length;
	}
}

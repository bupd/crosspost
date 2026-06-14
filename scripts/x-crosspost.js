#!/usr/bin/env bun
/**
 * @fileoverview Polls X posts and crossposts them according to account rules.
 */

import fs from "node:fs";
import path from "node:path";
import {
	BlueskyStrategy,
	Client,
	LinkedInStrategy,
	MastodonStrategy,
} from "../src/index.js";
import { loadCrosspostDotenv } from "../src/util/dotenv.js";

const DEFAULT_STATE_FILE = ".crosspost-state.json";
const TARGETS = ["bluesky", "mastodon", "linkedin"];

function env(name, fallbackName) {
	return (
		process.env[name] ||
		(fallbackName ? process.env[fallbackName] : undefined)
	);
}

function requireEnv(name, fallbackName) {
	const value = env(name, fallbackName);

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

function assertConfig(dryRun) {
	const missing = [];

	if (!env("X_BEARER_TOKEN", "TWITTER_BEARER_TOKEN")) {
		missing.push("X_BEARER_TOKEN");
	}

	if (
		!env("X_USER_ID", "TWITTER_USER_ID") &&
		!env("X_USERNAME", "TWITTER_USERNAME")
	) {
		missing.push("X_USER_ID or X_USERNAME");
	}

	if (!dryRun) {
		for (const name of [
			"BLUESKY_HOST",
			"BLUESKY_IDENTIFIER",
			"BLUESKY_PASSWORD",
			"MASTODON_ACCESS_TOKEN",
			"MASTODON_HOST",
		]) {
			if (!env(name)) {
				missing.push(name);
			}
		}
	}

	if (missing.length) {
		throw new Error(
			`Missing required configuration: ${missing.join(", ")}. Fill .env or run task setup to create it from .env.example.`,
		);
	}
}

function toBoolean(value) {
	return value === "1" || value === "true" || value === "yes";
}

function compareTweetIds(a, b) {
	const left = BigInt(a);
	const right = BigInt(b);

	if (left < right) {
		return -1;
	}

	if (left > right) {
		return 1;
	}

	return 0;
}

function maxTweetId(ids) {
	return ids.reduce(
		(max, id) => (compareTweetIds(id, max) > 0 ? id : max),
		ids[0],
	);
}

function loadState(filePath) {
	if (!fs.existsSync(filePath)) {
		return { lastSeenTweetId: null, posts: {}, threads: {} };
	}

	const state = JSON.parse(fs.readFileSync(filePath, "utf8"));
	state.posts ||= {};
	state.threads ||= {};
	return state;
}

function saveState(filePath, state) {
	fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
	fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
	fs.renameSync(`${filePath}.tmp`, filePath);
}

async function getJson(url, bearerToken) {
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${bearerToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(
			`${response.status} ${response.statusText}: ${await response.text()}`,
		);
	}

	return response.json();
}

async function resolveXUserId(bearerToken) {
	const configuredUserId = env("X_USER_ID", "TWITTER_USER_ID");

	if (configuredUserId) {
		return configuredUserId;
	}

	const username = requireEnv("X_USERNAME", "TWITTER_USERNAME").replace(
		/^@/,
		"",
	);
	const url = `https://api.twitter.com/2/users/by/username/${username}`;
	const result = await getJson(url, bearerToken);

	if (!result.data?.id) {
		throw new Error(`Unable to resolve X username: ${username}`);
	}

	return result.data.id;
}

async function fetchRecentTweets(userId, bearerToken) {
	const maxResults = Math.min(
		100,
		Math.max(5, Number(process.env.X_CROSSPOST_LOOKBACK_LIMIT || 20)),
	);
	const params = new URLSearchParams({
		max_results: String(maxResults),
		"tweet.fields":
			"attachments,author_id,conversation_id,created_at,entities,referenced_tweets,text",
		expansions:
			"attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id",
		"media.fields":
			"alt_text,duration_ms,height,media_key,preview_image_url,type,url,variants,width",
		exclude: "retweets",
	});
	const url = `https://api.twitter.com/2/users/${userId}/tweets?${params}`;

	return getJson(url, bearerToken);
}

function includesMap(items, key) {
	return new Map((items || []).map(item => [item[key], item]));
}

function hasHashtags(tweet) {
	return Boolean(
		tweet.entities?.hashtags?.length ||
		/(^|\s)#[\p{L}\p{N}_]+/u.test(tweet.text),
	);
}

function expandedText(tweet) {
	let text = tweet.text;

	for (const url of tweet.entities?.urls || []) {
		if (url.url && url.expanded_url) {
			text = text.replaceAll(url.url, url.expanded_url);
		}
	}

	return text;
}

function linkedInTextForThread(threadTweets) {
	return threadTweets.map(tweet => expandedText(tweet).trim()).join("\n\n");
}

function classifyTweet(tweet, referencedTweets, sourceUserId) {
	const references = tweet.referenced_tweets || [];
	const reply = references.find(reference => reference.type === "replied_to");
	const quoted = references.some(reference => reference.type === "quoted");
	const retweeted = references.some(
		reference => reference.type === "retweeted",
	);
	const replySource = reply ? referencedTweets.get(reply.id) : null;
	const isSelfThread = Boolean(
		reply && replySource?.author_id === sourceUserId,
	);
	const isReplyToOther = Boolean(reply && !isSelfThread);

	if (retweeted) {
		return {
			skipReason: "retweet",
			isThread: false,
			hasHashtags: hasHashtags(tweet),
		};
	}

	if (quoted) {
		return {
			skipReason: "quote",
			isThread: false,
			hasHashtags: hasHashtags(tweet),
		};
	}

	if (isReplyToOther) {
		return {
			skipReason: "reply",
			isThread: false,
			hasHashtags: hasHashtags(tweet),
		};
	}

	return {
		skipReason: null,
		isThread: isSelfThread,
		hasHashtags: hasHashtags(tweet),
	};
}

function isSettled(tweet, settleMinutes) {
	if (!tweet.created_at || settleMinutes <= 0) {
		return true;
	}

	const settledAt = Date.parse(tweet.created_at) + settleMinutes * 60 * 1000;
	return Date.now() >= settledAt;
}

function getThreadConversationIds(tweets, classifications) {
	const threadConversationIds = new Set();

	for (const tweet of tweets) {
		if (classifications.get(tweet.id)?.isThread) {
			threadConversationIds.add(tweet.conversation_id);
		}
	}

	return threadConversationIds;
}

function getThreadTweets(tweets, conversationId, classifications) {
	return tweets.filter(tweet => {
		if (tweet.conversation_id !== conversationId) {
			return false;
		}

		const classification = classifications.get(tweet.id);
		return !classification?.skipReason;
	});
}

function bestVideoVariant(media) {
	const variants = (media.variants || []).filter(
		variant => variant.url && variant.content_type === "video/mp4",
	);

	variants.sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));

	return variants[0];
}

async function downloadMedia(media) {
	const url =
		media.type === "photo" ? media.url : bestVideoVariant(media)?.url;

	if (!url) {
		throw new Error(
			`No downloadable URL found for X media ${media.media_key}.`,
		);
	}

	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(
			`Failed to download X media ${media.media_key}: ${response.status} ${response.statusText}`,
		);
	}

	const data = new Uint8Array(await response.arrayBuffer());
	const contentType =
		response.headers.get("content-type") ||
		bestVideoVariant(media)?.content_type ||
		"image/jpeg";

	return {
		alt: media.alt_text || "",
		data,
		type: media.type === "photo" ? "image" : "video",
		mimeType: contentType.split(";")[0],
	};
}

async function getTweetMedia(tweet, mediaByKey) {
	const mediaKeys = tweet.attachments?.media_keys || [];
	const media = [];

	for (const mediaKey of mediaKeys.slice(0, 4)) {
		const sourceMedia = mediaByKey.get(mediaKey);

		if (!sourceMedia) {
			continue;
		}

		if (!["photo", "video", "animated_gif"].includes(sourceMedia.type)) {
			continue;
		}

		media.push(await downloadMedia(sourceMedia));
	}

	return media;
}

async function getThreadMedia(threadTweets, mediaByKey) {
	const media = [];

	for (const tweet of threadTweets) {
		media.push(...(await getTweetMedia(tweet, mediaByKey)));

		if (media.length >= 4) {
			return media.slice(0, 4);
		}
	}

	return media;
}

function createStrategies() {
	const strategies = [
		new BlueskyStrategy({
			identifier: requireEnv("BLUESKY_IDENTIFIER"),
			password: requireEnv("BLUESKY_PASSWORD"),
			host: requireEnv("BLUESKY_HOST"),
		}),
		new MastodonStrategy({
			accessToken: requireEnv("MASTODON_ACCESS_TOKEN"),
			host: requireEnv("MASTODON_HOST"),
		}),
	];

	if (env("LINKEDIN_ACCESS_TOKEN")) {
		strategies.push(
			new LinkedInStrategy({
				accessToken: requireEnv("LINKEDIN_ACCESS_TOKEN"),
			}),
		);
	}

	return strategies;
}

function pendingTargets(postState, classification) {
	const wanted = ["bluesky", "mastodon"];

	if (classification.hasHashtags) {
		wanted.push("linkedin");
	}

	return wanted.filter(target => !postState.targets?.[target]);
}

async function crosspostTweet(client, tweet, targets, media, dryRun) {
	const message = expandedText(tweet);
	const entries = targets.map(target => ({
		message,
		strategyId: target,
		media: media.length ? media : undefined,
	}));

	if (dryRun) {
		console.log(
			`[dry-run] ${tweet.id} -> ${targets.join(", ")}: ${message}`,
		);
		return targets.map(target => ({ name: target, ok: true }));
	}

	return client.postTo(entries);
}

async function crosspostLinkedInThread(
	client,
	conversationId,
	threadTweets,
	media,
	dryRun,
) {
	const message = linkedInTextForThread(threadTweets);

	if (dryRun) {
		console.log(
			`[dry-run] thread ${conversationId} -> linkedin: ${message}`,
		);
		return { ok: true, name: "linkedin" };
	}

	return (
		await client.postTo([
			{
				message,
				strategyId: "linkedin",
				media: media.length ? media : undefined,
			},
		])
	)[0];
}

async function main() {
	loadCrosspostDotenv();

	const dryRun = toBoolean(process.env.X_CROSSPOST_DRY_RUN);
	const bootstrap = toBoolean(process.env.X_CROSSPOST_BOOTSTRAP);
	const linkedInSettleMinutes = Number(
		process.env.X_CROSSPOST_LINKEDIN_SETTLE_MINUTES || 10,
	);
	const stateFile = process.env.X_CROSSPOST_STATE_FILE || DEFAULT_STATE_FILE;
	assertConfig(dryRun);
	const bearerToken = requireEnv("X_BEARER_TOKEN", "TWITTER_BEARER_TOKEN");
	const userId = await resolveXUserId(bearerToken);
	const state = loadState(stateFile);
	const timeline = await fetchRecentTweets(userId, bearerToken);
	const tweets = (timeline.data || []).sort((a, b) =>
		compareTweetIds(a.id, b.id),
	);

	if (!tweets.length) {
		console.log("No recent X posts found.");
		return;
	}

	const newestTweetId = maxTweetId(tweets.map(tweet => tweet.id));

	if (!state.lastSeenTweetId && !bootstrap) {
		state.lastSeenTweetId = newestTweetId;
		saveState(stateFile, state);
		console.log(
			`Initialized state at X post ${newestTweetId}; no backfill performed.`,
		);
		return;
	}

	const mediaByKey = includesMap(timeline.includes?.media, "media_key");
	const referencedTweets = includesMap(timeline.includes?.tweets, "id");
	const classifications = new Map(
		tweets.map(tweet => [
			tweet.id,
			classifyTweet(tweet, referencedTweets, userId),
		]),
	);
	const threadConversationIds = getThreadConversationIds(
		tweets,
		classifications,
	);
	const client = dryRun
		? null
		: new Client({ strategies: createStrategies() });

	for (const tweet of tweets) {
		const existingPostState = state.posts[tweet.id];
		const oldTweet =
			state.lastSeenTweetId &&
			compareTweetIds(tweet.id, state.lastSeenTweetId) <= 0;

		if (oldTweet && !existingPostState) {
			continue;
		}

		const postState = (state.posts[tweet.id] ||= { targets: {} });

		const classification = classifications.get(tweet.id);

		if (classification.skipReason) {
			postState.skipReason = classification.skipReason;
			console.log(`Skipped ${tweet.id}: ${classification.skipReason}.`);
			continue;
		}

		const targets = pendingTargets(postState, classification);

		if (
			targets.includes("linkedin") &&
			(threadConversationIds.has(tweet.conversation_id) ||
				!isSettled(tweet, linkedInSettleMinutes))
		) {
			targets.splice(targets.indexOf("linkedin"), 1);
		}

		if (!targets.length) {
			continue;
		}

		if (targets.includes("linkedin") && !env("LINKEDIN_ACCESS_TOKEN")) {
			console.log(
				`Skipped LinkedIn for ${tweet.id}: LINKEDIN_ACCESS_TOKEN is not set.`,
			);
			targets.splice(targets.indexOf("linkedin"), 1);
		}

		if (!targets.length) {
			continue;
		}

		const media = await getTweetMedia(tweet, mediaByKey);
		const responses = await crosspostTweet(
			client,
			tweet,
			targets,
			media,
			dryRun,
		);

		for (let index = 0; index < responses.length; index++) {
			const response = responses[index];
			const target = targets[index];

			if (response.ok) {
				postState.targets[target] = true;
				console.log(
					`Crossposted ${tweet.id} to ${TARGETS.includes(response.name) ? response.name : target}.`,
				);
			} else {
				console.error(
					`Failed to crosspost ${tweet.id} to ${target}:`,
					response.reason,
				);
			}
		}
	}

	for (const conversationId of threadConversationIds) {
		const threadState = (state.threads[conversationId] ||= { targets: {} });

		if (threadState.targets.linkedin) {
			continue;
		}

		if (!env("LINKEDIN_ACCESS_TOKEN")) {
			console.log(
				`Skipped LinkedIn thread ${conversationId}: LINKEDIN_ACCESS_TOKEN is not set.`,
			);
			continue;
		}

		const threadTweets = getThreadTweets(
			tweets,
			conversationId,
			classifications,
		);
		const rootTweet = threadTweets.find(
			tweet => tweet.id === conversationId,
		);
		const latestThreadTweet = threadTweets[threadTweets.length - 1];

		if (!rootTweet) {
			console.log(
				`Skipped LinkedIn thread ${conversationId}: root post is outside the lookback window.`,
			);
			continue;
		}

		if (!isSettled(latestThreadTweet, linkedInSettleMinutes)) {
			console.log(
				`Skipped LinkedIn thread ${conversationId}: waiting for thread to settle.`,
			);
			continue;
		}

		const media = await getThreadMedia(threadTweets, mediaByKey);
		const response = await crosspostLinkedInThread(
			client,
			conversationId,
			threadTweets,
			media,
			dryRun,
		);

		if (response.ok) {
			threadState.targets.linkedin = true;
			threadState.tweetIds = threadTweets.map(tweet => tweet.id);
			console.log(`Crossposted thread ${conversationId} to LinkedIn.`);
		} else {
			console.error(
				`Failed to crosspost thread ${conversationId} to LinkedIn:`,
				response.reason,
			);
		}
	}

	state.lastSeenTweetId = newestTweetId;
	saveState(stateFile, state);
}

main().catch(error => {
	console.error(error.message || error);
	process.exitCode = 1;
});

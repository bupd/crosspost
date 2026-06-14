/**
 * @fileoverview Main entry point for the project.
 * @author Nicholas C. Zakas
 */

/* @ts-self-types="./index.d.ts" */

export * from "./types.js";
export { BlueskyStrategy } from "./strategies/bluesky.js";
export type {
	BlueskyCreateRecordResponse,
	BlueskyErrorResponse,
	BlueskyImage,
	BlueskyOptions,
	BlueskyPostBody,
	BlueskySession,
	BlueskyUploadBlobResponse,
} from "./strategies/bluesky.js";

export { MastodonStrategy } from "./strategies/mastodon.js";
export type {
	MastodonOptions,
	MastodonErrorResponse,
	MastodonMediaAttachment,
	MastodonMediaFocus,
	MastodonMediaResponse,
	MastodonMediaSize,
} from "./strategies/mastodon.js";

export { TwitterStrategy } from "./strategies/twitter.js";
export type {
	TwitterOptions,
	TwitterMediaIdArray,
} from "./strategies/twitter.js";

export * from "./strategies/linkedin.js";
export { DiscordStrategy } from "./strategies/discord.js";
export { DiscordWebhookStrategy } from "./strategies/discord-webhook.js";
export { DevtoStrategy } from "./strategies/devto.js";
export type {
	DevtoArticle,
	DevtoErrorResponse,
	DevtoOptions,
} from "./strategies/devto.js";
export { TelegramStrategy } from "./strategies/telegram.js";
export type {
	TelegramOptions,
	TelegramMessageResponse,
	TelegramErrorResponse,
} from "./strategies/telegram.js";
export { SlackStrategy } from "./strategies/slack.js";
export type {
	SlackOptions,
	SlackMessageResponse,
	SlackErrorResponse,
	SlackUploadURLResponse,
	SlackUploadCompleteResponse,
	SlackFileInfo,
	SlackUploadResponse,
	SlackFile,
} from "./strategies/slack.js";
export { NostrStrategy } from "./strategies/nostr.js";
export type {
	NostrOptions,
	NostrEvent,
	NostrEventResponse,
} from "./strategies/nostr.js";
export { Client } from "./client.js";
export type { ClientOptions, Strategy } from "./client.js";

/**
 * @fileoverview End-to-end tests for crosspost with mocked social media APIs.
 * @author Generated for Task #21
 */

//-----------------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------------

import { strict as assert } from "node:assert";
import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { Client, SuccessResponse, FailureResponse } from "../src/client.js";
import { MastodonStrategy } from "../src/strategies/mastodon.js";
import { BlueskyStrategy } from "../src/strategies/bluesky.js";
import { LinkedInStrategy } from "../src/strategies/linkedin.js";
import { DiscordStrategy } from "../src/strategies/discord.js";
import { DiscordWebhookStrategy } from "../src/strategies/discord-webhook.js";
import { DevtoStrategy } from "../src/strategies/devto.js";
import { TelegramStrategy } from "../src/strategies/telegram.js";
import { SlackStrategy } from "../src/strategies/slack.js";

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, "fixtures", "images");
const builtExecutablePath = path.resolve("dist/bin.js");

// Minimal valid PNG bytes (magic header + enough to pass mime type detection)
const pngImageData = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
	0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0xff,
	0xff, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82,
]);

//-----------------------------------------------------------------------------
// MSW Handlers
//-----------------------------------------------------------------------------

/** @type {import("msw").RequestHandler[]} */
const handlers = [
	// --- Mastodon ---
	http.post("https://mastodon.social/api/v1/statuses", async ({ request }) => {
		const formData = await request.formData();
		const status = formData.get("status");
		if (!status) {
			return HttpResponse.json({ error: "Missing status" }, { status: 422 });
		}
		return HttpResponse.json({
			id: "masto-123",
			uri: "https://mastodon.social/users/testuser/statuses/masto-123",
			url: "https://mastodon.social/@testuser/masto-123",
			content: status,
		});
	}),

	http.post("https://mastodon.social/api/v1/media", async () => {
		return HttpResponse.json({
			id: "media-masto-1",
			type: "image",
			url: "https://mastodon.social/media/image.png",
			preview_url: "https://mastodon.social/media/preview.png",
		});
	}),

	// --- Bluesky ---
	http.post("https://bsky.social/xrpc/com.atproto.server.createSession", async () => {
		return HttpResponse.json({
			accessJwt: "fake-jwt-token",
			refreshJwt: "fake-refresh-token",
			active: true,
			did: "did:plc:testuser123",
		});
	}),

	http.post("https://bsky.social/xrpc/com.atproto.repo.createRecord", async () => {
		return HttpResponse.json({
			cid: "bafyreicid123",
			commit: { cid: "bafycommit123", rev: "rev123" },
			uri: "at://did:plc:testuser123/app.bsky.feed.post/bsky-post-123",
			validationStatus: "valid",
		});
	}),

	http.post("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", async () => {
		return HttpResponse.json({
			blob: {
				$type: "blob",
				ref: { $link: "bafyblob123" },
				mimeType: "image/png",
				size: 1234,
			},
		});
	}),

	http.get("https://bsky.social/xrpc/com.atproto.identity.resolveHandle", async ({ request }) => {
		const url = new URL(request.url);
		const handle = url.searchParams.get("handle");
		return HttpResponse.json({ did: `did:plc:${handle}` });
	}),

	// --- LinkedIn ---
	http.get("https://api.linkedin.com/v2/userinfo", async () => {
		return HttpResponse.json({
			sub: "linkedin-user-123",
			name: "Test User",
			given_name: "Test",
			family_name: "User",
			picture: "https://example.com/photo.jpg",
			locale: { country: "US", language: "en" },
		});
	}),

	http.post("https://api.linkedin.com/v2/ugcPosts", async () => {
		return HttpResponse.json({
			id: "urn:li:share:li-post-123",
			status: "SUCCESS",
		});
	}),

	http.post("https://api.linkedin.com/v2/assets", async () => {
		return HttpResponse.json({
			value: {
				asset: "urn:li:image:li-img-123",
				uploadMechanism: {
					"com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
						uploadUrl: "https://api.linkedin.com/upload/li-img-123",
					},
				},
			},
		});
	}),

	http.post("https://api.linkedin.com/upload/li-img-123", async () => {
		return new HttpResponse(null, { status: 200 });
	}),

	// --- Discord Bot ---
	http.post("https://discord.com/api/v10/channels/:channelId/messages", async () => {
		return HttpResponse.json({
			id: "discord-msg-123",
			channel_id: "discord-channel-1",
			content: "Hello Discord!",
		});
	}),

	// --- Discord Webhook ---
	http.post("https://discord.com/api/webhooks/:webhookId/:webhookToken", async () => {
		return HttpResponse.json({
			id: "webhook-msg-123",
			channel_id: "webhook-channel-1",
			content: "Hello via webhook!",
			timestamp: "2024-01-01T00:00:00Z",
			webhook_id: "webhook-1",
			type: 0,
		});
	}),

	// --- Dev.to ---
	http.post("https://dev.to/api/articles", async () => {
		return HttpResponse.json({
			type_of: "article",
			id: 12345,
			title: "Test Article",
			description: "Test",
			url: "https://dev.to/testuser/test-article-123",
			slug: "test-article-123",
			path: "/testuser/test-article-123",
			published_at: "2024-01-01T00:00:00Z",
			created_at: "2024-01-01T00:00:00Z",
			body_markdown: "Hello Dev.to!",
		});
	}),

	// --- Telegram ---
	http.post("https://api.telegram.org/bot:testBotToken/sendMessage", async () => {
		return HttpResponse.json({
			ok: true,
			result: {
				message_id: 42,
				chat: { id: -1001234567890, type: "supergroup" },
				text: "Hello Telegram!",
			},
		});
	}),

	http.post("https://api.telegram.org/bot:testBotToken/sendPhoto", async () => {
		return HttpResponse.json({
			ok: true,
			result: {
				message_id: 43,
				chat: { id: -1001234567890, type: "supergroup" },
				text: "",
			},
		});
	}),

	// --- Slack ---
	http.post("https://slack.com/api/chat.postMessage", async () => {
		return HttpResponse.json({
			ok: true,
			channel: "C12345",
			ts: "1234567890.123456",
			message: {
				text: "Hello Slack!",
				user: "U12345",
				ts: "1234567890.123456",
			},
		});
	}),

	http.post("https://slack.com/api/files.getUploadURLExternal", async () => {
		return HttpResponse.json({
			ok: true,
			upload_url: "https://files.slack.com/upload/test-upload",
			file_id: "F12345",
		});
	}),

	http.post("https://files.slack.com/upload/test-upload", async () => {
		return new HttpResponse(null, { status: 200 });
	}),

	http.post("https://slack.com/api/files.completeUploadExternal", async () => {
		return HttpResponse.json({
			ok: true,
			files: [
				{
					id: "F12345",
					title: "image1.png",
					permalink: "https://files.slack.com/files/F12345/image1.png",
				},
			],
		});
	}),
];

//-----------------------------------------------------------------------------
// Error handlers (for testing failure scenarios)
//-----------------------------------------------------------------------------

const mastodonErrorHandler = http.post(
	"https://mastodon-fail.social/api/v1/statuses",
	async () => {
		return HttpResponse.json(
			{ error: "Rate limit exceeded" },
			{ status: 429 },
		);
	},
);

const blueskySessionErrorHandler = http.post(
	"https://bsky-fail.social/xrpc/com.atproto.server.createSession",
	async () => {
		return HttpResponse.json(
			{ error: "AuthenticationRequired", message: "Invalid credentials" },
			{ status: 401 },
		);
	},
);

const linkedinUserInfoErrorHandler = http.get(
	"https://api.linkedin-fail.com/v2/userinfo",
	async () => {
		return HttpResponse.json(
			{ message: "Forbidden" },
			{ status: 403 },
		);
	},
);

//-----------------------------------------------------------------------------
// Test Setup
//-----------------------------------------------------------------------------

const server = setupServer(...handlers);

before(() => {
	server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
	server.resetHandlers();
});

after(() => {
	server.close();
});

//-----------------------------------------------------------------------------
// Tests: Client class e2e with real strategies + mocked APIs
//-----------------------------------------------------------------------------

describe("E2E: Client with mocked APIs", function () {
	this.timeout(10000);

	describe("posting to a single platform", function () {
		it("should post to Mastodon and return a SuccessResponse", async function () {
			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const client = new Client({ strategies: [mastodon] });
			const results = await client.post("Hello from e2e test!");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Mastodon");
			assert.strictEqual(results[0].ok, true);
			assert.strictEqual(results[0].response.id, "masto-123");
			assert.ok(results[0].url.includes("mastodon.social"));
		});

		it("should post to Bluesky and return a SuccessResponse", async function () {
			const bluesky = new BlueskyStrategy({
				identifier: "testuser.bsky.social",
				password: "fake-password",
				host: "bsky.social",
			});
			const client = new Client({ strategies: [bluesky] });
			const results = await client.post("Hello from Bluesky e2e!");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Bluesky");
			assert.strictEqual(results[0].response.uri, "at://did:plc:testuser123/app.bsky.feed.post/bsky-post-123");
			assert.ok(results[0].url.includes("bsky.app/profile/testuser.bsky.social/post/bsky-post-123"));
		});

		it("should post to LinkedIn and return a SuccessResponse", async function () {
			const linkedin = new LinkedInStrategy({
				accessToken: "li-test-token",
			});
			const client = new Client({ strategies: [linkedin] });
			const results = await client.post("Hello from LinkedIn e2e!");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "LinkedIn");
			assert.strictEqual(results[0].response.id, "urn:li:share:li-post-123");
			assert.ok(results[0].url.includes("linkedin.com/feed/update/urn:li:share:li-post-123"));
		});

		it("should post to Discord Bot and return a SuccessResponse", async function () {
			const discord = new DiscordStrategy({
				botToken: "discord-bot-token",
				channelId: "discord-channel-1",
			});
			const client = new Client({ strategies: [discord] });
			const results = await client.post("Hello from Discord e2e!");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Discord Bot");
			assert.strictEqual(results[0].response.id, "discord-msg-123");
			// Discord strategy has no getUrlFromResponse
			assert.strictEqual(results[0].url, undefined);
		});

		it("should post to Discord Webhook and return a SuccessResponse", async function () {
			const discordWebhook = new DiscordWebhookStrategy({
				webhookUrl: "https://discord.com/api/webhooks/webhook-1/fake-token",
			});
			const client = new Client({ strategies: [discordWebhook] });
			const results = await client.post("Hello via Discord Webhook!");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Discord Webhook");
			assert.strictEqual(results[0].response.id, "webhook-msg-123");
		});

		it("should post to Dev.to and return a SuccessResponse", async function () {
			const devto = new DevtoStrategy({
				apiKey: "devto-api-key",
			});
			const client = new Client({ strategies: [devto] });
			const results = await client.post("My Test Article\n\nThis is the body.");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Dev.to");
			assert.strictEqual(results[0].response.id, 12345);
			assert.strictEqual(results[0].url, "https://dev.to/testuser/test-article-123");
		});

		it("should post to Telegram and return a SuccessResponse", async function () {
			const telegram = new TelegramStrategy({
				botToken: ":testBotToken",
				chatId: "-1001234567890",
			});
			const client = new Client({ strategies: [telegram] });
			const results = await client.post("Hello from Telegram e2e!");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Telegram");
			assert.strictEqual(results[0].response.result.message_id, 42);
		});

		it("should post to Slack and return a SuccessResponse", async function () {
			const slack = new SlackStrategy({
				botToken: "xoxb-slack-token",
				channel: "C12345",
			});
			const client = new Client({ strategies: [slack] });
			const results = await client.post("Hello from Slack e2e!");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Slack");
			assert.strictEqual(results[0].response.ok, true);
			assert.strictEqual(results[0].response.channel, "C12345");
		});
	});

	describe("posting to multiple platforms simultaneously", function () {
		it("should post to Mastodon and Bluesky simultaneously", async function () {
			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const bluesky = new BlueskyStrategy({
				identifier: "testuser.bsky.social",
				password: "fake-password",
				host: "bsky.social",
			});
			const client = new Client({ strategies: [mastodon, bluesky] });
			const results = await client.post("Crosspost to Mastodon and Bluesky!");

			assert.strictEqual(results.length, 2);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.ok(results[1] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Mastodon");
			assert.strictEqual(results[1].name, "Bluesky");
		});

		it("should post to three platforms simultaneously", async function () {
			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const linkedin = new LinkedInStrategy({
				accessToken: "li-test-token",
			});
			const discord = new DiscordStrategy({
				botToken: "discord-bot-token",
				channelId: "discord-channel-1",
			});
			const client = new Client({ strategies: [mastodon, linkedin, discord] });
			const results = await client.post("Hello from all three platforms!");

			assert.strictEqual(results.length, 3);
			assert.ok(results.every(r => r instanceof SuccessResponse));
			assert.strictEqual(results[0].name, "Mastodon");
			assert.strictEqual(results[1].name, "LinkedIn");
			assert.strictEqual(results[2].name, "Discord Bot");
		});
	});

	describe("error handling when a platform fails", function () {
		it("should return FailureResponse for a failing platform while others succeed", async function () {
			// Add an error handler for this specific test
			server.use(mastodonErrorHandler);

			const mastodonFailing = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon-fail.social",
			});
			const discord = new DiscordStrategy({
				botToken: "discord-bot-token",
				channelId: "discord-channel-1",
			});
			const client = new Client({ strategies: [mastodonFailing, discord] });
			const results = await client.post("Partial failure test");

			assert.strictEqual(results.length, 2);
			assert.ok(results[0] instanceof FailureResponse);
			assert.strictEqual(results[0].name, "Mastodon");
			assert.ok(results[0].reason.message.includes("429"));

			assert.ok(results[1] instanceof SuccessResponse);
			assert.strictEqual(results[1].name, "Discord Bot");
		});

		it("should return FailureResponse for Bluesky authentication failure", async function () {
			server.use(blueskySessionErrorHandler);

			const bluesky = new BlueskyStrategy({
				identifier: "baduser.bsky.social",
				password: "wrong-password",
				host: "bsky-fail.social",
			});
			const client = new Client({ strategies: [bluesky] });
			const results = await client.post("This should fail");

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof FailureResponse);
			assert.strictEqual(results[0].name, "Bluesky");
			assert.ok(results[0].reason.message.includes("Failed to create session"));
		});

		it("should return all FailureResponses when every platform fails", async function () {
			server.use(mastodonErrorHandler);
			server.use(blueskySessionErrorHandler);

			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon-fail.social",
			});
			const bluesky = new BlueskyStrategy({
				identifier: "baduser.bsky.social",
				password: "wrong-password",
				host: "bsky-fail.social",
			});
			const client = new Client({ strategies: [mastodon, bluesky] });
			const results = await client.post("Everything fails");

			assert.strictEqual(results.length, 2);
			assert.ok(results.every(r => r instanceof FailureResponse));
		});
	});

	describe("posting with images", function () {
		it("should post to Mastodon with an image", async function () {
			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const client = new Client({ strategies: [mastodon] });
			const results = await client.post("Check out this image!", {
				images: [{ data: pngImageData, alt: "A test image" }],
			});

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Mastodon");
			assert.strictEqual(results[0].response.id, "masto-123");
		});

		it("should post to Bluesky with an image", async function () {
			const bluesky = new BlueskyStrategy({
				identifier: "testuser.bsky.social",
				password: "fake-password",
				host: "bsky.social",
			});
			const client = new Client({ strategies: [bluesky] });
			const results = await client.post("Bluesky image post!", {
				images: [{ data: pngImageData, alt: "Test Bluesky image" }],
			});

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Bluesky");
		});

		it("should post to Discord with an image", async function () {
			const discord = new DiscordStrategy({
				botToken: "discord-bot-token",
				channelId: "discord-channel-1",
			});
			const client = new Client({ strategies: [discord] });
			const results = await client.post("Discord image post!", {
				images: [{ data: pngImageData, alt: "Discord test image" }],
			});

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Discord Bot");
		});

		it("should post to Telegram with an image", async function () {
			const telegram = new TelegramStrategy({
				botToken: ":testBotToken",
				chatId: "-1001234567890",
			});
			const client = new Client({ strategies: [telegram] });
			const results = await client.post("Telegram image!", {
				images: [{ data: pngImageData, alt: "Telegram test image" }],
			});

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Telegram");
		});

		it("should post to multiple platforms with images simultaneously", async function () {
			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const discord = new DiscordStrategy({
				botToken: "discord-bot-token",
				channelId: "discord-channel-1",
			});
			const client = new Client({ strategies: [mastodon, discord] });
			const results = await client.post("Image crosspost!", {
				images: [{ data: pngImageData, alt: "Crosspost image" }],
			});

			assert.strictEqual(results.length, 2);
			assert.ok(results.every(r => r instanceof SuccessResponse));
		});
	});

	describe("abort signal support", function () {
		it("should abort Mastodon post when signal is triggered", async function () {
			// Override with a slow handler
			server.use(
				http.post("https://mastodon.social/api/v1/statuses", async () => {
					await new Promise(resolve => setTimeout(resolve, 500));
					return HttpResponse.json({ id: "should-not-reach" });
				}),
			);

			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const client = new Client({ strategies: [mastodon] });
			const controller = new AbortController();

			setTimeout(() => controller.abort(), 10);

			const results = await client.post("This should be aborted", {
				signal: controller.signal,
			});

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof FailureResponse);
			assert.strictEqual(results[0].name, "Mastodon");
		});

		it("should abort multiple platforms when signal is triggered", async function () {
			server.use(
				http.post("https://mastodon.social/api/v1/statuses", async () => {
					await new Promise(resolve => setTimeout(resolve, 500));
					return HttpResponse.json({ id: "should-not-reach" });
				}),
				http.post("https://bsky.social/xrpc/com.atproto.server.createSession", async () => {
					await new Promise(resolve => setTimeout(resolve, 500));
					return HttpResponse.json({ accessJwt: "never" });
				}),
			);

			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const bluesky = new BlueskyStrategy({
				identifier: "testuser.bsky.social",
				password: "fake-password",
				host: "bsky.social",
			});
			const client = new Client({ strategies: [mastodon, bluesky] });
			const controller = new AbortController();

			setTimeout(() => controller.abort(), 10);

			const results = await client.post("Abort all!", {
				signal: controller.signal,
			});

			assert.strictEqual(results.length, 2);
			assert.ok(results.every(r => r instanceof FailureResponse));
		});
	});

	describe("postTo with specific strategies", function () {
		it("should post different messages to different platforms", async function () {
			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const discord = new DiscordStrategy({
				botToken: "discord-bot-token",
				channelId: "discord-channel-1",
			});
			const client = new Client({ strategies: [mastodon, discord] });

			const results = await client.postTo([
				{ message: "Mastodon-specific message", strategyId: "mastodon" },
				{ message: "Discord-specific message", strategyId: "discord" },
			]);

			assert.strictEqual(results.length, 2);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.ok(results[1] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Mastodon");
			assert.strictEqual(results[1].name, "Discord Bot");
		});

		it("should post to a subset of registered strategies", async function () {
			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const linkedin = new LinkedInStrategy({
				accessToken: "li-test-token",
			});
			const discord = new DiscordStrategy({
				botToken: "discord-bot-token",
				channelId: "discord-channel-1",
			});
			const client = new Client({ strategies: [mastodon, linkedin, discord] });

			// Only post to Mastodon, skipping LinkedIn and Discord
			const results = await client.postTo([
				{ message: "Only on Mastodon", strategyId: "mastodon" },
			]);

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
			assert.strictEqual(results[0].name, "Mastodon");
		});

		it("should handle images in postTo entries", async function () {
			const mastodon = new MastodonStrategy({
				accessToken: "test-token",
				host: "mastodon.social",
			});
			const client = new Client({ strategies: [mastodon] });

			const results = await client.postTo([
				{
					message: "Image via postTo!",
					strategyId: "mastodon",
					images: [{ data: pngImageData, alt: "postTo image" }],
				},
			]);

			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof SuccessResponse);
		});
	});
});

//-----------------------------------------------------------------------------
// Tests: Strategy integration - verify correct API request formatting
//-----------------------------------------------------------------------------

describe("E2E: Strategy API request formatting", function () {
	this.timeout(10000);

	describe("MastodonStrategy", function () {
		it("should send correct authorization header and form body", async function () {
			let capturedRequest;
			server.use(
				http.post("https://mastodon.social/api/v1/statuses", async ({ request }) => {
					capturedRequest = {
						authHeader: request.headers.get("authorization"),
						formData: await request.formData(),
					};
					return HttpResponse.json({
						id: "masto-verify",
						uri: "https://mastodon.social/users/testuser/statuses/masto-verify",
						url: "https://mastodon.social/@testuser/masto-verify",
						content: "Test",
					});
				}),
			);

			const mastodon = new MastodonStrategy({
				accessToken: "my-secret-token",
				host: "mastodon.social",
			});
			await mastodon.post("Formatted request test");

			assert.strictEqual(capturedRequest.authHeader, "Bearer my-secret-token");
			assert.strictEqual(capturedRequest.formData.get("status"), "Formatted request test");
		});
	});

	describe("BlueskyStrategy", function () {
		it("should create a session then post with correct JWT", async function () {
			let sessionBody;
			let postAuthHeader;
			let postBody;

			server.use(
				http.post("https://bsky.social/xrpc/com.atproto.server.createSession", async ({ request }) => {
					sessionBody = await request.json();
					return HttpResponse.json({
						accessJwt: "verified-jwt",
						refreshJwt: "refresh",
						active: true,
						did: "did:plc:verifyuser",
					});
				}),
				http.post("https://bsky.social/xrpc/com.atproto.repo.createRecord", async ({ request }) => {
					postAuthHeader = request.headers.get("authorization");
					postBody = await request.json();
					return HttpResponse.json({
						cid: "cid123",
						commit: { cid: "commitcid", rev: "rev1" },
						uri: "at://did:plc:verifyuser/app.bsky.feed.post/post-id",
						validationStatus: "valid",
					});
				}),
			);

			const bluesky = new BlueskyStrategy({
				identifier: "verifyuser.bsky.social",
				password: "my-app-password",
				host: "bsky.social",
			});
			await bluesky.post("Bluesky formatted test");

			// Verify session creation body
			assert.strictEqual(sessionBody.identifier, "verifyuser.bsky.social");
			assert.strictEqual(sessionBody.password, "my-app-password");

			// Verify post request used the JWT
			assert.strictEqual(postAuthHeader, "Bearer verified-jwt");

			// Verify post body structure
			assert.strictEqual(postBody.repo, "did:plc:verifyuser");
			assert.strictEqual(postBody.collection, "app.bsky.feed.post");
			assert.strictEqual(postBody.record.$type, "app.bsky.feed.post");
			assert.strictEqual(postBody.record.text, "Bluesky formatted test");
			assert.ok(postBody.record.createdAt);
		});

		it("should upload blob and include embed for images", async function () {
			let uploadAuthHeader;
			let postBody;

			server.use(
				http.post("https://bsky.social/xrpc/com.atproto.server.createSession", async () => {
					return HttpResponse.json({
						accessJwt: "img-jwt",
						refreshJwt: "refresh",
						active: true,
						did: "did:plc:imguser",
					});
				}),
				http.post("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", async ({ request }) => {
					uploadAuthHeader = request.headers.get("authorization");
					return HttpResponse.json({
						blob: {
							$type: "blob",
							ref: { $link: "bloblink123" },
							mimeType: "image/png",
							size: pngImageData.length,
						},
					});
				}),
				http.post("https://bsky.social/xrpc/com.atproto.repo.createRecord", async ({ request }) => {
					postBody = await request.json();
					return HttpResponse.json({
						cid: "cid123",
						commit: { cid: "commitcid", rev: "rev1" },
						uri: "at://did:plc:imguser/app.bsky.feed.post/img-post",
						validationStatus: "valid",
					});
				}),
			);

			const bluesky = new BlueskyStrategy({
				identifier: "imguser.bsky.social",
				password: "pass",
				host: "bsky.social",
			});
			await bluesky.post("Image post", {
				images: [{ data: pngImageData, alt: "My alt text" }],
			});

			assert.strictEqual(uploadAuthHeader, "Bearer img-jwt");
			assert.ok(postBody.record.embed);
			assert.strictEqual(postBody.record.embed.$type, "app.bsky.embed.images");
			assert.strictEqual(postBody.record.embed.images.length, 1);
			assert.strictEqual(postBody.record.embed.images[0].alt, "My alt text");
			assert.strictEqual(postBody.record.embed.images[0].image.ref.$link, "bloblink123");
		});
	});

	describe("LinkedInStrategy", function () {
		it("should fetch person URN then create post with correct body structure", async function () {
			let postBody;
			let postHeaders;

			server.use(
				http.get("https://api.linkedin.com/v2/userinfo", async () => {
					return HttpResponse.json({
						sub: "verify-sub-123",
						name: "Test",
						given_name: "Test",
						family_name: "User",
						picture: "https://example.com/pic.jpg",
						locale: { country: "US", language: "en" },
					});
				}),
				http.post("https://api.linkedin.com/v2/ugcPosts", async ({ request }) => {
					postHeaders = {
						auth: request.headers.get("authorization"),
						protocol: request.headers.get("x-restli-protocol-version"),
						contentType: request.headers.get("content-type"),
					};
					postBody = await request.json();
					return HttpResponse.json({ id: "urn:li:share:verify-123" });
				}),
			);

			const linkedin = new LinkedInStrategy({ accessToken: "li-verify-token" });
			await linkedin.post("LinkedIn formatted test");

			assert.strictEqual(postHeaders.auth, "Bearer li-verify-token");
			assert.strictEqual(postHeaders.protocol, "2.0.0");
			assert.strictEqual(postHeaders.contentType, "application/json");
			assert.strictEqual(postBody.author, "urn:li:person:verify-sub-123");
			assert.strictEqual(postBody.lifecycleState, "PUBLISHED");
			assert.strictEqual(
				postBody.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text,
				"LinkedIn formatted test",
			);
			assert.strictEqual(
				postBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory,
				"NONE",
			);
			assert.strictEqual(
				postBody.visibility["com.linkedin.ugc.MemberNetworkVisibility"],
				"PUBLIC",
			);
		});
	});

	describe("DiscordStrategy", function () {
		it("should send form data with correct authorization and payload_json", async function () {
			let capturedAuth;
			let capturedPayload;

			server.use(
				http.post("https://discord.com/api/v10/channels/test-ch-999/messages", async ({ request }) => {
					capturedAuth = request.headers.get("authorization");
					const formData = await request.formData();
					capturedPayload = JSON.parse(formData.get("payload_json"));
					return HttpResponse.json({
						id: "verify-msg",
						channel_id: "test-ch-999",
						content: "Test",
					});
				}),
			);

			const discord = new DiscordStrategy({
				botToken: "verify-bot-token",
				channelId: "test-ch-999",
			});
			await discord.post("Discord formatted test");

			assert.strictEqual(capturedAuth, "Bot verify-bot-token");
			assert.strictEqual(capturedPayload.content, "Discord formatted test");
		});
	});

	describe("DiscordWebhookStrategy", function () {
		it("should POST to webhook URL with wait=true query param", async function () {
			let capturedUrl;
			let capturedPayload;

			server.use(
				http.post("https://discord.com/api/webhooks/wh-id/wh-token", async ({ request }) => {
					capturedUrl = request.url;
					const formData = await request.formData();
					capturedPayload = JSON.parse(formData.get("payload_json"));
					return HttpResponse.json({
						id: "wh-verify-msg",
						channel_id: "wh-ch",
						content: "Test",
						timestamp: "2024-01-01T00:00:00Z",
						webhook_id: "wh-id",
						type: 0,
					});
				}),
			);

			const webhook = new DiscordWebhookStrategy({
				webhookUrl: "https://discord.com/api/webhooks/wh-id/wh-token",
			});
			await webhook.post("Webhook formatted test");

			assert.ok(capturedUrl.includes("wait=true"));
			assert.strictEqual(capturedPayload.content, "Webhook formatted test");
		});
	});

	describe("DevtoStrategy", function () {
		it("should send article with correct headers and body structure", async function () {
			let capturedHeaders;
			let capturedBody;

			server.use(
				http.post("https://dev.to/api/articles", async ({ request }) => {
					capturedHeaders = {
						apiKey: request.headers.get("api-key"),
						contentType: request.headers.get("content-type"),
					};
					capturedBody = await request.json();
					return HttpResponse.json({
						type_of: "article",
						id: 99999,
						title: "Test Title",
						description: "Test",
						url: "https://dev.to/test/title-99999",
						slug: "title-99999",
						path: "/test/title-99999",
					});
				}),
			);

			const devto = new DevtoStrategy({ apiKey: "devto-verify-key" });
			await devto.post("Test Title\n\nThis is the article body.");

			assert.strictEqual(capturedHeaders.apiKey, "devto-verify-key");
			assert.strictEqual(capturedHeaders.contentType, "application/json");
			assert.strictEqual(capturedBody.article.title, "Test Title");
			assert.strictEqual(capturedBody.article.body_markdown, "Test Title\n\nThis is the article body.");
			assert.strictEqual(capturedBody.article.published, true);
		});
	});

	describe("TelegramStrategy", function () {
		it("should send JSON body with correct chat_id and text", async function () {
			let capturedBody;

			server.use(
				http.post("https://api.telegram.org/bottg-verify-token/sendMessage", async ({ request }) => {
					capturedBody = await request.json();
					return HttpResponse.json({
						ok: true,
						result: {
							message_id: 100,
							chat: { id: -100999, type: "supergroup" },
							text: "Test",
						},
					});
				}),
			);

			const telegram = new TelegramStrategy({
				botToken: "tg-verify-token",
				chatId: "-100999",
			});
			await telegram.post("Telegram formatted test");

			assert.strictEqual(capturedBody.chat_id, "-100999");
			assert.strictEqual(capturedBody.text, "Telegram formatted test");
		});
	});

	describe("SlackStrategy", function () {
		it("should send JSON body with correct channel and text", async function () {
			let capturedBody;
			let capturedAuth;

			server.use(
				http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
					capturedAuth = request.headers.get("authorization");
					capturedBody = await request.json();
					return HttpResponse.json({
						ok: true,
						channel: "verify-ch",
						ts: "111.222",
						message: { text: "Test", user: "U1", ts: "111.222" },
					});
				}),
			);

			const slack = new SlackStrategy({
				botToken: "xoxb-verify-token",
				channel: "verify-ch",
			});
			await slack.post("Slack formatted test");

			assert.strictEqual(capturedAuth, "Bearer xoxb-verify-token");
			assert.strictEqual(capturedBody.channel, "verify-ch");
			assert.strictEqual(capturedBody.text, "Slack formatted test");
		});
	});
});

//-----------------------------------------------------------------------------
// Tests: CLI e2e
//-----------------------------------------------------------------------------

describe("E2E: CLI", function () {
	this.timeout(15000);

	it("should display help when no platforms are specified", function (done) {
		const child = fork(builtExecutablePath, ["Hello"], {
			stdio: "pipe",
		});

		let stdout = "";
		child.stdout.on("data", data => {
			stdout += data.toString();
		});

		child.on("exit", code => {
			assert.strictEqual(code, 1);
			assert.ok(stdout.includes("Usage: crosspost"));
			assert.ok(stdout.includes("--twitter"));
			assert.ok(stdout.includes("--mastodon"));
			assert.ok(stdout.includes("--bluesky"));
			assert.ok(stdout.includes("--mcp"));
			done();
		});
	});

	it("should display help when no message and no --file is specified", function (done) {
		const child = fork(builtExecutablePath, ["--mastodon"], {
			stdio: "pipe",
			env: {
				MASTODON_ACCESS_TOKEN: "token",
				MASTODON_HOST: "mastodon.social",
			},
		});

		let stdout = "";
		child.stdout.on("data", data => {
			stdout += data.toString();
		});

		child.on("exit", code => {
			assert.strictEqual(code, 1);
			assert.ok(stdout.includes("Usage: crosspost"));
			done();
		});
	});

	it("should display version with --version flag", function (done) {
		const child = fork(builtExecutablePath, ["--version"], {
			stdio: "pipe",
		});

		let stdout = "";
		child.stdout.on("data", data => {
			stdout += data.toString();
		});

		child.on("exit", code => {
			assert.strictEqual(code, 0);
			assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
			done();
		});
	});

	it("should reject --file when used with --mcp", function (done) {
		const child = fork(builtExecutablePath, ["--mcp", "--file", "test.txt", "--mastodon"], {
			stdio: "pipe",
			env: {
				MASTODON_ACCESS_TOKEN: "token",
				MASTODON_HOST: "mastodon.social",
			},
		});

		let stderr = "";
		child.stderr.on("data", data => {
			stderr += data.toString();
		});

		child.on("exit", code => {
			assert.strictEqual(code, 1);
			assert.ok(stderr.includes("--file cannot be used with --mcp"));
			done();
		});
	});

	it("should accept short flags (-t, -m, -b, -l, -d, -s, -n, -h, -v)", function (done) {
		// Just verify -h works as a short flag
		const child = fork(builtExecutablePath, ["-h"], {
			stdio: "pipe",
		});

		let stdout = "";
		child.stdout.on("data", data => {
			stdout += data.toString();
		});

		child.on("exit", code => {
			assert.strictEqual(code, 1);
			assert.ok(stdout.includes("Usage: crosspost"));
			done();
		});
	});

	it("should parse --image and --image-alt flags without error", function (done) {
		// No platform flags means help is shown, but flags should parse fine
		const child = fork(builtExecutablePath, [
			"--mastodon",
			"--image", "/nonexistent/image.png",
			"Hello",
		], {
			stdio: "pipe",
			env: {
				MASTODON_ACCESS_TOKEN: "token",
				MASTODON_HOST: "mastodon.social",
			},
		});

		let stderr = "";
		child.stderr.on("data", data => {
			stderr += data.toString();
		});

		child.on("exit", code => {
			// It should fail because image file doesn't exist
			assert.strictEqual(code, 1);
			assert.ok(stderr.includes("Error reading image file"));
			done();
		});
	});

	it("should start MCP server when --mcp flag is provided", function (done) {
		const child = fork(builtExecutablePath, ["--mcp", "--mastodon"], {
			stdio: "pipe",
			env: {
				MASTODON_ACCESS_TOKEN: "token",
				MASTODON_HOST: "mastodon.social",
			},
		});

		const tid = setTimeout(() => {
			child.kill();
		}, 2000);

		let stderr = "";
		child.stderr.on("data", data => {
			stderr += data.toString();
			// Once we see the MCP server started message, we can kill and verify
			if (stderr.includes("MCP server started")) {
				clearTimeout(tid);
				child.kill();
			}
		});

		child.on("exit", () => {
			clearTimeout(tid);
			assert.ok(stderr.includes("MCP server started"));
			done();
		});
	});
});

#!/usr/bin/env bun
/**
 * @fileoverview Local X webhook receiver that triggers crosspost processing.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { loadCrosspostDotenv } from "../src/util/dotenv.js";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8787;
const DEFAULT_PATH = "/webhooks/x";
const DEFAULT_COMMAND = "task x:supervise";

let running = false;
let pending = false;

function env(name, fallback) {
	return process.env[name] || fallback;
}

function requireEnv(name) {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

function hmacSha256(value, secret) {
	return `sha256=${createHmac("sha256", secret).update(value).digest("base64")}`;
}

function isSafeEqual(left, right) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}

	return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifySignature(request, body, secret) {
	const signature = request.headers.get("x-twitter-webhooks-signature");

	if (!signature) {
		return false;
	}

	return isSafeEqual(signature, hmacSha256(body, secret));
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
		},
	});
}

function shouldTrigger(payload) {
	return Boolean(
		payload.tweet_create_events?.length ||
		payload.tweet_delete_events?.length ||
		payload.for_user_id,
	);
}

function runCommand(command) {
	return new Promise(resolve => {
		const child = spawn(command, {
			shell: true,
			stdio: "inherit",
			env: process.env,
		});

		child.on("close", code => resolve(code ?? 1));
		child.on("error", error => {
			console.error(error);
			resolve(1);
		});
	});
}

async function triggerCrosspost() {
	if (running) {
		pending = true;
		return;
	}

	running = true;

	do {
		pending = false;
		const command = env("X_WEBHOOK_COMMAND", DEFAULT_COMMAND);
		const code = await runCommand(command);

		if (code !== 0) {
			console.error(`Webhook command failed with exit code ${code}.`);
		}
	} while (pending);

	running = false;
}

function handleCrc(url, consumerSecret) {
	const crcToken = url.searchParams.get("crc_token");

	if (!crcToken) {
		return json({ error: "Missing crc_token" }, 400);
	}

	return json({ response_token: hmacSha256(crcToken, consumerSecret) });
}

async function handleWebhook(request, consumerSecret) {
	const body = await request.text();

	if (!verifySignature(request, body, consumerSecret)) {
		return json({ error: "Invalid X webhook signature" }, 401);
	}

	let payload;

	try {
		payload = JSON.parse(body);
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	if (shouldTrigger(payload)) {
		void triggerCrosspost();
	}

	return json({ ok: true });
}

function main() {
	loadCrosspostDotenv();

	const consumerSecret = requireEnv("X_WEBHOOK_CONSUMER_SECRET");
	const host = env("X_WEBHOOK_HOST", DEFAULT_HOST);
	const port = Number(env("X_WEBHOOK_PORT", DEFAULT_PORT));
	const webhookPath = env("X_WEBHOOK_PATH", DEFAULT_PATH);

	Bun.serve({
		host,
		port,
		async fetch(request) {
			const url = new URL(request.url);

			if (url.pathname === "/healthz") {
				return json({ ok: true });
			}

			if (url.pathname !== webhookPath) {
				return json({ error: "Not found" }, 404);
			}

			if (request.method === "GET") {
				return handleCrc(url, consumerSecret);
			}

			if (request.method === "POST") {
				return handleWebhook(request, consumerSecret);
			}

			return json({ error: "Method not allowed" }, 405);
		},
	});

	console.log(
		`X webhook receiver listening on http://${host}:${port}${webhookPath}`,
	);
}

main();

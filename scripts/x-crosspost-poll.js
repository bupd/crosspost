#!/usr/bin/env bun
/**
 * @fileoverview Runs the X crosspost workflow on a fixed local interval.
 */

import { spawn } from "node:child_process";
import { loadCrosspostDotenv } from "../src/util/dotenv.js";

const DEFAULT_INTERVAL_SECONDS = 120;
const DEFAULT_COMMAND = "bun scripts/x-crosspost.js";

let stopping = false;
let activeChild = null;
let wakeSleep = null;

function toPositiveInteger(value, fallback) {
	const parsed = Number(value);

	if (!Number.isInteger(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function sleep(ms) {
	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			wakeSleep = null;
			resolve();
		}, ms);
		wakeSleep = () => {
			clearTimeout(timeout);
			resolve();
		};

		if (stopping) {
			wakeSleep();
		}
	});
}

function runCommand(command) {
	return new Promise(resolve => {
		console.log(`[x-poll] running: ${command}`);

		activeChild = spawn(command, {
			shell: true,
			stdio: "inherit",
			env: process.env,
		});

		activeChild.on("error", error => {
			console.error(error);
			activeChild = null;
			resolve(1);
		});

		activeChild.on("close", code => {
			activeChild = null;
			resolve(code ?? 1);
		});
	});
}

function stop() {
	stopping = true;

	if (activeChild) {
		activeChild.kill("SIGTERM");
	}

	if (wakeSleep) {
		wakeSleep();
		wakeSleep = null;
	}
}

async function main() {
	loadCrosspostDotenv();

	const intervalSeconds = toPositiveInteger(
		process.env.X_CROSSPOST_POLL_INTERVAL_SECONDS,
		DEFAULT_INTERVAL_SECONDS,
	);
	const command = process.env.X_CROSSPOST_POLL_COMMAND || DEFAULT_COMMAND;

	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);

	console.log(`[x-poll] polling every ${intervalSeconds} seconds`);

	while (!stopping) {
		const code = await runCommand(command);

		if (code !== 0) {
			console.error(`[x-poll] command exited with code ${code}`);
		}

		if (!stopping) {
			await sleep(intervalSeconds * 1000);
		}
	}
}

main().catch(error => {
	console.error(error.message || error);
	process.exitCode = 1;
});

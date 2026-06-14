#!/usr/bin/env bun
/**
 * @fileoverview Runs X crossposting locally and invokes an agent on failure.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadCrosspostDotenv } from "../src/util/dotenv.js";

const LOG_DIR = ".opencode/tmp/x-crosspost-remediation";
const DEFAULT_CROSSPOST_COMMAND = "bun scripts/x-crosspost.js";
const DEFAULT_AGENT = "opencode";
const VALIDATION_COMMANDS = [
	"bun run lint",
	"bun run build",
	"bun run test:unit",
];

function toBoolean(value, defaultValue = false) {
	if (value === undefined) {
		return defaultValue;
	}

	return value === "1" || value === "true" || value === "yes";
}

function timestamp() {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureLogDir() {
	fs.mkdirSync(LOG_DIR, { recursive: true });
}

function appendLog(filePath, data) {
	fs.appendFileSync(filePath, data);
	process.stdout.write(data);
}

function runShell(command, logFile, extraEnv = {}) {
	return new Promise(resolve => {
		appendLog(logFile, `\n$ ${command}\n`);

		const child = spawn(command, {
			shell: true,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, ...extraEnv },
		});

		child.stdout.on("data", data => appendLog(logFile, data.toString()));
		child.stderr.on("data", data => appendLog(logFile, data.toString()));
		child.on("error", error => {
			appendLog(logFile, `${error.stack || error.message}\n`);
			resolve(1);
		});
		child.on("close", code => resolve(code ?? 1));
	});
}

function writePrompt({ logFile, promptFile, crosspostCommand }) {
	const gitStatus = fs.existsSync(".git")
		? spawnSync("git", ["status", "--short"], { encoding: "utf8" }).stdout
		: "";

	fs.writeFileSync(
		promptFile,
		`You are a local remediation agent for the X crosspost automation.\n\n` +
			`The command failed:\n\n` +
			`\`${crosspostCommand}\`\n\n` +
			`Failure log:\n\n` +
			`\`${path.resolve(logFile)}\`\n\n` +
			`Current git status before remediation:\n\n` +
			"```\n" +
			gitStatus +
			"```\n\n" +
			`Your task:\n` +
			`- Diagnose the failure from the log.\n` +
			`- Make the smallest correct code/config/docs change.\n` +
			`- Do not modify secrets, tokens, .env values, or unrelated user changes.\n` +
			`- Preserve behavior: X is the source, Bluesky/Mastodon get eligible posts, LinkedIn gets hashtag posts and aggregated self-threads only.\n` +
			`- If the failure is missing/expired credentials or platform rate limits, do not invent credentials; improve validation/docs or leave a clear diagnostic.\n\n` +
			`Required validation before finishing:\n` +
			VALIDATION_COMMANDS.map(command => `- ${command}`).join("\n") +
			"\n",
	);
}

function agentCommand(agent, promptFile) {
	const customCommand = process.env.X_CROSSPOST_AGENT_COMMAND;

	if (customCommand) {
		return customCommand;
	}

	const prompt = fs.readFileSync(promptFile, "utf8").replaceAll("'", "'\\''");

	if (agent === "codex") {
		return `codex exec --full-auto '${prompt}'`;
	}

	return `opencode run '${prompt}'`;
}

async function validate(logFile) {
	for (const command of VALIDATION_COMMANDS) {
		const code = await runShell(command, logFile);

		if (code !== 0) {
			return code;
		}
	}

	return 0;
}

async function remediate({ crosspostCommand, failureLog, runId }) {
	const agent = process.env.X_CROSSPOST_AGENT || DEFAULT_AGENT;
	const promptFile = path.join(LOG_DIR, `${runId}-prompt.md`);
	const remediationLog = path.join(LOG_DIR, `${runId}-agent.log`);

	writePrompt({ logFile: failureLog, promptFile, crosspostCommand });

	const command = agentCommand(agent, promptFile);
	const code = await runShell(command, remediationLog, {
		PROMPT_FILE: path.resolve(promptFile),
	});

	if (code !== 0) {
		throw new Error(`Remediation agent failed with exit code ${code}.`);
	}

	const validationCode = await validate(remediationLog);

	if (validationCode !== 0) {
		throw new Error(
			`Validation failed after remediation with exit code ${validationCode}.`,
		);
	}
}

async function main() {
	loadCrosspostDotenv();
	ensureLogDir();

	const runId = timestamp();
	const crosspostCommand =
		process.env.X_CROSSPOST_COMMAND || DEFAULT_CROSSPOST_COMMAND;
	const failureLog = path.join(LOG_DIR, `${runId}-crosspost.log`);
	const remediationEnabled = toBoolean(
		process.env.X_CROSSPOST_REMEDIATE,
		true,
	);
	const rerunAfterRemediation = toBoolean(
		process.env.X_CROSSPOST_RERUN_AFTER_REMEDIATION,
		true,
	);

	const firstCode = await runShell(crosspostCommand, failureLog);

	if (firstCode === 0) {
		return;
	}

	if (!remediationEnabled) {
		process.exitCode = firstCode;
		return;
	}

	await remediate({ crosspostCommand, failureLog, runId });

	if (!rerunAfterRemediation) {
		return;
	}

	const rerunLog = path.join(LOG_DIR, `${runId}-rerun.log`);
	const rerunCode = await runShell(crosspostCommand, rerunLog);
	process.exitCode = rerunCode;
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});

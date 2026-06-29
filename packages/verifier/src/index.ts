import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";

export type VerifierKind = "build" | "lint" | "test" | "typecheck";

export type VerifierRunStatus = "cancelled" | "failed" | "passed" | "skipped";

export type VerifierCommand = {
	args: string[];
	command: string;
	display: string;
	kind: VerifierKind;
	skipReason?: string;
};

export type CommandRunResult = {
	exitCode: number;
	output: string;
};

export type CommandRunner = (command: VerifierCommand, context: VerifyContext) => Promise<CommandRunResult>;

export type VerifyContext = {
	repoPath: string;
	runner?: CommandRunner;
	timeoutMs?: number;
};

export type VerifierResult = {
	command: string;
	durationMs: number;
	exitCode?: number;
	id: string;
	kind: VerifierKind;
	output: string;
	status: VerifierRunStatus;
	summary: string;
	verifierId: string;
};

export type Verifier = {
	readonly displayName: string;
	readonly id: string;
	detect(repoPath: string): Promise<boolean>;
	plan(repoPath: string): Promise<VerifierCommand[]>;
	run(context: VerifyContext): Promise<VerifierResult[]>;
};

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

type PackageJson = {
	scripts: Record<string, string>;
};

type CommandVerifierOptions = {
	detect: (repoPath: string) => Promise<boolean>;
	displayName: string;
	id: string;
	plan: (repoPath: string) => Promise<VerifierCommand[]>;
};

class CommandVerifier implements Verifier {
	readonly displayName: string;
	readonly id: string;

	constructor(private readonly options: CommandVerifierOptions) {
		this.displayName = options.displayName;
		this.id = options.id;
	}

	detect(repoPath: string): Promise<boolean> {
		return this.options.detect(repoPath);
	}

	plan(repoPath: string): Promise<VerifierCommand[]> {
		return this.options.plan(repoPath);
	}

	async run(context: VerifyContext): Promise<VerifierResult[]> {
		const commands = await this.plan(context.repoPath);
		const results: VerifierResult[] = [];

		for (const command of commands) {
			results.push(await executeVerifierCommand(this.id, command, context));
		}

		return results;
	}
}

export const nodeVerifier = new CommandVerifier({
	detect: (repoPath) => exists(join(repoPath, "package.json")),
	displayName: "Node.js / TypeScript",
	id: "node",
	plan: planNodeCommands,
});

export const pythonVerifier = new CommandVerifier({
	detect: async (repoPath) =>
		(await exists(join(repoPath, "pyproject.toml"))) ||
		(await exists(join(repoPath, "pytest.ini"))) ||
		(await exists(join(repoPath, "setup.cfg"))) ||
		(await exists(join(repoPath, "requirements.txt"))),
	displayName: "Python",
	id: "python",
	plan: planPythonCommands,
});

export const goVerifier = new CommandVerifier({
	detect: (repoPath) => exists(join(repoPath, "go.mod")),
	displayName: "Go",
	id: "go",
	plan: async () => [
		command("typecheck", "go", ["test", "./...", "-run", "^$"]),
		command("lint", "go", ["vet", "./..."]),
		command("test", "go", ["test", "./..."]),
		command("build", "go", ["build", "./..."]),
	],
});

export const rustVerifier = new CommandVerifier({
	detect: (repoPath) => exists(join(repoPath, "Cargo.toml")),
	displayName: "Rust",
	id: "rust",
	plan: async () => [
		command("typecheck", "cargo", ["check", "--all-targets", "--all-features"]),
		command("lint", "cargo", ["clippy", "--all-targets", "--all-features"]),
		command("test", "cargo", ["test", "--all-features"]),
		command("build", "cargo", ["build", "--all-features"]),
	],
});

export const defaultVerifiers = [nodeVerifier, pythonVerifier, goVerifier, rustVerifier] as const;

export async function detectVerifiers(
	repoPath: string,
	registry: readonly Verifier[] = defaultVerifiers,
): Promise<Verifier[]> {
	const detected: Verifier[] = [];
	for (const verifier of registry) {
		if (await verifier.detect(repoPath)) {
			detected.push(verifier);
		}
	}
	return detected;
}

export async function runDetectedVerifiers(
	context: VerifyContext,
	registry: readonly Verifier[] = defaultVerifiers,
): Promise<VerifierResult[]> {
	const verifiers = await detectVerifiers(context.repoPath, registry);
	const results: VerifierResult[] = [];

	for (const verifier of verifiers) {
		results.push(...(await verifier.run(context)));
	}

	return results;
}

export async function defaultCommandRunner(commandToRun: VerifierCommand, context: VerifyContext): Promise<CommandRunResult> {
	const result = await execa(commandToRun.command, commandToRun.args, {
		all: true,
		cwd: context.repoPath,
		reject: false,
		timeout: context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});

	return {
		exitCode: result.exitCode ?? 1,
		output: result.all ?? [result.stdout, result.stderr].filter(Boolean).join("\n"),
	};
}

async function executeVerifierCommand(
	verifierId: string,
	commandToRun: VerifierCommand,
	context: VerifyContext,
): Promise<VerifierResult> {
	const start = Date.now();

	if (commandToRun.skipReason) {
		return {
			command: commandToRun.display,
			durationMs: 0,
			id: crypto.randomUUID(),
			kind: commandToRun.kind,
			output: "",
			status: "skipped",
			summary: commandToRun.skipReason,
			verifierId,
		};
	}

	try {
		const result = await (context.runner ?? defaultCommandRunner)(commandToRun, context);
		const durationMs = Date.now() - start;
		const passed = result.exitCode === 0;

		return {
			command: commandToRun.display,
			durationMs,
			exitCode: result.exitCode,
			id: crypto.randomUUID(),
			kind: commandToRun.kind,
			output: result.output,
			status: passed ? "passed" : "failed",
			summary: passed
				? `${commandToRun.kind} passed in ${durationMs}ms`
				: `${commandToRun.kind} failed with exit code ${result.exitCode}`,
			verifierId,
		};
	} catch (error) {
		return {
			command: commandToRun.display,
			durationMs: Date.now() - start,
			exitCode: exitCodeFromError(error),
			id: crypto.randomUUID(),
			kind: commandToRun.kind,
			output: errorToString(error),
			status: "failed",
			summary: `${commandToRun.kind} failed before completion`,
			verifierId,
		};
	}
}

async function planNodeCommands(repoPath: string): Promise<VerifierCommand[]> {
	const packageJson = await readPackageJson(repoPath);
	const packageManager = await detectPackageManager(repoPath);

	return [
		nodeScriptCommand(packageManager, "typecheck", packageJson.scripts),
		nodeScriptCommand(packageManager, "lint", packageJson.scripts),
		nodeScriptCommand(packageManager, "test", packageJson.scripts),
		nodeScriptCommand(packageManager, "build", packageJson.scripts),
	];
}

async function planPythonCommands(repoPath: string): Promise<VerifierCommand[]> {
	const pyproject = await readOptionalFile(join(repoPath, "pyproject.toml"));
	const setupCfg = await readOptionalFile(join(repoPath, "setup.cfg"));
	const hasTests = (await exists(join(repoPath, "pytest.ini"))) || (await exists(join(repoPath, "tests")));

	return [
		pythonModuleCommand(
			"typecheck",
			"mypy",
			["."],
			pyproject.includes("[tool.mypy") || setupCfg.includes("[mypy]"),
			"No mypy configuration found.",
		),
		pythonModuleCommand(
			"lint",
			"ruff",
			["check", "."],
			pyproject.includes("[tool.ruff") || setupCfg.includes("[ruff]"),
			"No ruff configuration found.",
		),
		pythonModuleCommand("test", "pytest", [], hasTests, "No pytest configuration or tests directory found."),
		pythonModuleCommand("build", "build", [], pyproject.includes("[build-system]"), "No pyproject build-system found."),
	];
}

async function readPackageJson(repoPath: string): Promise<PackageJson> {
	const raw = await readFile(join(repoPath, "package.json"), "utf-8");
	const parsed = JSON.parse(raw) as unknown;
	const scripts = isRecord(parsed) && isRecord(parsed.scripts) ? stringRecord(parsed.scripts) : {};
	return { scripts };
}

async function detectPackageManager(repoPath: string): Promise<PackageManager> {
	if (await exists(join(repoPath, "pnpm-lock.yaml"))) {
		return "pnpm";
	}
	if ((await exists(join(repoPath, "bun.lockb"))) || (await exists(join(repoPath, "bun.lock")))) {
		return "bun";
	}
	if (await exists(join(repoPath, "yarn.lock"))) {
		return "yarn";
	}
	return "npm";
}

function nodeScriptCommand(
	packageManager: PackageManager,
	scriptName: VerifierKind,
	scripts: Record<string, string>,
): VerifierCommand {
	if (!scripts[scriptName]) {
		return skipped(scriptName, `${packageManager} run ${scriptName}`, `No "${scriptName}" script in package.json.`);
	}

	return command(scriptName, packageManager, ["run", scriptName], `${packageManager} run ${scriptName}`);
}

function pythonModuleCommand(
	kind: VerifierKind,
	moduleName: string,
	args: string[],
	shouldRun: boolean,
	skipReason: string,
): VerifierCommand {
	const display = `python -m ${moduleName}${args.length > 0 ? ` ${args.join(" ")}` : ""}`;
	if (!shouldRun) {
		return skipped(kind, display, skipReason);
	}
	return command(kind, "python", ["-m", moduleName, ...args], display);
}

function command(kind: VerifierKind, commandName: string, args: string[], display = `${commandName} ${args.join(" ")}`): VerifierCommand {
	return {
		args,
		command: commandName,
		display: display.trim(),
		kind,
	};
}

function skipped(kind: VerifierKind, display: string, skipReason: string): VerifierCommand {
	return {
		args: [],
		command: "",
		display,
		kind,
		skipReason,
	};
}

async function readOptionalFile(path: string): Promise<string> {
	try {
		return await readFile(path, "utf-8");
	} catch {
		return "";
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
	const output: Record<string, string> = {};
	for (const [key, nestedValue] of Object.entries(value)) {
		if (typeof nestedValue === "string") {
			output[key] = nestedValue;
		}
	}
	return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exitCodeFromError(error: unknown): number | undefined {
	return isRecord(error) && typeof error.exitCode === "number" ? error.exitCode : undefined;
}

function errorToString(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

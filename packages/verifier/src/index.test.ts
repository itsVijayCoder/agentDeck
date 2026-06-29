import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	defaultCommandRunner,
	detectVerifiers,
	goVerifier,
	nodeVerifier,
	pythonVerifier,
	runDetectedVerifiers,
	rustVerifier,
	type CommandRunner,
	type VerifierCommand,
} from "./index.js";

describe("@agentdeck/verifier", () => {
	it("detects language verifiers from repository marker files", async () => {
		const repoPath = await createRepo({
			"Cargo.toml": "[package]\nname = \"demo\"\n",
			"go.mod": "module example.com/demo\n",
			"package.json": "{}",
			"pyproject.toml": "[build-system]\nrequires = []\n",
		});

		await expect(detectVerifiers(repoPath)).resolves.toEqual([nodeVerifier, pythonVerifier, goVerifier, rustVerifier]);
	});

	it("plans Node package-manager scripts and skips missing scripts", async () => {
		const repoPath = await createRepo({
			"package.json": JSON.stringify({
				scripts: {
					lint: "eslint .",
					typecheck: "tsc --noEmit",
				},
			}),
			"pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
		});
		const calls: VerifierCommand[] = [];
		const runner: CommandRunner = async (command) => {
			calls.push(command);
			return {
				exitCode: command.kind === "lint" ? 1 : 0,
				output: command.kind,
			};
		};

		const results = await nodeVerifier.run({ repoPath, runner });

		expect(calls.map((call) => call.display)).toEqual(["pnpm run typecheck", "pnpm run lint"]);
		expect(results.map((result) => [result.kind, result.status, result.command])).toEqual([
			["typecheck", "passed", "pnpm run typecheck"],
			["lint", "failed", "pnpm run lint"],
			["test", "skipped", "pnpm run test"],
			["build", "skipped", "pnpm run build"],
		]);
		expect(results[2]?.summary).toBe('No "test" script in package.json.');
	});

	it("detects Bun, Yarn, and npm fallback package-manager commands", async () => {
		const bunRepo = await createRepo({
			"bun.lock": "",
			"package.json": JSON.stringify({ scripts: { build: "next build" } }),
		});
		const yarnRepo = await createRepo({
			"package.json": JSON.stringify({ scripts: { build: "next build" } }),
			"yarn.lock": "",
		});
		const npmRepo = await createRepo({
			"package.json": JSON.stringify({ scripts: null }),
		});

		await expect(nodeVerifier.run({ repoPath: bunRepo, runner: passingRunner })).resolves.toContainEqual(
			expect.objectContaining({ command: "bun run build", status: "passed" }),
		);
		await expect(nodeVerifier.run({ repoPath: yarnRepo, runner: passingRunner })).resolves.toContainEqual(
			expect.objectContaining({ command: "yarn run build", status: "passed" }),
		);
		await expect(nodeVerifier.run({ repoPath: npmRepo, runner: passingRunner })).resolves.toContainEqual(
			expect.objectContaining({ command: "npm run build", status: "skipped" }),
		);
	});

	it("plans Python verifiers from pyproject and setup.cfg", async () => {
		const repoPath = await createRepo({
			"pyproject.toml": "[build-system]\nrequires = []\n[tool.mypy]\n[tool.ruff]\n",
			"pytest.ini": "[pytest]\n",
		});
		const calls: string[] = [];

		const results = await pythonVerifier.run({
			repoPath,
			runner: async (command) => {
				calls.push(command.display);
				return { exitCode: 0, output: "ok" };
			},
		});

		expect(calls).toEqual(["python -m mypy .", "python -m ruff check .", "python -m pytest", "python -m build"]);
		expect(results.every((result) => result.status === "passed")).toBe(true);
	});

	it("detects Python tests directories without pytest.ini", async () => {
		const repoPath = await createRepo({
			"requirements.txt": "pytest\n",
			"tests/.keep": "",
		});

		await expect(pythonVerifier.run({ repoPath, runner: passingRunner })).resolves.toContainEqual(
			expect.objectContaining({ command: "python -m pytest", status: "passed" }),
		);
	});

	it("skips unconfigured Python tools and reports runner failures", async () => {
		const repoPath = await createRepo({
			"requirements.txt": "requests\n",
			"setup.cfg": "[mypy]\n",
		});

		const results = await pythonVerifier.run({
			repoPath,
			runner: async (command) => {
				if (command.kind === "typecheck") {
					throw new Error("mypy unavailable");
				}
				return { exitCode: 0, output: "ok" };
			},
		});

		expect(results.map((result) => [result.kind, result.status])).toEqual([
			["typecheck", "failed"],
			["lint", "skipped"],
			["test", "skipped"],
			["build", "skipped"],
		]);
		expect(results[0]?.output).toContain("mypy unavailable");
	});

	it("handles non-string script entries and structured runner failures", async () => {
		const repoPath = await createRepo({
			"package.json": JSON.stringify({
				scripts: {
					build: 42,
					typecheck: "tsc --noEmit",
				},
			}),
		});

		const results = await nodeVerifier.run({
			repoPath,
			runner: async () => {
				throw { exitCode: 127, message: "not an Error instance" };
			},
		});

		expect(results).toContainEqual(
			expect.objectContaining({
				exitCode: 127,
				output: "[object Object]",
				status: "failed",
			}),
		);
		expect(results).toContainEqual(expect.objectContaining({ command: "npm run build", status: "skipped" }));
	});

	it("runs detected verifiers with Go and Rust command strategies", async () => {
		const repoPath = await createRepo({
			"Cargo.toml": "[package]\nname = \"demo\"\n",
			"go.mod": "module example.com/demo\n",
		});
		const calls: string[] = [];

		const results = await runDetectedVerifiers({
			repoPath,
			runner: async (command) => {
				calls.push(command.display);
				return { exitCode: 0, output: command.display };
			},
		});

		expect(calls).toEqual([
			"go test ./... -run ^$",
			"go vet ./...",
			"go test ./...",
			"go build ./...",
			"cargo check --all-targets --all-features",
			"cargo clippy --all-targets --all-features",
			"cargo test --all-features",
			"cargo build --all-features",
		]);
		expect(results).toHaveLength(8);
	});

	it("executes commands with the default runner", async () => {
		const repoPath = await createRepo({});

		await expect(
			defaultCommandRunner(
				{
					args: ["-e", "console.log('agentdeck-verifier')"],
					command: process.execPath,
					display: "node -e",
					kind: "test",
				},
				{ repoPath },
			),
		).resolves.toEqual({
			exitCode: 0,
			output: "agentdeck-verifier",
		});
	});
});

const passingRunner: CommandRunner = async (command) => ({
	exitCode: 0,
	output: command.display,
});

async function createRepo(files: Record<string, string>): Promise<string> {
	const repoPath = await mkdtemp(join(tmpdir(), "agentdeck-verifier-"));
	for (const [relativePath, contents] of Object.entries(files)) {
		const target = join(repoPath, relativePath);
		await mkdir(join(target, ".."), { recursive: true });
		await writeFile(target, contents);
	}
	return repoPath;
}

import * as pty from "node-pty";

export type PtyExit = {
	exitCode: number;
	signal?: number;
};

export type PtySession = {
	kill(signal?: string): void;
	onData(handler: (data: string) => void): void;
	onExit(handler: (exit: PtyExit) => void): void;
	pid: number;
	resize(cols: number, rows: number): void;
	write(data: string): void;
};

export type PtySpawnOptions = {
	cols?: number;
	cwd: string;
	env?: Record<string, string>;
	rows?: number;
};

export class PtyManager {
	spawn(command: string, args: string[], options: PtySpawnOptions): PtySession {
		const shell = pty.spawn(command, args, {
			cols: options.cols ?? 80,
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			name: "xterm-256color",
			rows: options.rows ?? 24,
		});

		return {
			kill: (signal?: string) => {
				shell.kill(signal);
			},
			onData: (handler) => {
				shell.onData(handler);
			},
			onExit: (handler) => {
				shell.onExit(handler);
			},
			pid: shell.pid,
			resize: (cols, rows) => {
				shell.resize(cols, rows);
			},
			write: (data) => {
				shell.write(data);
			},
		};
	}
}

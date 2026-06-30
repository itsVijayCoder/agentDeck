"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	Activity,
	Bot,
	CalendarClock,
	Files,
	GitBranch,
	MonitorCog,
	Radar,
	Search,
	ShieldCheck,
	SquareStack,
	Users,
} from "lucide-react";
import { useUiStore } from "@/store/ui-store";

const commands = [
	{ icon: Radar, id: "mission", label: "Open Mission Control", path: "/mission-control" },
	{ icon: SquareStack, id: "sessions", label: "Open Active Session", path: "/sessions/session_auth_refresh" },
	{ icon: Bot, id: "agents", label: "Open Agent Inventory", path: "/agents" },
	{ icon: GitBranch, id: "queue", label: "Open Build Queue", path: "/queue" },
	{ icon: CalendarClock, id: "schedules", label: "Open Schedules", path: "/schedules" },
	{ icon: Files, id: "reports", label: "Open Reports", path: "/reports" },
	{ icon: Activity, id: "observability", label: "Open Observability", path: "/observability" },
	{ icon: Users, id: "team", label: "Open Team", path: "/team" },
	{ icon: ShieldCheck, id: "policies", label: "Open Policies", path: "/policies" },
	{ icon: MonitorCog, id: "machines", label: "Open Machine Settings", path: "/settings/machines" },
];

export function CommandPalette() {
	const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen);
	const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
	const [query, setQuery] = useState("");
	const router = useRouter();
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setCommandPaletteOpen(!commandPaletteOpen);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [commandPaletteOpen, setCommandPaletteOpen]);

	const visibleCommands = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return commands;
		}

		return commands.filter((command) => command.label.toLowerCase().includes(normalizedQuery));
	}, [query]);

	function runCommand(path: string) {
		router.push(path);
		setCommandPaletteOpen(false);
		setQuery("");
	}

	return (
		<Dialog.Root open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
			<AnimatePresence>
				{commandPaletteOpen ? (
					<Dialog.Portal forceMount>
						<Dialog.Overlay asChild>
							<motion.div
								animate={{ opacity: 1 }}
								className="of-command-overlay"
								exit={{ opacity: 0 }}
								initial={{ opacity: 0 }}
								transition={{ duration: reduceMotion ? 0 : 0.16 }}
							/>
						</Dialog.Overlay>
						<Dialog.Content asChild>
							<motion.div
								animate={{ opacity: 1, scale: 1, y: 0 }}
								className="of-command-palette"
								exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : -8 }}
								initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : -8 }}
								transition={{ duration: reduceMotion ? 0 : 0.18 }}
							>
								<Dialog.Title className="of-sr-only">Command palette</Dialog.Title>
								<div className="of-command-input">
									<Search aria-hidden="true" size={17} />
									<input
										autoFocus
										onChange={(event) => setQuery(event.target.value)}
										placeholder="Open a screen, report, queue, or policy..."
										value={query}
									/>
									<Dialog.Close type="button">Esc</Dialog.Close>
								</div>
								<div className="of-command-results">
									{visibleCommands.map((command) => (
										<button key={command.id} onClick={() => runCommand(command.path)} type="button">
											<command.icon aria-hidden="true" size={16} />
											<span>{command.label}</span>
										</button>
									))}
								</div>
							</motion.div>
						</Dialog.Content>
					</Dialog.Portal>
				) : null}
			</AnimatePresence>
		</Dialog.Root>
	);
}

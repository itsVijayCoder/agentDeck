-- OpenFusion control-plane schema for Cloudflare D1.
-- D1 stores queryable metadata and R2 object references; large logs and artifacts stay in R2.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL CHECK (length(trim(name)) > 0),
	repository_url TEXT,
	default_branch TEXT NOT NULL DEFAULT 'main' CHECK (length(trim(default_branch)) > 0),
	privacy_mode TEXT NOT NULL DEFAULT 'metadata-only' CHECK (privacy_mode IN ('local-only', 'metadata-only', 'full-sync')),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS machines (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
	os TEXT NOT NULL CHECK (length(trim(os)) > 0),
	arch TEXT NOT NULL CHECK (length(trim(arch)) > 0),
	bridge_version TEXT NOT NULL CHECK (length(trim(bridge_version)) > 0),
	status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'pairing', 'stale', 'revoked')),
	last_seen_at TEXT,
	revoked_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_installations (
	id TEXT PRIMARY KEY,
	machine_id TEXT NOT NULL,
	agent_kind TEXT NOT NULL CHECK (agent_kind IN ('claude-code', 'codex', 'opencode', 'qwen-code', 'pi', 'aider', 'acp')),
	command TEXT NOT NULL CHECK (length(trim(command)) > 0),
	version TEXT,
	auth_status TEXT NOT NULL CHECK (auth_status IN ('unknown', 'configured', 'missing', 'expired')),
	capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
	detected_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
	UNIQUE (machine_id, agent_kind, command)
);

CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	parent_session_id TEXT,
	title TEXT NOT NULL CHECK (length(trim(title)) > 0),
	status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'waiting-machine', 'running', 'waiting-approval', 'paused', 'verifying', 'completed', 'failed', 'cancelled')),
	privacy_mode TEXT NOT NULL CHECK (privacy_mode IN ('local-only', 'metadata-only', 'full-sync')),
	created_by TEXT NOT NULL CHECK (length(trim(created_by)) > 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
	FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS runs (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL,
	queue_item_id TEXT,
	scheduled_job_id TEXT,
	machine_id TEXT,
	agent_installation_id TEXT,
	task TEXT NOT NULL CHECK (length(trim(task)) > 0),
	worktree_path_hash TEXT,
	branch_name TEXT,
	status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'waiting-machine', 'running', 'waiting-approval', 'paused', 'verifying', 'completed', 'failed', 'cancelled')),
	cost_usd REAL CHECK (cost_usd IS NULL OR cost_usd >= 0),
	latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
	confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
	started_at TEXT,
	completed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
	FOREIGN KEY (queue_item_id) REFERENCES queue_items(id) ON DELETE SET NULL,
	FOREIGN KEY (scheduled_job_id) REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
	FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE SET NULL,
	FOREIGN KEY (agent_installation_id) REFERENCES agent_installations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS event_index (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	session_id TEXT NOT NULL,
	run_id TEXT,
	seq INTEGER NOT NULL CHECK (seq >= 0),
	type TEXT NOT NULL CHECK (length(trim(type)) > 0),
	source TEXT NOT NULL CHECK (source IN ('browser', 'worker', 'durable-object', 'bridge', 'agent', 'verifier', 'ai-gateway')),
	visibility TEXT NOT NULL CHECK (visibility IN ('local-only', 'metadata', 'full')),
	object_key TEXT,
	payload_hash TEXT,
	trace_id TEXT,
	created_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
	FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
	FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
	UNIQUE (session_id, seq)
);

CREATE TABLE IF NOT EXISTS approvals (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	session_id TEXT NOT NULL,
	run_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('command', 'provider', 'file', 'queue', 'patch')),
	title TEXT NOT NULL CHECK (length(trim(title)) > 0),
	risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
	status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
	requested_action_json TEXT NOT NULL CHECK (json_valid(requested_action_json)),
	decision_json TEXT CHECK (decision_json IS NULL OR json_valid(decision_json)),
	decided_by TEXT,
	expires_at TEXT,
	created_at TEXT NOT NULL,
	decided_at TEXT,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
	FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
	FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS queue_items (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	created_by TEXT NOT NULL CHECK (length(trim(created_by)) > 0),
	task TEXT NOT NULL CHECK (length(trim(task)) > 0),
	priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
	status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'waiting-machine', 'running', 'waiting-approval', 'paused', 'verifying', 'completed', 'failed', 'cancelled')),
	run_after TEXT,
	schedule_window_json TEXT CHECK (schedule_window_json IS NULL OR json_valid(schedule_window_json)),
	agent_selector_json TEXT CHECK (agent_selector_json IS NULL OR json_valid(agent_selector_json)),
	machine_selector_json TEXT CHECK (machine_selector_json IS NULL OR json_valid(machine_selector_json)),
	max_cost_usd REAL CHECK (max_cost_usd IS NULL OR max_cost_usd >= 0),
	max_runtime_minutes INTEGER CHECK (max_runtime_minutes IS NULL OR max_runtime_minutes > 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	cancelled_at TEXT,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	name TEXT NOT NULL CHECK (length(trim(name)) > 0),
	natural_language TEXT NOT NULL CHECK (length(trim(natural_language)) > 0),
	cron TEXT NOT NULL CHECK (length(trim(cron)) > 0),
	timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
	enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
	task_template TEXT NOT NULL CHECK (length(trim(task_template)) > 0),
	agent_selector_json TEXT NOT NULL CHECK (json_valid(agent_selector_json)),
	machine_selector_json TEXT NOT NULL CHECK (json_valid(machine_selector_json)),
	next_run_at TEXT,
	last_run_at TEXT,
	last_status TEXT CHECK (last_status IS NULL OR last_status IN ('success', 'failed', 'cancelled', 'never-run')),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	session_id TEXT NOT NULL,
	run_id TEXT,
	kind TEXT NOT NULL CHECK (length(trim(kind)) > 0),
	object_key TEXT NOT NULL CHECK (length(trim(object_key)) > 0),
	mime_type TEXT NOT NULL CHECK (length(trim(mime_type)) > 0),
	size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
	sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
	redaction_status TEXT NOT NULL CHECK (redaction_status IN ('none', 'pending', 'redacted', 'blocked')),
	created_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
	FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
	FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decision_reports (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	session_id TEXT NOT NULL,
	summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
	recommendation TEXT NOT NULL CHECK (recommendation IN ('accept', 'review-carefully', 'reject', 'rerun')),
	confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
	cost_usd REAL CHECK (cost_usd IS NULL OR cost_usd >= 0),
	latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
	report_json TEXT NOT NULL CHECK (json_valid(report_json)),
	object_key TEXT,
	created_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
	FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS policy_rules (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	action TEXT NOT NULL CHECK (length(trim(action)) > 0),
	default_decision TEXT NOT NULL CHECK (default_decision IN ('allow', 'approval', 'deny')),
	risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
	reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
	matcher_json TEXT NOT NULL CHECK (json_valid(matcher_json)),
	enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_machines_workspace_status ON machines(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_machine_kind ON agent_installations(machine_id, agent_kind);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_status ON sessions(workspace_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_runs_session_status ON runs(session_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_queue_item ON runs(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_runs_scheduled_job ON runs(scheduled_job_id);
CREATE INDEX IF NOT EXISTS idx_events_session_seq ON event_index(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_events_run_seq ON event_index(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_events_workspace_type ON event_index(workspace_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_workspace_status ON approvals(workspace_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_run_status ON approvals(run_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_workspace_status ON queue_items(workspace_id, status, priority, run_after);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON scheduled_jobs(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id, run_id);
CREATE INDEX IF NOT EXISTS idx_reports_workspace_created ON decision_reports(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_policy_workspace_enabled ON policy_rules(workspace_id, enabled, action);

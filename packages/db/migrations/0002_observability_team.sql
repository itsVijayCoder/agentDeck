-- Phase 12: observability, evals, team beta, audit, and retention contracts.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
	display_name TEXT,
	avatar_url TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'observer')),
	invited_by TEXT,
	invited_at TEXT NOT NULL,
	joined_at TEXT,
	created_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	actor_id TEXT,
	action TEXT NOT NULL CHECK (length(trim(action)) > 0),
	resource_type TEXT NOT NULL CHECK (length(trim(resource_type)) > 0),
	resource_id TEXT,
	details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
	ip_address TEXT,
	user_agent TEXT,
	created_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	metric_name TEXT NOT NULL CHECK (length(trim(metric_name)) > 0),
	metric_value REAL NOT NULL,
	labels_json TEXT NOT NULL CHECK (json_valid(labels_json)),
	period_start TEXT NOT NULL,
	period_end TEXT NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eval_runs (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	dataset_id TEXT NOT NULL CHECK (length(trim(dataset_id)) > 0),
	agent_kind TEXT NOT NULL CHECK (agent_kind IN ('claude-code', 'codex', 'opencode', 'qwen-code', 'pi', 'aider', 'acp')),
	model TEXT,
	status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
	score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
	results_json TEXT CHECK (results_json IS NULL OR json_valid(results_json)),
	started_at TEXT NOT NULL,
	completed_at TEXT,
	created_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS retention_policies (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL,
	resource_type TEXT NOT NULL CHECK (
		resource_type IN (
			'terminal-logs',
			'transcripts',
			'events',
			'artifacts',
			'reports',
			'audit-log',
			'metric-snapshots',
			'eval-runs'
		)
	),
	retention_days INTEGER NOT NULL CHECK (retention_days > 0),
	action TEXT NOT NULL CHECK (action IN ('delete', 'archive')),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
	UNIQUE (workspace_id, resource_type)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_members_workspace ON workspace_members(workspace_id, role);
CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_workspace_created ON audit_log(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_metrics_workspace_period ON metric_snapshots(workspace_id, metric_name, period_start);
CREATE INDEX IF NOT EXISTS idx_evals_workspace ON eval_runs(workspace_id, dataset_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retention_workspace ON retention_policies(workspace_id, resource_type);

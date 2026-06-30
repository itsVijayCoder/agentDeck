# AgentDeck Cloudflare Deployment From GitHub

This guide explains how to deploy AgentDeck to Cloudflare Workers from GitHub.

Short answer: you do **not** need a production deploy to check the UI, live setup screen, or local D1-backed task creation path. Use `pnpm dev` or `pnpm preview` for that. You **do** need a Cloudflare deploy to test the real production runtime path: Durable Object SessionHub, Workers WebSockets, Queue consumer, Workflows, Cron, D1 remote data, R2 artifacts, and a bridge connecting over an internet URL.

AgentDeck is a Next.js 16/OpenNext app deployed to **Cloudflare Workers**, not Cloudflare Pages. Keep the deployment path on Workers because this repo uses D1, R2, Durable Objects, Queues, Workflows, Cron, and a custom Worker entrypoint.

## Current Deployment Shape

Source of truth:

- App package: `apps/web`
- Deploy config: `apps/web/wrangler.jsonc`
- Worker entrypoint: `apps/web/worker.ts`
- Deploy script: `pnpm deploy` -> `pnpm --filter @agentdeck/web deploy`
- Web deploy script: `opennextjs-cloudflare build && opennextjs-cloudflare deploy`

Cloudflare resources configured today:

| Binding | Cloudflare product | Config value |
|---|---|---|
| `AGENTDECK_DB` | D1 | database `agentdeck-control` |
| `AGENTDECK_ARTIFACTS` | R2 | bucket `agentdeck-artifacts` |
| `SESSION_HUB` | Durable Object | class `SessionHub` |
| `AGENTDECK_QUEUE` | Queue producer | queue `agentdeck-runs` |
| Queue consumer | Queue consumer | queue `agentdeck-runs`, DLQ `agentdeck-runs-dlq` |
| `RUN_WORKFLOW` | Workflows | workflow `agentdeck-run-workflow` |
| Cron | Workers Cron | `* * * * *`, `0 3 * * *` |
| `ASSETS` | Workers static assets | `.open-next/assets` |
| `WORKER_SELF_REFERENCE` | Service binding | service `agentdeck` |
| `IMAGES` | Cloudflare Images binding | image optimization |

## Before You Start

You need:

1. A Cloudflare account.
2. A GitHub repository containing this project.
3. Node.js and pnpm locally.
4. Cloudflare Wrangler auth locally for the first resource provisioning.
5. A GitHub Actions deploy token stored as a GitHub secret.

Do not put production secrets in `.dev.vars`, `.env`, Git, or `wrangler.jsonc`.

## Step 1: Verify Local Build Health

From the repo root:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build:packages
pnpm build
```

If these fail, fix them before deploying. A Cloudflare deploy should not be your first validation step.

## Step 2: Decide What You Are Testing

Use this table to choose the right environment:

| Goal | Recommended command |
|---|---|
| UI, setup screen, live API error states | `AGENTDECK_DATA_MODE=live AGENTDECK_LOCAL_DISPATCH=1 pnpm dev` |
| Workers-like local preview | `pnpm preview` |
| Real DO, Queue, Workflow, Cron, remote D1/R2 | Deploy to Cloudflare |
| Public bridge pairing URL | Deploy to Cloudflare |

For Phase 13 real runtime validation, deploy to Cloudflare.

## Step 3: Authenticate Wrangler Locally

From repo root:

```bash
pnpm -C apps/web exec wrangler --version
pnpm -C apps/web exec wrangler whoami
```

If `whoami` is not authenticated:

```bash
pnpm -C apps/web exec wrangler login
pnpm -C apps/web exec wrangler whoami
```

## Step 4: Provision Cloudflare Resources Once

Run these commands from the repo root.

```bash
pnpm -C apps/web exec wrangler d1 create agentdeck-control
pnpm -C apps/web exec wrangler r2 bucket create agentdeck-artifacts
pnpm -C apps/web exec wrangler queues create agentdeck-runs
pnpm -C apps/web exec wrangler queues create agentdeck-runs-dlq
```

Important:

- `d1 create` prints a `database_id`.
- Put that `database_id` into `apps/web/wrangler.jsonc` under `d1_databases[0].database_id`.
- If this repo already points at the correct database in your Cloudflare account, do not change it.
- Durable Objects and Workflows are declared in `wrangler.jsonc`; they are deployed with the Worker.

## Step 5: Apply Remote D1 Migrations

AgentDeck migrations live in `packages/db/migrations`, and `apps/web/wrangler.jsonc` points at that folder.

From repo root:

```bash
pnpm -C apps/web exec wrangler d1 migrations list agentdeck-control --remote
pnpm -C apps/web exec wrangler d1 migrations apply agentdeck-control --remote
```

Run this before the first deploy and again whenever `packages/db/migrations` changes.

## Step 6: Configure Production Worker Secrets

Minimum required runtime secret:

```bash
printf "%s" "replace-with-a-long-random-secret" | pnpm -C apps/web exec wrangler secret put AGENTDECK_SESSION_SECRET
```

Recommended random secret generation:

```bash
openssl rand -base64 48
```

Optional runtime secrets, depending on which features you enable:

```bash
printf "%s" "<bridge-token>" | pnpm -C apps/web exec wrangler secret put AGENTDECK_BRIDGE_TOKEN
printf "%s" "<cloudflare-account-id>" | pnpm -C apps/web exec wrangler secret put CLOUDFLARE_ACCOUNT_ID
printf "%s" "<cloudflare-ai-gateway-token>" | pnpm -C apps/web exec wrangler secret put CLOUDFLARE_API_TOKEN
printf "%s" "default" | pnpm -C apps/web exec wrangler secret put CLOUDFLARE_GATEWAY_ID
printf "%s" "cloudflare-rest" | pnpm -C apps/web exec wrangler secret put AGENTDECK_AI_GATEWAY_MODE
printf "%s" "off" | pnpm -C apps/web exec wrangler secret put AGENTDECK_AI_DLP_MODE
```

Notes:

- Keep the GitHub deploy token separate from the runtime `CLOUDFLARE_API_TOKEN`.
- If using AI Gateway, create a separate GitHub secret such as `AGENTDECK_AI_GATEWAY_API_TOKEN`, then upload it to Worker runtime secret name `CLOUDFLARE_API_TOKEN`.
- Do **not** set `AGENTDECK_LOCAL_DISPATCH=1` in production.
- `AGENTDECK_DATA_MODE` defaults to live. You can leave it unset for production.

## Step 7: First Manual Production Deploy

Run a manual deploy once before wiring GitHub Actions. This proves the Cloudflare account, resource names, secrets, and migrations are correct.

```bash
pnpm deploy
```

When deploy succeeds, Wrangler/OpenNext will print the Worker URL, usually:

```text
https://agentdeck.<your-subdomain>.workers.dev
```

Open that URL. You should see the live setup path, not mock dashboard data.

## Step 8: Verify Production Runtime

After deploy:

```bash
pnpm -C apps/web exec wrangler tail agentdeck
```

Then in the browser:

1. Open the deployed Worker URL.
2. Create a workspace from `/setup`.
3. Go to Settings -> Machines.
4. Generate a bridge pairing command.
5. Pair the bridge using the deployed URL.

Example bridge command shape:

```bash
pnpm --filter @agentdeck/bridge dev -- pair "<PAIRING_CODE>" --cloud-url "https://agentdeck.<your-subdomain>.workers.dev" --display-name "My machine"
```

Then:

1. Create a task from the command bar.
2. Confirm the queue item persists after refresh.
3. Dispatch through the production queue/workflow path.
4. Confirm SessionHub streams terminal events.
5. Confirm approvals, verifier events, reports, and audit rows appear.

## Step 9: Create A Cloudflare API Token For GitHub

Create a GitHub deploy token in Cloudflare with least privilege for this account.

It must be able to:

- deploy the Worker,
- read account metadata needed by Wrangler,
- apply D1 migrations,
- access the configured Worker resources during deployment.

If GitHub Actions will only deploy code and run migrations, keep the token scoped to Worker deploy plus D1 migration access. If GitHub Actions will also create D1/R2/Queues, it needs broader create/edit permissions for those products. Prefer provisioning resources manually once, then using a narrower CI token.

Store these GitHub repository secrets:

| GitHub secret | Purpose |
|---|---|
| `CF_API_TOKEN_DEPLOY` | Cloudflare deploy token for GitHub Actions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

Optional GitHub secrets if you want CI to update Worker runtime secrets:

| GitHub secret | Worker runtime secret uploaded as |
|---|---|
| `AGENTDECK_SESSION_SECRET` | `AGENTDECK_SESSION_SECRET` |
| `AGENTDECK_BRIDGE_TOKEN` | `AGENTDECK_BRIDGE_TOKEN` |
| `AGENTDECK_AI_GATEWAY_API_TOKEN` | `CLOUDFLARE_API_TOKEN` |
| `AGENTDECK_AI_GATEWAY_ID` | `CLOUDFLARE_GATEWAY_ID` |

## Step 10: Add GitHub Actions Workflow

Create this file in your GitHub repository:

```text
.github/workflows/cloudflare-deploy.yml
```

Recommended workflow:

```yaml
name: Deploy AgentDeck to Cloudflare

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: cloudflare-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    permissions:
      contents: read

    env:
      AGENTDECK_DATA_MODE: live
      NEXT_PUBLIC_AGENTDECK_DATA_MODE: live
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN_DEPLOY }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Enable Corepack
        run: corepack enable

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Unit tests
        run: pnpm test

      - name: Build packages
        run: pnpm build:packages

      - name: Build web app
        run: pnpm build

      - name: Apply D1 migrations
        run: pnpm -C apps/web exec wrangler d1 migrations apply agentdeck-control --remote

      - name: Deploy Worker
        run: pnpm deploy
```

Why this workflow uses `pnpm deploy` instead of a plain `wrangler deploy` command:

- this repo deploys a Next.js/OpenNext app,
- `pnpm deploy` runs `opennextjs-cloudflare build`,
- then it deploys the generated Worker bundle and assets.

Cloudflare's official `cloudflare/wrangler-action` is still valid for plain Wrangler deployments, but the shell-based workflow is clearer here because the package script already wraps OpenNext correctly.

## Step 11: Optional CI Runtime Secret Upload

Usually, set Worker runtime secrets manually once with `wrangler secret put`. That avoids writing secrets to temporary files during CI.

If you want GitHub Actions to update runtime secrets during deploy, add this before `Deploy Worker`:

```yaml
      - name: Write Worker runtime secrets file
        working-directory: apps/web
        run: |
          {
            echo "AGENTDECK_SESSION_SECRET=${{ secrets.AGENTDECK_SESSION_SECRET }}"
            echo "AGENTDECK_BRIDGE_TOKEN=${{ secrets.AGENTDECK_BRIDGE_TOKEN }}"
            echo "CLOUDFLARE_ACCOUNT_ID=${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"
            echo "CLOUDFLARE_API_TOKEN=${{ secrets.AGENTDECK_AI_GATEWAY_API_TOKEN }}"
            echo "CLOUDFLARE_GATEWAY_ID=${{ secrets.AGENTDECK_AI_GATEWAY_ID }}"
            echo "AGENTDECK_AI_GATEWAY_MODE=cloudflare-rest"
            echo "AGENTDECK_AI_DLP_MODE=off"
          } > .prod.vars

      - name: Deploy Worker with runtime secrets
        working-directory: apps/web
        run: pnpm exec opennextjs-cloudflare build && pnpm exec wrangler deploy --secrets-file .prod.vars
```

Do not commit `.prod.vars`. Add it to `.gitignore` if you start using this path.

## Step 12: GitHub Branch Protection

Recommended GitHub settings:

1. Require pull request before merging to `main`.
2. Require the deploy workflow checks before merge.
3. Disable direct pushes to `main`.
4. Keep production deployment only on `main`.
5. Use `workflow_dispatch` for manual redeploys.

## Step 13: Custom Domain

First deploy to `workers.dev`. After that works:

1. Open Cloudflare dashboard.
2. Go to Workers & Pages.
3. Select Worker `agentdeck`.
4. Open Settings -> Domains & Routes.
5. Add your custom domain or route.
6. Test setup, WebSocket, queue dispatch, and bridge pairing again on the custom domain.

Bridge pairing must use the same public URL users open in the browser.

## Step 14: Production Smoke Test Checklist

Use this checklist after every deployment:

```text
[ ] Worker URL opens
[ ] Setup screen creates a workspace
[ ] Session cookie is set
[ ] /mission-control loads live data
[ ] /queue shows real queue state, not mock data
[ ] /settings/machines creates a bridge pairing code
[ ] Bridge pairs against deployed URL
[ ] New task creates a session and linked queue item
[ ] Queue/Workflow dispatches to SessionHub
[ ] Browser terminal receives events
[ ] Risky command creates approval request
[ ] Approval decision reaches bridge
[ ] Verifier events persist
[ ] Report appears under /reports
[ ] Audit log records setup/task/dispatch/approval/report activity
[ ] wrangler tail has no unhandled runtime errors
```

## Common Failures

### Build fails in GitHub

Run the same commands locally:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build:packages
pnpm build
```

If local passes but CI fails, check Node version, pnpm version, missing GitHub secrets, or Cloudflare token permissions.

### D1 migration fails

Check:

```bash
pnpm -C apps/web exec wrangler d1 migrations list agentdeck-control --remote
pnpm -C apps/web exec wrangler d1 info agentdeck-control
```

Confirm `apps/web/wrangler.jsonc` has the correct `database_id` for the current Cloudflare account.

### Worker opens but setup returns 500

Most likely causes:

- missing `AGENTDECK_SESSION_SECRET`,
- D1 migrations were not applied,
- `AGENTDECK_DB` points at the wrong D1 database,
- Worker runtime secrets were set on a different Worker/environment.

### Bridge cannot connect

Check:

- bridge command uses the deployed `https://...workers.dev` or custom domain URL,
- machine pairing code has not expired,
- Worker logs show the WebSocket request,
- `SESSION_HUB` Durable Object binding exists,
- no corporate proxy blocks WebSocket connections.

### Queue items do not run

Check:

- `agentdeck-runs` exists,
- `agentdeck-runs-dlq` exists,
- Worker deploy includes queue consumer config,
- `RUN_WORKFLOW` exists after deploy,
- an online bridge machine has a matching agent installation,
- `wrangler tail agentdeck` does not show workflow dispatch errors.

## Rollback

If production deploy is bad:

```bash
pnpm -C apps/web exec wrangler versions list
pnpm -C apps/web exec wrangler rollback
```

After rollback, confirm:

```bash
pnpm -C apps/web exec wrangler tail agentdeck
```

Do not roll back D1 migrations blindly. If a migration changed schema, inspect compatibility first.

## Source References

- OpenNext Cloudflare setup and deploy: https://opennext.js.org/cloudflare/get-started
- Cloudflare Workers GitHub Actions: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Cloudflare Wrangler commands: https://developers.cloudflare.com/workers/wrangler/commands/
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Wrangler D1 commands: https://developers.cloudflare.com/workers/wrangler/commands/d1/
- Wrangler R2 commands: https://developers.cloudflare.com/workers/wrangler/commands/r2/
- Wrangler Queues commands: https://developers.cloudflare.com/workers/wrangler/commands/queues/
- Wrangler Workflows commands: https://developers.cloudflare.com/workers/wrangler/commands/workflows/
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/

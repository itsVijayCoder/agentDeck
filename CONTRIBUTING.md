# Contributing to AgentDeck

Thanks for considering a contribution. AgentDeck is early, so the highest-value work is clear architecture, typed contracts, verified UI, and small implementation slices.

## Development Flow

1. Read `Docs/ARCHITECTURE_BLUEPRINT.md`.
2. Keep changes focused on one product or engineering slice.
3. Prefer shared types in `src/types` before adding component-only shapes.
4. Keep mock data in `src/lib/mock-agentdeck.ts` until real APIs exist.
5. Run `npm run build` before submitting.

## Commit Style

Use concise conventional commits:

```text
docs: add architecture blueprint
feat(core): add run event types
feat(ui): build terminal dock
fix(ui): prevent mobile overflow
chore: update project metadata
```

## Code Standards

- Use TypeScript strict mode.
- Prefer explicit unions for lifecycle states, risks, privacy modes, and statuses.
- Keep React components focused and named after product concepts.
- Do not introduce real provider calls into mock UI.
- Do not add hidden auto-merge, push, publish, or deploy behavior.
- Document architecture or policy changes when they affect the product contract.

## Security and Privacy

AgentDeck is local-first and human-controlled. Contributions must preserve these defaults:

- Workspace folders are explicit.
- Secrets are not read silently.
- Raw logs are privacy-mode controlled.
- Risky commands require approval.
- Git push, merge, deploy, and publish are blocked by default.

Report security concerns privately until the project publishes a dedicated security policy.

# AgentDeck Evals

Phase 12 evals use deterministic datasets and the `@agentdeck/harness` eval runner. Keep datasets small and privacy-safe by default; real agent execution should run through the bridge with `local-only` privacy unless a workspace explicitly allows broader sync.

```ts
import { runEval } from "@agentdeck/harness";
```

Datasets in this directory are seed benchmarks for local and CI smoke comparisons. They are not allowed to call model providers directly.

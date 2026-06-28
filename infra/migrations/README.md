# D1 Migrations

The canonical migration SQL now lives in `packages/db/migrations`.

This directory is kept as a compatibility marker for older docs and tooling references. New migrations should be added to `packages/db/migrations` and referenced from Worker/Wrangler configs relative to the package that owns the binding.

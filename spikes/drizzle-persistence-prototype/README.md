# PROTOTYPE — Drizzle persistence and migration ergonomics

This throwaway prototype asks whether a fully transitioned Drizzle slice makes
routine persistence, a difficult projection, and a nontrivial populated SQLite
schema upgrade easier and safer for this repository's AI maintainer than
project-owned SQL with focused typed row decoders. Adoption effort is excluded;
ongoing driver, dependency, artifact, and abstraction costs are included.

Run the interactive evidence viewer:

```powershell
pnpm --dir spikes/drizzle-persistence-prototype prototype
```

Run every comparison noninteractively:

```powershell
pnpm --dir spikes/drizzle-persistence-prototype prototype -- --all
```

The prototype creates disposable databases under the operating-system temp
directory and removes them after each run. The initial `drizzle/` generation
and the fair view-modeled `drizzle-modeled/` generation are retained as
evidence. They are prototype artifacts, not production migrations.

The prototype's `tsconfig.json` sets `skipLibCheck: true`. Without it,
Drizzle ORM 0.45.2's published declarations fail under this repository's
TypeScript 5.9 strict settings because of missing optional peer declarations
and internal declaration incompatibilities across non-SQLite dialects. This is
captured as prototype evidence, not proposed as a production configuration.
The incompatible published declarations can be reproduced deliberately with:

```powershell
pnpm --dir spikes/drizzle-persistence-prototype typecheck:published-libraries
```

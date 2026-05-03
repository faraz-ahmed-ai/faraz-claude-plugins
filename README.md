# create-t3-app

A Claude skill (Claude Code) that scaffolds a fully-working T3 stack project with a local Postgres dev DB. Run it in an empty directory and end up with a Next.js + tRPC + Drizzle + better-auth project where `npm run app` Just Works — no Docker, no cloud database, no extra config.

## The stack (opinionated, no toggles)

| Layer | Choice |
|---|---|
| Framework | Next.js — App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| API | tRPC |
| ORM | Drizzle |
| Auth | better-auth |
| Database (dev) | PGlite (embedded WASM Postgres) running as a local TCP daemon on `127.0.0.1:5432` |
| Database (prod) | PostgreSQL — you bring the URL at deploy time |
| Lint / format | ESLint + Prettier |

The skill takes **no arguments**. Every choice above is fixed. If you want a different combination, this isn't the skill for that — fork it and swap the relevant CLI flags in Step 3 of `SKILL.md`.

## What you get

After running the skill in an empty directory:

- A scaffolded create-t3-app project with the choices above
- `package.json` peer-dep conflicts resolved cleanly (no `--legacy-peer-deps`)
- A local PGlite daemon installed, configured, and verified
- `.env` populated with a freshly-generated `BETTER_AUTH_SECRET` and a hardcoded local `DATABASE_URL`
- Three new npm scripts: `npm run app`, `npm run db:start`, `npm run db:stop`
- Schema pushed to the local DB and verified end-to-end with an HTTP 200 against the dev server
- Everything staged in git, ready for your `git commit -m "initial commit"`

The skill is deliberately quiet during execution. You'll see one short success line per component as it lands, then a final "How to use" block. No scaffold logs, no install output, no narration of intermediate steps.

## What problems it solves

A vanilla `npx create-t3-app@latest` run currently has half a dozen sharp edges. This skill knows about each and works around it:

- **Node 25+ TTY init crash on dotfiles.** create-t3-app refuses to run when the target dir contains any dotfile (`.git`, `.claude`, `.env.local`, …) and on Node 25+ this manifests as `ERR_TTY_INIT_FAILED` instead of a prompt. The skill stashes dotfiles to a tmpdir, scaffolds against an empty directory, and restores — all inside one shell session so the agent harness can't recreate dotfiles in the gap.
- **Two-iteration ERESOLVE between better-auth and drizzle.** Current better-auth peers want newer `drizzle-kit` and `drizzle-orm` than create-t3-app's pins. The skill bumps only the package npm explicitly names, runs install again, bumps the next named one — clean lockfile in two iterations, no `--legacy-peer-deps`.
- **Required GitHub OAuth env vars block `db:push`.** The scaffold's `env.js` requires `BETTER_AUTH_GITHUB_CLIENT_ID/SECRET`, so `db:push` fails before it touches the database. The skill makes them `.optional()` so a fresh project runs end-to-end without OAuth credentials.
- **Drizzle table-prefix mismatch.** The scaffold's `pgTableCreator` prefix doesn't match `tablesFilter` in `drizzle.config.ts`, so drizzle-kit tries to recreate tables on every push. The skill aligns both to the project name.
- **Better-auth tables silently re-created.** `tablesFilter` only matches the project prefix, but better-auth's tables (`user`, `session`, `account`, `verification`) are intentionally unprefixed. The skill broadens the filter so drizzle-kit sees them as managed.
- **Import-alias post-scaffold bug.** Passing `--import-alias "~/"` (the verbatim default) triggers `TypeError: i.replace is not a function`. The skill omits the flag entirely; the resulting `tsconfig.json` is identical.

Workarounds verified against create-t3-app current as of May 2026. If a future create-t3-app release fixes any of these, the relevant workaround in `SKILL.md` becomes a no-op rather than a regression.

## How the local PGlite daemon works

The skill installs `@electric-sql/pglite` (embedded WASM Postgres) and `@electric-sql/pglite-socket` (Postgres wire protocol over TCP) and writes three scripts to `scripts/`:

- `db-start.sh` — starts `pglite-server` as a `nohup`'d background process on `127.0.0.1:5432`, with data at `.pglite/data/`. Idempotent: re-running detects an existing daemon and exits 0.
- `db-stop.sh` — kills the daemon by command-line pattern (more reliable than PID files for `npx`-wrapped processes).
- `launch.sh` — starts the daemon (no-op if running) then runs `npm run dev`. Exposed as `npm run app`.

The daemon outlives `launch.sh` on purpose — Ctrl-C dev, run `npm run db:studio` (PGlite has a one-connection limit so dev must be down for studio), then `npm run app` to resume. Cleanup is `npm run db:stop` whenever you're done for the day.

`db:push` is intentionally **not** in `launch.sh`. Schema sync should be a deliberate action after editing `src/server/db/schema.ts`, not a tax on every dev startup or a place where destructive-change prompts can interrupt launch.

## Invocation

In an empty directory (hidden dotfiles are tolerated):

```text
/create-t3-app
```

…or natural language:

```text
Scaffold a new T3 app here.
Spin up a t3 stack project.
Bootstrap a create-t3-app in this directory.
```

The directory's basename — lowercased, non-alphanumerics replaced with hyphens — becomes the project name. If the directory contains any non-hidden files, the skill stops and asks you to use an empty one.

## Output

While running:

```text
Project scaffolded
Dependencies installed
Post-scaffold fixes applied
PGlite installed
.env configured
Database initialized
Dev server verified
Changes staged
```

(Plus `Node and Git verified` as a first line if either had to be installed.)

Then exactly:

```text
## How to use
- `npm run app` — start the DB daemon and dev server
- `npm run db:push` — apply schema changes after editing src/server/db/schema.ts
- `npm run db:stop` — shut down the DB daemon
```

Each success line is a load-bearing claim — it only prints after the corresponding step has actually succeeded by its own check (artifact existence, exit code where reliable, HTTP probe). If you see the full sequence, the project genuinely works end-to-end.

## Requirements

- macOS or Linux. The PATH-bootstrapping logic targets Homebrew/nvm conventions; Windows is not supported.
- Standard `bash`, `curl`, and `openssl` (present by default on both platforms).
- Either Node and Git already installed, or sudo cached / passwordless so the skill can install Homebrew automatically.

If Node or Git is missing, the skill will install whichever is missing — preferring Homebrew (because it puts both on a stable PATH that subsequent Bash invocations inherit), falling back to `nvm` for Node only if Homebrew isn't available, and bootstrapping Homebrew itself as a last resort. It tells you before installing Homebrew.

## Going to production

The skill's `.env` is intentionally obvious about being dev-only. The DB password is the literal string `changethistemporarypassword` so it can't quietly slip into prod. Before deploying:

- Replace `DATABASE_URL` with your real Postgres connection string.
- If you wire up GitHub OAuth, tighten `BETTER_AUTH_GITHUB_CLIENT_ID/SECRET` back to `z.string()` (drop the `.optional()`) in `src/env.js` so missing credentials fail fast.
- The generated `BETTER_AUTH_SECRET` is unique per scaffold; rotate it for production if you'd rather not reuse the dev value.

## Out of scope

This is a one-shot scaffolder. It does **not**:

- Modify or extend existing T3 projects (no router scaffolding, no migration helpers)
- Set up CI, deployment configs, or hosting
- Configure OAuth providers
- Generate Prisma projects (Drizzle only)
- Support Pages Router or non-TypeScript variants

If you need any of that, build (or have Claude build) a separate skill on top of the scaffold this one produces.

## License

MIT.

# create-t3-app-local

A Claude Code skill that scaffolds a fresh **T3 stack** project with a fully local, self-contained development database — and zero user input required.

## What you get

A working [create-t3-app](https://create.t3.gg/) project pre-configured with:

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **tRPC**
- **Drizzle ORM** (PostgreSQL dialect)
- **better-auth** (with GitHub OAuth env vars made optional so the project boots without provisioning OAuth credentials)
- **ESLint + Prettier**
- **PGlite** running as a local TCP daemon on `localhost:5432`, exposed via the Postgres wire protocol so Drizzle and Next.js talk to it like a regular Postgres server

…plus three convenience scripts:

| Command | What it does |
| --- | --- |
| `npm run app` | Starts the PGlite daemon (if not already running) and the Next.js dev server |
| `npm run db:push` | Applies schema changes after editing `src/server/db/schema.ts` |
| `npm run db:stop` | Shuts down the local PGlite daemon |

## The goal: 100% zero-input, local-only

The whole point of this skill is to take you from an empty directory to a running T3 dev server **without** any of the friction normally involved:

- No prompts to answer — every create-t3-app option is pre-decided.
- No external database to provision — PGlite runs in-process as a daemon.
- No Docker, no `docker-compose up`, no Postgres install.
- No OAuth credentials needed up front — auth env vars are optional in dev.
- No environment file to fill in — `.env` is generated with a fresh `BETTER_AUTH_SECRET` and a hardcoded local DB URL.
- Node and Git are auto-installed via Homebrew if missing.

The skill handles known scaffold pitfalls along the way: it stashes pre-existing dotfiles to avoid the create-t3-app TTY prompt bug, iterates through the better-auth ↔ drizzle peer-dependency conflicts that current versions deterministically hit, fixes the stale table prefix in the generated schema, and broadens the `drizzle.config.ts` `tablesFilter` so introspection sees better-auth's tables.

## Platforms

- **macOS** (Apple Silicon and Intel) — fully supported
- **Linux** — fully supported (uses Homebrew on Linux when available, else nvm fallback for Node)

Windows is not a target — the skill assumes a POSIX shell, `bash`, and the `/dev/tcp` builtin.

## How to use

Run Claude Code in an empty directory and ask:

```
scaffold a new t3 app
```

or invoke the skill directly:

```
/create-t3-app
```

The skill takes no arguments. When it finishes, you'll see a short success report and:

```
## How to use

- `npm run app` — start the DB daemon and dev server
- `npm run db:push` — apply schema changes after editing `src/server/db/schema.ts`
- `npm run db:stop` — shut down the DB daemon
```

All changes are staged in git (the scaffold runs `git init && git add .` early; the skill re-stages after applying its post-scaffold fixes). Commit when ready:

```
git commit -m "initial commit"
```

## What's deliberately deferred

The dev `DATABASE_URL` is hardcoded to:

```
postgresql://postgres:changethistemporarypassword@localhost:5432/postgres
```

The literal `changethistemporarypassword` is intentional — it's an obvious flag in code review and any leaked log, signaling **this credential is fake, the dev DB has no real auth, replace before deploying**. Production credentials are a deploy-time concern, not a scaffold-time one.

GitHub OAuth env vars (`BETTER_AUTH_GITHUB_CLIENT_ID`, `BETTER_AUTH_GITHUB_CLIENT_SECRET`) are left empty. Re-tighten the schema in `src/env.js` once you wire up a real GitHub OAuth app.

## Files in this plugin

```
create-t3-app-local/
├── .claude-plugin/
│   └── plugin.json            # plugin manifest
├── README.md                  # this file
└── skills/
    └── create-t3-app-local/
        └── SKILL.md           # the skill itself — full procedure, edge cases, recovery
```

The full procedure (including every edge case the skill handles internally — dotfile stash, ERESOLVE iterations, port-detection fallback, daemon idempotency) lives in [`skills/create-t3-app-local/SKILL.md`](./skills/create-t3-app-local/SKILL.md).

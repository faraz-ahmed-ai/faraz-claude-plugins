# create-t3-app-local

A Claude Code skill that scaffolds a fresh **T3 stack** project wired to a shared local Postgres with its own isolated database — and zero user input required.

## What you get

A working [create-t3-app](https://create.t3.gg/) project pre-configured with:

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **tRPC**
- **Drizzle ORM** (PostgreSQL dialect)
- **better-auth** (with GitHub OAuth env vars made optional so the project boots without provisioning OAuth credentials)
- **ESLint + Prettier**
- **A per-project Postgres database** (`<slug>_dev`) inside a shared Homebrew `postgresql@16` cluster — auto-started on login via `brew services` (launchd on macOS, systemd-user on Linux). Each project gets its own database and its own least-privilege roles, so projects can't read or corrupt each other's data.
- **A `t3-local-pg` MCP server**, registered with Claude Desktop and Cowork, exposing `query`, `query_write`, `describe`, and `list_projects` tools so Claude can inspect each project's database directly. The current project's slug is auto-pinned in `CLAUDE.md` so any session opened in the repo resolves to the right database without a lookup.

…and the standard create-t3-app scripts. The two you'll use most:

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Next.js dev server (Postgres runs in the background as an OS service — nothing to start) |
| `npm run db:push` | Applies schema changes after editing `src/server/db/schema.ts` |

## The goal: 100% zero-input, local-only

The whole point of this skill is to take you from an empty directory to a running T3 dev server **without** any of the friction normally involved:

- No prompts to answer — every create-t3-app option is pre-decided.
- No Docker, no `docker-compose up`, no manual Postgres install.
- No external database to provision — Postgres runs locally, auto-started by your OS.
- No OAuth credentials needed up front — auth env vars are optional in dev.
- No environment file to fill in — `.env` is generated with a fresh `BETTER_AUTH_SECRET` and a per-project `DATABASE_URL` containing a randomly-generated role password.
- Node, Git, Homebrew, and `postgresql@16` are auto-installed if missing.

The skill handles known scaffold pitfalls along the way: it stashes pre-existing dotfiles to avoid the create-t3-app TTY prompt bug, iterates through the better-auth ↔ drizzle peer-dependency conflicts that current versions deterministically hit, fixes the stale table prefix in the generated schema, and broadens the `drizzle.config.ts` `tablesFilter` so introspection sees better-auth's tables.

It's also fully idempotent: re-running on a machine where everything is already bootstrapped is a no-op for the shared infrastructure (Postgres, MCP server, Claude Desktop config), and re-running in an existing project directory reuses the existing database without rotating credentials.

## Platforms

- **macOS** (Apple Silicon and Intel) — primary target. `brew services` writes a launchd plist so Postgres auto-starts on login.
- **Linux** (Debian/Ubuntu, RHEL/Fedora) — fully supported. The skill installs the Homebrew prerequisites (`build-essential`, `procps`, `curl`, `file`, `git`, `ca-certificates`) via apt or dnf first, then bootstraps Postgres as a systemd-user service. Without systemd (e.g., minimal Docker images), it falls back to manual `pg_ctl start` and warns you that auto-restart on reboot won't happen. For session persistence across logout, run `loginctl enable-linger $(whoami)` once.

Windows isn't supported — use WSL2 with Ubuntu, where the Linux path applies in full.

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

- `npm run dev` — start the dev server (Postgres runs in the background as a system service)
- `npm run db:push` — apply schema changes after editing `src/server/db/schema.ts`
- Database registry: `~/.t3-local-pg/registry.json` (project name → DB connection URLs)
- MCP server: `t3-local-pg` is registered with Claude Desktop / Cowork. Use the `query`, `query_write`, `describe`, and `list_projects` tools to inspect this project's DB. The project name is pinned in `CLAUDE.md` so any Claude session opened here resolves it automatically.
```

All changes are staged in git (the scaffold runs `git init && git add .` early; the skill re-stages after applying its post-scaffold fixes). Commit when ready:

```
git commit -m "initial commit"
```

## Isolation and credentials

Each project gets its own Postgres database and two least-privilege roles inside the shared cluster:

- **`<slug>_app`** — owns the project's database; full CRUD + DDL within it. Used for `npm run dev`, `npm run db:push`, and the MCP `query_write` tool. Cannot connect to other projects' databases (the skill revokes `CONNECT` from `PUBLIC` and grants it only to that project's two roles).
- **`<slug>_ro`** — read-only on the same database. Used by the MCP server's `query` and `describe` tools so a stray model-generated query can't mutate data. The block is enforced at the Postgres permission layer, not by parsing SQL.

Role passwords are generated per project (32 random URL-safe chars) and live in three places, all mode 0600:

- `.env` (the project's `DATABASE_URL`)
- `~/.t3-local-pg/registry.json` (both URLs, plus the project's filesystem path, indexed by slug)
- `~/.t3-local-pg/superuser.env` (the bootstrap superuser connection URL — only used by the skill itself)

The skill never prints these to chat. Production database credentials are deferred to deployment time.

GitHub OAuth env vars (`BETTER_AUTH_GITHUB_CLIENT_ID`, `BETTER_AUTH_GITHUB_CLIENT_SECRET`) are left empty and the schema in `src/env.js` is loosened to make them optional in dev. Re-tighten the schema once you wire up a real GitHub OAuth app.

## Files in this plugin

```
create-t3-app-local/
├── .claude-plugin/
│   └── plugin.json            # plugin manifest (incl. SessionStart hook for MCP deps)
├── .mcp.json                  # MCP server registration (auto-loaded by Claude Desktop / Cowork)
├── README.md                  # this file
├── mcp-server/                # the project-aware MCP server itself
│   ├── package.json
│   └── server.js
└── skills/
    └── create-t3-app-local/
        └── SKILL.md           # the skill itself — full procedure, edge cases, recovery
```

The full procedure (every edge case the skill handles internally — dotfile stash, ERESOLVE iterations, port-detection fallback, registry collision suffixing, idempotent re-runs) lives in [`skills/create-t3-app-local/SKILL.md`](./skills/create-t3-app-local/SKILL.md).

The MCP server is shipped as part of the plugin and registered via [`.mcp.json`](./.mcp.json) — when the plugin is installed, Claude Desktop / Cowork loads it from `${CLAUDE_PLUGIN_ROOT}/mcp-server/server.js` automatically. Runtime dependencies install on first session start via the plugin manifest's `SessionStart` hook. See [`mcp-server/server.js`](./mcp-server/server.js) for the tool implementations.

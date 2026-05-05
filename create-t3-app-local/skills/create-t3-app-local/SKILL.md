---
name: create-t3-app-local
description: Scaffold a fresh T3 stack project (Next.js App Router + TypeScript + Tailwind + tRPC + Drizzle + better-auth) wired to a shared local Postgres (Homebrew postgresql@16, auto-started by the OS service manager) with a per-project isolated database. Each scaffolded project is registered with the plugin's t3-local-pg MCP server (loaded automatically by Claude Desktop and Cowork via the plugin manifest) so Claude can query its database. Works on macOS and Linux. Takes no arguments — fully ready to go. Trigger this whenever the user asks to set up, scaffold, bootstrap, or initialize a new T3 app, T3 stack, or create-t3-app project — including phrasings like "start a new t3 project", "spin up a t3 stack", or "/create-t3-app".
---

# create-t3-app-local

Scaffolds a T3 app in the current directory, applies a curated set of fixes, and provisions an isolated database inside a shared local Postgres instance. The Postgres server is installed once per machine via Homebrew, runs as a launchd (macOS) or systemd-user (Linux) service so it auto-starts on login, and is shared across every T3 app installed by this skill. Each project gets its own database and its own least-privilege roles, so projects cannot read or corrupt each other's data. Production database and credentials are deferred to deployment time.

**Platform support.** macOS (Apple Silicon and Intel) is the primary target. Linux (Debian/Ubuntu, RHEL/Fedora) is fully supported with platform-specific branches in Step 1 (apt/dnf prerequisites for the Homebrew installer) and Step 2 (manual `pg_ctl` fallback when systemd is unavailable, e.g., inside Docker). Windows is not supported — use WSL2 (Ubuntu) where the Linux path applies.

## No arguments

The skill takes no arguments. The dev `DATABASE_URL` is generated per-project — a database named `<project>_dev`, an app role `<project>_app` with a freshly-generated random password, and a read-only role `<project>_ro` for tools that should not mutate data. The full URL is written to `.env` and registered in `~/.t3-local-pg/registry.json` so the MCP server can find it.

## Output style

During execution, the only chat output is **one short success line per component** as it lands. Use exactly these phrasings, in this order, and only print a line *after* the corresponding step has actually succeeded:

- `Node and Git verified` (skip entirely if Node, Git, and Homebrew were all already present before the skill ran — only print if Step 1 actually had to install something)
- `Postgres bootstrapped` (skip entirely if postgresql@16 was already installed, the service was already running, the registry already existed, the MCP server was already installed at the current version, and Claude Desktop config already had the entry — only print if Step 2 actually had to install or configure something)
- `Project scaffolded`
- `Dependencies installed`
- `Post-scaffold fixes applied`
- `Database provisioned`
- `.env configured`
- `Schema pushed`
- `Dev server verified`
- `Changes staged`

Then print the "## How to use" block from Step 9. Nothing else.

**Do not** narrate intermediate progress, echo tool results, paste scaffold/install logs, comment on ERESOLVE iterations, list each post-scaffold edit, or summarize the stack. Internal recovery (dotfile stash, ERESOLVE peer bumps, port-detection fallback, registry conflict suffixing, Claude Desktop config patching, marker-file recovery) is invisible — these are expected paths, not events to report. The user does not need to see `npm install` output, `git status`, `find` output, or any "Now running…" preamble.

**Unexpected errors are the exception** — and the only exception. If something fails outside the documented expected paths (a third ERESOLVE iteration involving an unrelated package, scaffold artifacts missing after Step 4, postgres refusing to accept connections after start, HTTP probe returning non-200, etc.), stop and surface the actual error verbatim. Do not continue past the failure and do not claim success. "Expected" means a path explicitly described in the relevant step; everything else is unexpected.

**Never log secrets to chat output.** Per-project role passwords, the bootstrap superuser URL, and `BETTER_AUTH_SECRET` must not appear in any success line, error message, or summary the user sees. They live only in `~/.t3-local-pg/superuser.env` (mode 0600), `~/.t3-local-pg/registry.json` (mode 0600), and the project's `.env`.

## Procedure

Execute the steps below in order. If any step fails outside its documented expected paths, surface the actual error and stop — do not claim success.

### 1. Ensure Node, Git, and Homebrew are installed

All three are required. Node provides `npx` for the scaffold and `npm` for dependency install; Git is needed because the scaffold runs `git init && git add .` as part of setup (see Step 4); Homebrew is needed for `postgresql@16` and for `brew services` (the launchd integration that makes Postgres auto-start on login).

Check all three:

```bash
command -v node >/dev/null 2>&1 && echo "node ok" || echo "node MISSING"
command -v git  >/dev/null 2>&1 && echo "git ok"  || echo "git MISSING"
command -v brew >/dev/null 2>&1 && echo "brew ok" || echo "brew MISSING"
```

If all three are present, skip ahead. Otherwise install whichever is missing — Homebrew first (if missing), then `brew install` whichever of Node and Git remain.

**a. If Homebrew is missing, install it.**

Tell the user explicitly what's about to happen before running the installer, e.g.:

> Homebrew isn't installed. Installing it now via the official script from brew.sh in non-interactive mode. This requires your sudo password to be already cached or passwordless — if it errors with a sudo prompt, run `sudo -v` first and re-invoke this skill.

**On Linux, install the Homebrew installer's prerequisites first.** The Homebrew installer aborts with `You must install Git before installing Homebrew` if `git` isn't on PATH — and the installer itself uses `git`, `curl`, `file`, `procps`, and a working C toolchain to clone the formula repository and build dependencies. macOS ships these via the Xcode Command Line Tools (and a `git` stub at `/usr/bin/git` that triggers the CLT installer dialog the first time it's invoked); Linux does not. Detect the platform and install via the system package manager:

```bash
if [ "$(uname -s)" = "Linux" ]; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq build-essential procps curl file git ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y --quiet @"Development Tools" procps-ng curl file git ca-certificates
  else
    echo "Unsupported Linux distribution — install build-essential/procps/curl/file/git/ca-certificates manually before re-running"
    exit 1
  fi
fi
```

Don't run this branch on macOS — `apt-get`/`dnf` aren't there, and the macOS Git stub already satisfies the installer's git check.

Then run with `NONINTERACTIVE=1`:

```bash
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

The URL is the official command from https://brew.sh — use it verbatim, don't substitute a different source. Pipe-curl-to-bash is a real risk vector, so the skill is explicit about which URL it's running.

`NONINTERACTIVE=1` is required because Claude's Bash tool (and `docker exec`, CI, SSH-without-tty) doesn't have a TTY for the installer's "Press RETURN" prompt — without this var the install hangs forever. The trade-off: NONINTERACTIVE mode requires sudo to be cached or passwordless. On a fresh Mac account where neither is true, the install fails with a sudo error; the user fixes it by running `sudo -v` once and re-invoking the skill.

After the installer finishes, two things need to happen: PATH must work for the *current* shell, and PATH must work for *subsequent* shell invocations within this skill run (each Bash tool call is a fresh non-login non-interactive shell that doesn't source `.bashrc`).

For the current shell — find brew at the right path and source it:

```bash
for p in /opt/homebrew/bin/brew /usr/local/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
  [ -x "$p" ] && eval "$($p shellenv)" && BREW_BIN="$p" && break
done
```

For subsequent shells — write the eval into shell init files:

```bash
SHELLENV_LINE="eval \"\$($BREW_BIN shellenv)\""
for f in ~/.profile ~/.bashrc ~/.zprofile ~/.zshrc ~/.bash_profile; do
  touch "$f"
  grep -qF "$SHELLENV_LINE" "$f" || echo "$SHELLENV_LINE" >> "$f"
done
```

**Critical: subsequent skill steps must re-source brew.** Steps 2+ each run via Claude's Bash tool, which spawns a fresh non-login non-interactive shell — `.bashrc`/`.profile` are NOT sourced by default. Either prepend the `for p in ...; eval "$($p shellenv)"` snippet above to every subsequent Bash command that uses `brew`, or invoke them as `bash -lc 'cmd...'` (login shell) so `.profile` is sourced. The first option is more reliable across environments.

**b. Install whichever of Node and Git are still missing.**

```bash
MISSING=""
command -v node >/dev/null 2>&1 || MISSING="$MISSING node"
command -v git  >/dev/null 2>&1 || MISSING="$MISSING git"
MISSING=$(echo "$MISSING" | xargs)
[ -n "$MISSING" ] && brew install $MISSING
```

`brew install` is idempotent for already-installed formulae — it'll skip Node if the user has it via nvm/asdf and only the brew-formula check failed. Run it only when the corresponding `command -v` reported missing.

**c. Verify**

After whichever path was taken, confirm all four binaries are on PATH and surface the versions:

```bash
node --version
npm --version
git --version
brew --version
```

If any verification fails, stop and surface the actual error rather than continuing into a scaffold that won't work.

**Note on macOS Git:** macOS may ship a Git stub at `/usr/bin/git` that triggers an Xcode Command Line Tools installer dialog when first invoked. `command -v git` returns true for the stub even before CLT is installed. The Homebrew-installed Git takes precedence on PATH and avoids the CLT dialog entirely.

### 2. Bootstrap the shared local Postgres (idempotent)

This step ensures the machine has:
- `postgresql@16` installed via Homebrew
- The Postgres service running and registered with the OS service manager (launchd on macOS, systemd-user on Linux) so it auto-starts on login
- A registry directory at `~/.t3-local-pg/` for the per-project DB credentials read by the MCP server

The MCP server itself ships with the plugin and is registered with Claude Desktop / Cowork via the plugin's `.mcp.json` manifest — this skill does **not** install the MCP server or edit any Claude Desktop config. A `SessionStart` hook in `plugin.json` lazily installs the MCP server's runtime dependencies into `${CLAUDE_PLUGIN_DATA}/node_modules` the first time a session loads the plugin (and after every plugin version bump).

Every substep self-checks; running this step on a machine where everything is already configured is a no-op (and the `Postgres bootstrapped` line is suppressed in that case — see Output style).

**a. Install postgresql@16 if not already present.**

```bash
if ! brew list --formula postgresql@16 >/dev/null 2>&1; then
  brew install postgresql@16
  BOOTSTRAP_CHANGED=1
fi
```

**b. Put `postgresql@16` binaries on PATH.**

`postgresql@16` is keg-only: brew does not symlink its binaries into `/opt/homebrew/bin`. Resolve the prefix and prepend its `bin` to PATH for the current shell:

```bash
PG_PREFIX=$(brew --prefix postgresql@16)
export PATH="$PG_PREFIX/bin:$PATH"
```

For subsequent shells in this skill run, prepend this same line to each Bash command that uses `psql`/`pg_isready`/`pg_ctl`/`initdb`. Do NOT write it into shell init files — keg-only formulae shouldn't pollute global PATH unless the user opts in.

**c. Initialize the data directory if needed (Linux only — macOS does this during install).**

`brew install postgresql@16` on macOS runs `initdb` as part of its post-install hooks. On Linux the install only places files; `initdb` is deferred to whenever a service manager would start the cluster. If we're on Linux and the data directory exists but isn't initialized, run `initdb` now:

```bash
PG_DATA="$(brew --prefix postgresql@16)/var/postgresql@16"

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  # Use C.UTF-8 instead of en_US.UTF-8 because en_US.UTF-8 is not pre-generated
  # on minimal Linux installs (Docker, fresh server installs); C.UTF-8 is universal.
  initdb -U "$(whoami)" -E UTF-8 --locale=C.UTF-8 -D "$PG_DATA"
  BOOTSTRAP_CHANGED=1
fi
```

If the directory doesn't exist at all (the parent `var/` does after install), `initdb` creates it. The `PG_VERSION` marker file is the canonical "is this initialized?" check — Postgres writes it as the very last step of `initdb`, so its presence guarantees a complete cluster.

**d. Start Postgres and configure auto-start on login.**

The strategy is: `brew services` for OS-managed persistence (launchd on macOS, systemd-user on Linux), with a manual `pg_ctl` fallback for systems without a usable service manager (Docker without systemd, minimal containers, etc.).

```bash
OS=$(uname -s)
SERVICE_OK=0

if brew services list 2>/dev/null | awk '$1=="postgresql@16" {print $2}' | grep -qx 'started'; then
  SERVICE_OK=1
elif brew services start postgresql@16 2>&1 | grep -qE '(Successfully started|already started)'; then
  SERVICE_OK=1
  BOOTSTRAP_CHANGED=1
fi

if [ "$SERVICE_OK" -ne 1 ]; then
  # No usable service manager (typically Linux without systemd, e.g., Docker).
  # Fall back to direct pg_ctl. Postgres will run for this session but won't
  # auto-restart on reboot — surface that limitation to the user in the report.
  if ! pg_ctl -D "$PG_DATA" status >/dev/null 2>&1; then
    pg_ctl -D "$PG_DATA" -l "$PG_DATA/server.log" start
    BOOTSTRAP_CHANGED=1
    SERVICE_PERSISTENCE_WARNING=1
  fi
fi
```

**On macOS**, `brew services start postgresql@16` writes `~/Library/LaunchAgents/homebrew.mxcl.postgresql@16.plist` (with `RunAtLoad=true`, `KeepAlive=true`) so the service auto-starts on every login.

**On Linux with systemd**, the same command writes a user unit at `~/.config/systemd/user/homebrew.postgresql@16.service` and enables it via `systemctl --user`. The user must have lingering enabled (`loginctl enable-linger $(whoami)`) for the service to start without an active login session — `brew services` does not do this automatically. If the user wants on-boot persistence (not just on-login), surface this as a one-time setup note in the final report.

**On Linux without systemd** (Docker, minimal containers, very old distros), `brew services` errors with *"postgresql@16 provides a service which can only be used on macOS or systemd!"* — caught by the `SERVICE_OK -ne 1` branch above. The fallback runs `pg_ctl start` directly; the cluster runs for this session but does NOT auto-start on reboot. Set `SERVICE_PERSISTENCE_WARNING=1` so Step 9's report tells the user.

**e. Wait for Postgres to accept connections.**

The first start after install needs a few seconds to open the socket. Poll with `pg_isready`:

```bash
for i in $(seq 1 60); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
pg_isready -h 127.0.0.1 -p 5432 || { echo "Postgres failed to accept connections within 30s"; exit 1; }
```

**f. Set up the registry directory.**

```bash
mkdir -p ~/.t3-local-pg
chmod 700 ~/.t3-local-pg

if [ ! -f ~/.t3-local-pg/registry.json ]; then
  echo '{}' > ~/.t3-local-pg/registry.json
  chmod 600 ~/.t3-local-pg/registry.json
  BOOTSTRAP_CHANGED=1
fi

if [ ! -f ~/.t3-local-pg/superuser.env ]; then
  cat > ~/.t3-local-pg/superuser.env <<EOF
SUPERUSER_URL=postgresql://$(whoami)@127.0.0.1:5432/postgres
EOF
  chmod 600 ~/.t3-local-pg/superuser.env
  BOOTSTRAP_CHANGED=1
fi
```

**Use `$(whoami)`, not `$USER`.** `$USER` is a shell convention populated by login shells (via `/etc/profile`, `~/.profile`, etc.). In a non-login shell — which is what `docker exec`, `bash -c '...'`, many CI runners, and Claude's Bash tool give you — `$USER` is empty. The resulting URL becomes `postgresql://@127.0.0.1:5432/postgres`, which psql later misparses (the role-name field eats the rest of the URL). `$(whoami)` reads the actual UID and works in every shell. Apply this rule everywhere this skill composes a Postgres connection string.

**Why no password on the superuser:** Homebrew's postgresql@16 runs `initdb` with the current OS user as the cluster superuser, and the default `pg_hba.conf` it ships uses `trust` auth on local connections from `127.0.0.1` (verified on Homebrew on both macOS and Linux). That's safe-by-default for a single-user dev machine because the listener is bound to localhost and requires shell-level access to reach. The bootstrap superuser URL is captured in `superuser.env` (mode 0600) and only used by Step 7's `psql` calls — never exposed to apps, Drizzle, or the MCP server.

If you tighten this for a multi-user machine, replace the local-trust line in `$PG_DATA/pg_hba.conf` with `scram-sha-256` and store the password in `superuser.env`. The skill does not do this automatically because it would prompt for a password the user hasn't set yet.

**g. Decide whether to print `Postgres bootstrapped`.**

If `BOOTSTRAP_CHANGED=1` was ever set during substeps (a)–(f), print the success line. Otherwise stay silent — the bootstrap was a no-op, the user shouldn't see a line implying work was done.

**Why this whole step is idempotent and re-runs safely:** Each substep is a check-then-act. Re-invoking the skill on a fully-set-up machine touches nothing: brew sees postgresql@16 installed, the data dir is initialized, the service is started (or the manual `pg_ctl` is still running), the registry dir exists with proper modes. Only when something is genuinely missing does work happen.

**One-time cleanup of the legacy install location.** Earlier versions of this skill copied the MCP server to `~/.t3-local-pg/mcp/` and patched `claude_desktop_config.json` directly. Both are obsolete now (the plugin manifest handles registration, and Claude Desktop overwrote the JSON edits anyway). If `~/.t3-local-pg/mcp/` exists from a prior run, remove it silently:

```bash
[ -d ~/.t3-local-pg/mcp ] && rm -rf ~/.t3-local-pg/mcp
```

Don't print anything for this — it's invisible cleanup, not a reportable event.

### 3. Determine project name

Use the current working directory's basename, lowercased, with non-alphanumeric characters replaced by hyphens. Example: `MyApp Project` → `myapp-project`. This name is used both as the create-t3-app project name and as the table prefix in the Drizzle schema.

If the current directory contains any non-hidden files, stop and tell the user to run this in an empty directory. Hidden dotfiles (`.git`, `.claude`, `.env.local`, etc.) are tolerated — Step 4 stashes them before scaffolding and restores them afterward.

For Postgres identifiers, replace hyphens with underscores when forming the slug used for database name and role names: `myapp-project` → DB `myapp_project_dev`, app role `myapp_project_app`, ro role `myapp_project_ro`. Postgres allows hyphens only inside double-quoted identifiers, and that quoting friction propagates through every subsequent SQL touch — easier to underscore once at the boundary.

### 4. Scaffold (depends on Steps 1–3)

create-t3-app treats any dotfile in the target directory as a "conflicting file" and shows an interactive **"Continue installation and overwrite conflicting files?"** prompt. The `--CI` flag does **not** suppress this prompt. On Node 25+ the prompt fails to render at all and surfaces as `SystemError [ERR_TTY_INIT_FAILED]: TTY initialization failed: uv_tty_init returned EINVAL`; on older Node it just hangs forever waiting for input that won't come.

The fix is to move all dotfiles aside, run the scaffold against a truly empty directory, then restore. **All three phases (stash → scaffold → restore) must run inside a single Bash tool invocation.** Two reasons:

1. **The agent harness rewrites dotfiles between tool calls.** Claude Code regenerates `.claude/settings.local.json` to persist session state, and similar harnesses do equivalent things. If you stash in one Bash call and scaffold in the next, the harness can recreate `.claude/` in the gap; the scaffold then sees a "conflicting" dotfile and aborts with the TTY error. Keeping the stash + scaffold + restore in one shell session closes that window.
2. **No marker file is needed.** With everything in one bash script, the stash path lives in a shell variable. **Do not write a marker file like `.t3-stash-path` inside the project root** — it's itself a dotfile and triggers the exact TTY error this whole dance is meant to avoid.

The flag mapping for create-t3-app's prompts (do not deviate — these are the project's chosen settings):

| Prompt | Answer | Flag |
| --- | --- | --- |
| TypeScript | Yes | (always on, no flag) |
| Tailwind CSS | Yes | `--tailwind` |
| tRPC | Yes | `--trpc` |
| Auth provider | BetterAuth | `--betterAuth` |
| ORM | Drizzle | `--drizzle` |
| Next.js App Router | Yes | `--appRouter` |
| Database provider | PostgreSQL | `--dbProvider postgres` |
| Linting/formatting | ESLint + Prettier | `--eslint` |
| Initialize Git | Yes | (no flag — `git init && git add .` is the default; passing `--noGit` would skip it) |
| Run `npm install` | Yes | `--noInstall` (skill runs install itself in Step 5 — see note) |
| Import alias | default `~/` | (no flag — `~/` is the default; passing `--import-alias "~/"` triggers a `TypeError: i.replace is not a function` post-scaffold bug in current create-t3-app versions) |

`--dbProvider` defaults to `sqlite`, so the postgres flag is mandatory — easy to overlook. Several feature flags (`--tailwind`, `--betterAuth`, etc.) are documented as "experimental" in the create-t3-app help and **must** be paired with `--CI`.

Run the entire stash → scaffold → restore as one Bash tool call:

```bash
set -e
STASH=$(mktemp -d "${TMPDIR:-/tmp}/t3-stash.XXXXXX")
echo "Stashing dotfiles to $STASH"
find . -mindepth 1 -maxdepth 1 -name '.*' -print0 | xargs -0 -I{} mv {} "$STASH/"

# Sanity check: directory must be empty before scaffold (including dotfiles).
if [ -n "$(find . -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "ERROR: project dir not empty after stash — aborting"
  ls -la
  exit 1
fi

npx -y create-t3-app@latest . \
  --CI \
  --tailwind \
  --trpc \
  --betterAuth \
  --drizzle \
  --appRouter \
  --dbProvider postgres \
  --eslint \
  --noInstall

# Verify scaffold by artifacts, not exit code.
for f in package.json src drizzle.config.ts; do
  if [ ! -e "$f" ]; then
    echo "ERROR: scaffold did not produce $f"
    exit 1
  fi
done

# Restore stashed dotfiles. User dotfiles take precedence over any same-name
# dotfile the scaffold generated.
find "$STASH" -mindepth 1 -maxdepth 1 -print0 | while IFS= read -r -d '' src; do
  base=$(basename "$src")
  [ -e "./$base" ] && rm -rf "./$base"
  mv "$src" .
done
rmdir "$STASH"
echo "Scaffold complete"
```

**Note on `--noInstall`:** the user-facing setting is "Yes, run npm install." That's about intent — the user wants dependencies installed by the time the skill finishes. We satisfy that intent in Step 5 by running install ourselves, with `--noInstall` here so we control when install happens. The better-auth + drizzle peer conflict (see Step 5) is currently deterministic on fresh scaffolds; letting create-t3-app's bundled install run would mean a guaranteed `ERESOLVE` failure and a partial node_modules state.

**Note on `--import-alias`:** intentionally omitted. `~/` is already the default, AND passing `--import-alias "~/"` (verbatim default) triggers `TypeError: i.replace is not a function` after the boilerplating phase in current create-t3-app versions.

**Verify scaffold by artifacts, not exit code.** create-t3-app may exit non-zero for cosmetic post-scaffold errors. The script above checks for `package.json`, `src/`, and `drizzle.config.ts` instead.

**Special case — preexisting `.git`:** if the user already had a `.git` directory, the stash preserves their git history but **overwrites** the fresh `.git` that create-t3-app produced. Their existing index and refs are untouched, which means the scaffold's `git add .` doesn't propagate to the user's repo. Step 8d's `git add .` handles this case uniformly.

If the bash script aborts mid-flight, the user's stashed dotfiles are still in `$TMPDIR/t3-stash.*`. Find the leftover with `ls -d ${TMPDIR:-/tmp}/t3-stash.*` and move its contents back into the project root manually before re-running.

### 5. Install — patch first if needed

Run `npm install`. If it succeeds on the first try, move to Step 6.

If it fails with `ERESOLVE`, read the error carefully and bump **only the packages the error explicitly names** in its "Could not resolve dependency" / "Conflicting peer dependency" lines. Do not preemptively bump packages the error doesn't mention.

**ERESOLVE iterates.** npm reports one conflict at a time. Verified empirically on a fresh scaffold:

1. First install fails: error names only `drizzle-kit` (better-auth peer wants `>=0.31.4`, template pins `^0.30.5`). Bump `drizzle-kit` to `^0.31.4`.
2. Second install fails: error now names `drizzle-orm` (the better-auth-drizzle-adapter peer wants `^0.45.2`, template pins `^0.41.0`). Bump `drizzle-orm` to `^0.45.2`.
3. Third install succeeds.

Expect **up to two bump iterations** for the current better-auth/drizzle peer landscape. If you see a fourth iteration, or an `ERESOLVE` involving packages outside this drizzle/better-auth family, stop and report it — don't reach for `--legacy-peer-deps`.

### 6. Apply post-scaffold fixes

These three edits make the generated project usable without further manual steps. Apply all three.

**a. Make GitHub OAuth env vars optional** — `src/env.js`

Change:
```js
BETTER_AUTH_GITHUB_CLIENT_ID: z.string(),
BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string(),
```
To:
```js
BETTER_AUTH_GITHUB_CLIENT_ID: z.string().optional(),
BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
```

Why: the env schema validates on import, including from `drizzle.config.ts`. Without this, `npm run db:push` fails before touching the database because the user hasn't set up a GitHub OAuth app yet.

**b. Fix the table prefix** — `src/server/db/schema.ts`

Replace the default scaffold prefix with the project name from Step 3 (use the underscore form, since the prefix becomes part of Postgres table names):

```js
export const createTable = pgTableCreator((name) => `<project_underscore_slug>_${name}`);
```

Why: the pgTableCreator prefix and the drizzle-kit `tablesFilter` must agree, otherwise drizzle-kit can't see the tables it owns and tries to recreate them on every push.

**c. Filter introspection** — `drizzle.config.ts`

Add `schemaFilter` and broaden `tablesFilter` to include better-auth's bare table names:

```ts
export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: env.DATABASE_URL },
  schemaFilter: ["public"],
  tablesFilter: [
    "<project_underscore_slug>_*",
    "user",
    "session",
    "account",
    "verification",
  ],
} satisfies Config;
```

Why: better-auth's tables (`user`, `session`, `account`, `verification`) are defined in `schema.ts` *without* the project prefix because better-auth expects those exact names. If `tablesFilter` only matches the prefix, drizzle-kit's introspection skips the auth tables and tries to `CREATE TABLE` them again — which fails on the second push.

**d. Update `.gitignore`**

Append `.env` if not already there. The scaffold's `.gitignore` typically already has it, but verify and append if missing. Use the trailing-newline-safe approach:

```bash
if ! grep -qxF ".env" .gitignore 2>/dev/null; then
  [ -s .gitignore ] && [ -n "$(tail -c 1 .gitignore)" ] && printf '\n' >> .gitignore
  printf '.env\n' >> .gitignore
fi
```

Why `[ -n "$(tail -c 1 .gitignore)" ]`: command substitution strips trailing newlines, so the value is empty exactly when the file already ends with `\n`. Empty → no extra newline needed; non-empty → newline needed before append.

There is no PGlite data directory to ignore — the database lives in the shared Postgres cluster's data dir, not in the project.

### 7. Provision the project's database and write `.env`

This step runs SQL against the shared Postgres to create an isolated database and two roles for this project, then writes the resulting connection URL into `.env` and registers it with the MCP server.

**a. Look up or compute the project's database identity.**

```bash
SLUG_HYPHEN="<from Step 3>"        # e.g. myapp-project
SLUG_UNDERSCORE="${SLUG_HYPHEN//-/_}"  # e.g. myapp_project
PROJECT_PATH=$(pwd)
```

Read `~/.t3-local-pg/registry.json` and decide which name to use:

```bash
node <<NODESCRIPT
const fs = require("fs");
const path = require("path");
const reg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".t3-local-pg/registry.json"), "utf8"));
const baseSlug = "$SLUG_UNDERSCORE";
const projectPath = "$PROJECT_PATH";

// Re-running the skill in the same project dir → reuse existing entry.
const existing = Object.entries(reg).find(([_, v]) => v.path === projectPath);
if (existing) {
  console.log("REUSE_SLUG=" + existing[0]);
  process.exit(0);
}

// Different project at the same slug → suffix until free.
let slug = baseSlug;
let n = 2;
while (reg[slug]) {
  slug = baseSlug + "_" + n;
  n++;
}
console.log("NEW_SLUG=" + slug);
NODESCRIPT
```

Capture the output. If it's `REUSE_SLUG=<x>`, use `<x>` and skip role/DB creation in (b)–(c) — go straight to (d) to refresh `.env` from the registry. If it's `NEW_SLUG=<x>`, use `<x>` and continue.

**b. Generate per-project credentials.**

URL-safe random passwords (no `/`, `+`, `=`):

```bash
APP_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
RO_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
DB_NAME="${SLUG}_dev"
APP_ROLE="${SLUG}_app"
RO_ROLE="${SLUG}_ro"
```

Do not echo these to chat output. They live only in the registry and `.env`.

**c. Create the database and roles.**

Source the bootstrap superuser URL and run the provisioning SQL. Two psql connections: one to the `postgres` admin DB to `CREATE ROLE`/`CREATE DATABASE`, and one to the new project DB to set schema-level grants.

```bash
. ~/.t3-local-pg/superuser.env

psql "$SUPERUSER_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE "$APP_ROLE" WITH LOGIN PASSWORD '$APP_PASSWORD';
CREATE ROLE "$RO_ROLE"  WITH LOGIN PASSWORD '$RO_PASSWORD';
CREATE DATABASE "$DB_NAME" OWNER "$APP_ROLE";
REVOKE CONNECT ON DATABASE "$DB_NAME" FROM PUBLIC;
GRANT  CONNECT ON DATABASE "$DB_NAME" TO "$APP_ROLE", "$RO_ROLE";
SQL

psql "postgresql://$(whoami)@127.0.0.1:5432/$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
GRANT USAGE ON SCHEMA public TO "$RO_ROLE";
ALTER DEFAULT PRIVILEGES FOR ROLE "$APP_ROLE" IN SCHEMA public
  GRANT SELECT ON TABLES TO "$RO_ROLE";
ALTER DEFAULT PRIVILEGES FOR ROLE "$APP_ROLE" IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO "$RO_ROLE";
SQL
```

Why both `SELECT ON TABLES` and `SELECT ON SEQUENCES`: Drizzle uses serial/identity columns that depend on sequences. Without sequence read access, `SELECT currval(...)`-style queries fail for the read-only role.

**Failure modes to recognize as expected:**

- If `psql` reports `role "<x>_app" already exists`, the previous run partially succeeded. Drop both roles + DB and retry:
  ```bash
  psql "$SUPERUSER_URL" -v ON_ERROR_STOP=1 <<SQL
  DROP DATABASE IF EXISTS "$DB_NAME";
  DROP ROLE IF EXISTS "$APP_ROLE";
  DROP ROLE IF EXISTS "$RO_ROLE";
  SQL
  ```
  Then re-run the create block. This is safe because the only thing that previous run produced was empty roles/DB.

- If `psql` reports `database "<x>_dev" already exists` but not the role error, a different project earlier claimed this name. Step 7a should have suffixed already; this means the registry is out of sync with the cluster. Stop and surface — manual cleanup needed.

**d. Update `.env`.**

```bash
SECRET=$(openssl rand -base64 32)
DATABASE_URL="postgresql://${APP_ROLE}:${APP_PASSWORD}@127.0.0.1:5432/${DB_NAME}"

cat > .env <<EOF
BETTER_AUTH_SECRET="$SECRET"
BETTER_AUTH_GITHUB_CLIENT_ID=""
BETTER_AUTH_GITHUB_CLIENT_SECRET=""
DATABASE_URL="$DATABASE_URL"
EOF
chmod 600 .env
```

Do not log `DATABASE_URL` or `BETTER_AUTH_SECRET` to chat output.

If the project was a `REUSE_SLUG` case, regenerate `.env` from the existing registry entry instead — do not rotate the password.

```bash
# REUSE_SLUG path
node <<NODESCRIPT > /tmp/.t3-env-rebuild
const fs = require("fs");
const path = require("path");
const reg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".t3-local-pg/registry.json"), "utf8"));
const e = reg["$SLUG"];
console.log(\`DATABASE_URL=\${e.url}\`);
NODESCRIPT
```

**e. Register with the MCP server.**

Atomically write the new entry into `~/.t3-local-pg/registry.json` (write to a `.tmp` file, then rename):

```bash
RO_URL="postgresql://${RO_ROLE}:${RO_PASSWORD}@127.0.0.1:5432/${DB_NAME}"

node <<NODESCRIPT
const fs = require("fs");
const path = require("path");
const regPath = path.join(process.env.HOME, ".t3-local-pg/registry.json");
const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
reg["$SLUG"] = {
  db: "$DB_NAME",
  url: "$DATABASE_URL",
  ro_url: "$RO_URL",
  path: "$PROJECT_PATH",
  registered_at: new Date().toISOString(),
};
const tmp = regPath + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(reg, null, 2) + "\n");
fs.chmodSync(tmp, 0o600);
fs.renameSync(tmp, regPath);
NODESCRIPT
```

After this step the MCP server's next call (Claude Desktop / Cowork) will see the new project — the server reads the registry on every tool invocation.

**f. Pin the project name in `CLAUDE.md` and route data questions through the MCP server.**

The MCP server requires an explicit `project` argument on every tool call — it does not infer the project from the working directory. Pinning the slug in `CLAUDE.md` lets any Claude session opened in this repo resolve the right project name automatically, without a preliminary `list_projects` lookup and without ambiguity when more than one T3 app is registered. The same section also carries explicit guidance that any data-shaped question (row values, counts, schema lookups) must go through the MCP tools rather than through code-reading or shell `psql` calls — the host's Postgres on `127.0.0.1:5432` is not reachable from sandboxed bash environments (Cowork, Claude Code), so the MCP server is the only path.

```bash
CLAUDE_MD="CLAUDE.md"
PIN_MARKER="## Local database (t3-local-pg)"

if ! { [ -f "$CLAUDE_MD" ] && grep -qF "$PIN_MARKER" "$CLAUDE_MD"; }; then
  # Ensure existing file ends with a blank-line separator before appending.
  if [ -f "$CLAUDE_MD" ] && [ -s "$CLAUDE_MD" ]; then
    [ -n "$(tail -c 1 "$CLAUDE_MD")" ] && printf '\n' >> "$CLAUDE_MD"
    printf '\n' >> "$CLAUDE_MD"
  fi
  cat >> "$CLAUDE_MD" <<EOF
$PIN_MARKER

This project is registered with the \`t3-local-pg\` MCP server as **\`$SLUG\`**. Pass this name as the \`project\` argument when calling \`query\`, \`query_write\`, \`describe\`, or \`list_projects\`.

**When to use the MCP server.** Any natural-language question about the project's *data* — what's in a table, what value a row has, how many records match a condition, what the schema looks like — must be answered by calling a \`t3-local-pg\` MCP tool, not by reading source code, guessing from \`schema.ts\`, or asking the user to run SQL themselves. Concretely:

- "What's the value of X?" / "What rows match Y?" / "How many Zs are there?" → \`query\` (read-only).
- "What tables exist?" / "What columns does table X have?" → \`describe\`.
- "What projects are registered?" → \`list_projects\`.
- "Insert / update / delete this record" — only when the user has clearly asked for a mutation → \`query_write\`.

The Postgres server runs on \`127.0.0.1:5432\` on the host machine and is **not reachable from any sandboxed bash environment** (Cowork's bash, Claude Code's sandbox, etc.). The MCP server is the only path. Do not try to work around it with \`psql\` shell calls, network requests, or by inferring values from the codebase — call the tool.
EOF
fi
```

The `grep -qF` check makes this idempotent: re-running the skill on a project that already has the section leaves `CLAUDE.md` untouched. If the user manually rewrote the section with a different slug or edited the guidance (unusual — would only happen if they hand-edited the registry too), the skill respects their edit and does not overwrite it.

The new file (or appended section) is picked up by Step 8d's `git add .` along with everything else, so the pin lands in the same staged tree as the rest of the scaffold.

### 8. Verify the stack

Three things to verify, in order. The first scaffold needs an explicit one-time `db:push` to create the schema; after that, the user runs push themselves whenever they edit the schema.

**a. Push the schema.**

```bash
npm run db:push
```

Expect `[✓] Changes applied`. Drizzle reads `DATABASE_URL` from `.env` and connects to the per-project DB created in Step 7. There is no daemon to start — the shared Postgres has been running since login.

If db:push fails with a permission error, the role grants from Step 7c didn't land. Check that the `<slug>_app` role owns the DB by running `psql "$SUPERUSER_URL" -c "\l <DB_NAME>"`.

**b. Run the dev server and probe HTTP.**

```bash
npm run dev
```

Run as a background process so its output is captured to a file you can read.

Expect in the log:
- `✓ Ready in <ms>` from Next.js

After Next reports ready, **parse the actual port from the launch output** rather than assuming `3000`. If something is on `:3000`, Next falls back to `:3001`/`:3002`/etc.

```bash
PORT=$(grep -oE 'http://localhost:[0-9]+' "$LAUNCH_LOG" | head -1 | grep -oE '[0-9]+$')
[ -z "$PORT" ] && { echo "Could not detect dev server port — see $LAUNCH_LOG"; exit 1; }
curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 30 "http://localhost:$PORT/"
```

Expect HTTP 200. Use a generous timeout (~30s) — Next's first request triggers route compilation, which can take 5–10s on a cold start.

If the detected port is **not** 3000, surface that in the final report so the user knows what's listening. Do **not** treat the fallback as a skill failure.

**c. Clean up.**

Terminate the dev server background process:

```bash
kill $LAUNCH_PID 2>/dev/null
```

Do **not** stop Postgres — it's a shared system service used by every T3 app on this machine. There's nothing project-local to clean up.

**d. Stage all post-scaffold changes.**

create-t3-app's `git init && git add .` runs early in Step 4, *before* any of the Steps 5–7 fixes. All those modifications sit as unstaged changes on top of the staged scaffold. Run a final `git add .`:

```bash
git add .
```

This also handles the preexisting-`.git` case from Step 4. After this step `git status` shows a single staged tree ready to commit.

**Common failure modes:**
- `db:push` permission error → role grants didn't apply; rerun Step 7c's second SQL block.
- `db:push` says `relation "user" already exists` → the auth tables exist in the DB but Drizzle introspection didn't see them. Confirm `tablesFilter` in `drizzle.config.ts` includes the four bare names from Step 6c.
- HTTP probe fails despite "Ready in" → Next is mid-compile; retry the curl after another few seconds before declaring failure.
- Postgres connection refused → `brew services list | grep postgresql@16` should say `started`. If not, `brew services restart postgresql@16` and re-poll with `pg_isready`.
- Scaffold step (Step 4) failed with `ERR_TTY_INIT_FAILED` or hung → the dotfile stash didn't catch something. The Step 4 script's own sanity check catches this.

### 9. Report

After every preceding step succeeded, print exactly the block below — verbatim, nothing before it (other than the per-component success lines defined in Output style), nothing after it. No commentary on stack contents, file changes, git status, deployment, or "what was set up".

```
## How to use

- `npm run dev` — start the dev server (Postgres runs in the background as a system service)
- `npm run db:push` — apply schema changes after editing `src/server/db/schema.ts`
- Database registry: `~/.t3-local-pg/registry.json` (project name → DB connection URLs)
- MCP server: `t3-local-pg` is registered with Claude Desktop / Cowork. Use the `query`, `query_write`, `describe`, and `list_projects` tools to inspect this project's DB. The project name is pinned in `CLAUDE.md` so any Claude session opened here resolves it automatically.
```

If `npm run dev` bound to a non-3000 port during Step 8b, append exactly one line: `Dev server is on port <N> (something else was on :3000).`

If `SERVICE_PERSISTENCE_WARNING=1` was set during Step 2d (Linux without systemd, fell back to `pg_ctl`), append: `Postgres started via pg_ctl — no systemd available, so it will NOT auto-restart on reboot. Run `pg_ctl -D $(brew --prefix postgresql@16)/var/postgresql@16 start` after each reboot, or set up a systemd-user service yourself.` Otherwise omit.

If on Linux with systemd and the user has not enabled lingering for their account, append: `Run \`loginctl enable-linger $(whoami)\` once to keep Postgres running across logout (otherwise it stops when you log out).` Detect this by running `loginctl show-user $(whoami) -p Linger 2>/dev/null | grep -q 'Linger=yes'` — append the line only if the check fails. Skip the line entirely on macOS.

Do not commit on the user's behalf. Do not push. Step 8d staged everything; the user runs `git commit -m "initial commit"` whenever they're ready.

## Failure surface

A success line is a load-bearing claim. Only print `<component> bootstrapped/scaffolded/etc.` after the corresponding step actually succeeded by its own check (artifact existence, exit code where reliable, HTTP probe, etc.). If a step partially worked — Postgres started but the MCP install failed, or `db:push` succeeded but the HTTP probe didn't return 200 — do **not** print the next success line. Stop, surface the actual error, and do not print the "How to use" block. The user must be able to trust that seeing the full success sequence means the project actually works end-to-end via `npm run dev`.

## Architecture notes (background, not part of the procedure)

**Why a shared cluster, not per-project daemons.** PGlite (the previous design) ran one daemon per project, each with its own data dir and listening port. That worked for `npm run dev` but failed when a second tool needed concurrent access — PGlite serializes through one connection per cluster, and "always-on, accessible from Claude Desktop and from the dev server simultaneously" violates that invariant. Real Postgres handles N concurrent connections natively, so one cluster shared across projects is strictly better for multi-tool dev.

**Isolation boundaries.**

- **Database-level (primary).** Each project gets its own database (`<slug>_dev`). A connection is pinned to one database for its lifetime — `<slug_a>_app` cannot `\c <slug_b>_dev` because Step 7c revokes `CONNECT` from `PUBLIC` and grants it only to that project's two roles. Cross-database queries require `dblink`/`postgres_fdw` and explicit setup.
- **Role-level.** Each project has its own `<slug>_app` (CRUD + DDL on its DB only) and `<slug>_ro` (SELECT only on its DB). Neither role can connect to another project's DB.
- **Credential-level.** Per-project `.env` only contains its own `DATABASE_URL`. The registry holds all URLs but is mode 0600 in `~/.t3-local-pg/`.
- **Not isolated.**
  - Server resources (RAM/CPU/disk), the bootstrap superuser, cluster-level config (`pg_hba.conf`, extensions). Acceptable for dev.
  - The cluster's built-in `postgres` admin DB. Postgres ships with `PUBLIC` having `CONNECT` on `postgres`, and the skill does not revoke it — many tools (psql by default, GUI clients, monitoring agents) connect there first to discover other databases. Any project role can therefore open a session on `postgres`. The DB is empty by default and the role has no `SELECT` grants on its system catalogs that contain anything sensitive, so this is mostly cosmetic. If you want a stricter posture, run `psql "$SUPERUSER_URL" -c 'REVOKE CONNECT ON DATABASE postgres FROM PUBLIC'` — but expect breakage in tools that assume the admin DB is always reachable.

**How the MCP server is registered.** The plugin's `.mcp.json` at the plugin root declares `t3-local-pg` with `command: "node"` and `args: ["${CLAUDE_PLUGIN_DATA}/server.js"]`. Claude Code, Claude Desktop, and Cowork all load plugin-shipped MCP servers from this declaration — no manual config editing required. A `SessionStart` hook in `plugin.json` runs `mcp-server/install.sh` on every session, which copies `server.js` and `package.json` from the plugin root into `${CLAUDE_PLUGIN_DATA}` and runs `npm install` there (both copies are diff-gated, so re-runs are no-ops). The MCP server reads `~/.t3-local-pg/registry.json` at every tool call, so it sees new projects as soon as Step 7 of this skill writes them.

**Why we copy `server.js` into `${CLAUDE_PLUGIN_DATA}` instead of running it from `${CLAUDE_PLUGIN_ROOT}`.** The MCP server is ESM (`"type": "module"`). Node's ESM resolver ignores `NODE_PATH` and only walks up from the importing file looking for `node_modules` — so a server at `${CLAUDE_PLUGIN_ROOT}/mcp-server/server.js` cannot import packages from `${CLAUDE_PLUGIN_DATA}/node_modules` no matter how `NODE_PATH` is set. Co-locating `server.js` next to its `node_modules` (both inside `${CLAUDE_PLUGIN_DATA}`) is the only resolution path that works without a custom loader. Plugin root stays read-only as the spec intends.

**Why we don't edit `claude_desktop_config.json` anymore.** Older versions of this skill patched `~/Library/Application Support/Claude/claude_desktop_config.json` to add the `mcpServers` entry. That worked briefly but did not persist: Claude Desktop owns that file as a preferences store and rewrites it on its own schedule, dropping top-level keys it doesn't recognize. Plugin-shipped MCPs are the canonical mechanism (see [GitHub issue #16143](https://github.com/anthropics/claude-code/issues/16143) for the discussion that pinned this down).

**Why the MCP server uses `ro_url` by default.** The `query` tool uses the read-only role, so the most common Claude interaction (asking about data) cannot accidentally mutate. `query_write` exists for cases where the user has explicitly asked for a change, and uses the app role. The block is enforced at the Postgres permission layer, not by parsing SQL — verified by smoke-testing a `DELETE` through `query`, which returns `permission denied for table user`.

**Platform notes.**

- **macOS** is the primary target. `brew services` writes a launchd plist, `initdb` runs as part of `brew install`, and the `~/Library/Application Support/Claude/...` config path is canonical for Claude Desktop and Cowork.
- **Linux** works with two extra concerns: (1) the brew installer needs git/build-essential/etc. installed via the system package manager first (Step 1a), and (2) `brew services` only works when systemd is available — without it, the skill falls back to a manual `pg_ctl start` and surfaces a warning that auto-restart on reboot won't happen. For session persistence (across logout, not just reboot), the user must run `loginctl enable-linger $(whoami)` once. The MCP config is written to `~/.config/Claude/...` (Cowork on Linux reads this).
- **Docker / minimal containers** work as a Linux-without-systemd subcase: everything runs, but Postgres won't restart if the container does. Acceptable for testing the skill itself; not a production posture.
- **Windows** isn't supported. Use WSL2 with Ubuntu, where the Linux path applies in full.

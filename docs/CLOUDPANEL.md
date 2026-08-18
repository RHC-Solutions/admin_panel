# CloudPanel module

Manage the CloudPanel server the panel is installed on, from `/admin/cloudpanel`.

**Off by default.** Most hosts that embed this panel are not CloudPanel servers,
so the module stays inert until an operator turns it on and installs the
root-side wrapper. Nothing here assumes RHC's own layout — every path is
configurable.

> Upstream CloudPanel reference material (its README, branding assets and a
> product summary) lives in [`docs/cloudpanel/`](./cloudpanel/) — see
> [its PROVENANCE.md](./cloudpanel/PROVENANCE.md). That directory is a verbatim
> copy of a third-party repository, not RHC code.

## Why it is built this way

CloudPanel has **no REST API**. Every management operation is the `clpctl` CLI,
and per CloudPanel's own [root user commands](https://www.cloudpanel.io/docs/v2/cloudpanel-cli/root-user-commands/)
documentation, essentially all of them require **root**. The panel runs as an
unprivileged site user. That gives two channels, deliberately asymmetric:

| Direction | Mechanism | Privilege |
|---|---|---|
| **Read** (inventory) | Open CloudPanel's own SQLite DB `readonly` | needs file read access only |
| **Write** (actions) | Allowlisted `clpctl` via a root-owned wrapper + `sudo` | root, tightly constrained |

Reads never touch `clpctl`, and writes never touch the database directly —
writing behind CloudPanel's back would desync its nginx/vhost state from its own
records.

## Setup

### 1. Install the wrapper (as root)

```bash
install -o root -g root -m 0755 \
  /path/to/vendor/admin-panel/scripts/cloudpanel/rhc-clpctl \
  /usr/local/bin/rhc-clpctl
```

### 2. Grant sudo for the wrapper only (as root)

```bash
visudo -f /etc/sudoers.d/rhc-clpctl
```

Use `scripts/cloudpanel/sudoers.example` as the contents, replacing
`rhcsolutions_com` with the user the Next.js process actually runs as:

```
rhcsolutions_com ALL=(root) NOPASSWD: /usr/local/bin/rhc-clpctl
```

> **Never** grant `NOPASSWD: /usr/bin/clpctl`. That gives the web application
> every clpctl verb that exists now or ships in any future CloudPanel release.
> The wrapper is the allowlist; sudo must only ever point at the wrapper.

### 3. Give the panel read access to CloudPanel's database

The inventory reads `/home/clp/htdocs/app/data/db.sq3`. Grant read access to the
panel's user with an ACL (preferred — no ownership or mode changes to
CloudPanel's own files):

```bash
setfacl -m u:rhcsolutions_com:rx /home/clp /home/clp/htdocs /home/clp/htdocs/app /home/clp/htdocs/app/data
setfacl -m u:rhcsolutions_com:r  /home/clp/htdocs/app/data/db.sq3
```

SQLite in WAL mode also reads the sidecar files, so if they exist grant them too:

```bash
setfacl -m u:rhcsolutions_com:r /home/clp/htdocs/app/data/db.sq3-wal /home/clp/htdocs/app/data/db.sq3-shm
```

If you would rather not grant any access, leave it — every write action still
works, and the sites table simply reports that the database is unreadable.

### 4. Enable the module

`/admin/cloudpanel` → **Enable**. Destructive commands need a **second**,
separate switch (see below).

## Enabling destructive commands

`site:delete`, `user:delete`, `user:disable:mfa`, `db:import` and
`site:install:certificate` are refused unless **both** are true:

1. **Panel side** — "Allow destructive commands" is on in `/admin/cloudpanel`.
2. **Root side** — the marker file exists:
   ```bash
   touch /etc/rhc-clpctl-allow-destructive
   ```

The marker is root-owned on purpose. A compromised web application can flip its
own database row; it cannot create a file in `/etc`. Remove the marker to revoke
deletion rights instantly, without touching the panel.

Destructive commands additionally require the operator to **retype the target**
(the domain or username) in the UI before the request is accepted.

## Security model

Every value that reaches root passes three independent gates:

1. **TypeScript validators** (`src/lib/cloudpanel/clpctl.ts`) — per-flag
   allowlist regexes; unknown commands and unknown flags are rejected outright.
2. **argv construction** — `execFile` with an argv array, **never a shell**, and
   values emitted as a single `--flag=value` element so a value can never be
   re-parsed as its own flag.
3. **The wrapper** (`scripts/cloudpanel/rhc-clpctl`) — re-derives the same
   allowlist on the root side, because the panel's validation is a usability
   layer and the wrapper is the actual security boundary. It assumes its caller
   is hostile.

Other properties:

- The child process gets a **minimal environment** (`PATH`, `LANG` only), so
  `NEXTAUTH_SECRET`, `DATABASE_URL` and other panel secrets are never inherited
  by a root process.
- Passwords are masked (`********`) in dry-run output, the audit log, and the
  wrapper's syslog line. They exist only in the argv array itself.
- The wrapper ignores `$CLPCTL_BIN` when invoked through sudo, so the binary it
  executes cannot be redirected even if the sudoers rule is later loosened.
- The **sudoers rule pins the wrapper's absolute path**, so changing "Wrapper
  path" in the admin UI cannot redirect what runs as root — point it at
  `/bin/sh` and sudo simply refuses, because only `/usr/local/bin/rhc-clpctl` is
  permitted. The setting exists for non-standard install locations, not as a
  privilege boundary.
- Every non-dry-run action is written to the panel's audit log
  (`/admin/audit`, action `cloudpanel.<command>`) **and** to host syslog
  (`logger -t rhc-clpctl`), so the trail survives loss of either system.

### Commands deliberately not exposed

| Command | Why |
|---|---|
| `db:show:master-credentials` | Hands global MySQL root credentials to anyone with an admin session. Read it on the box. |
| `cloudpanel:enable:basic-auth` / `disable` | Can lock the operator out of CloudPanel itself from a CMS screen. |

## Configuration

Precedence is **env var > admin UI setting > default**, so an operator can pin
paths in `.env.local` and stop the UI from moving them.

| Setting | Env var | Default |
|---|---|---|
| Enabled | `CLOUDPANEL_ENABLED` | `false` |
| CloudPanel DB path | `CLOUDPANEL_DB_PATH` | `/home/clp/htdocs/app/data/db.sq3` |
| Wrapper path | `CLOUDPANEL_WRAPPER_PATH` | `/usr/local/bin/rhc-clpctl` |
| Use sudo | `CLOUDPANEL_USE_SUDO` | `true` |
| Allow destructive | `CLOUDPANEL_ALLOW_DESTRUCTIVE` | `false` |

Non-absolute paths are rejected and fall back to the default — a relative
`dbPath` would resolve against the Next process CWD and could be pointed at the
panel's own database.

## Schema drift

CloudPanel's SQLite schema is an internal detail of a closed-source product and
has changed across releases. The inventory reader therefore **introspects**
`sqlite_master` and `PRAGMA table_info` and maps each logical field to the first
candidate column that exists, rather than hardcoding names. A renamed column
degrades that one field to `null`; it does not break the page. The discovered
tables are shown in the UI's diagnostics panel so drift is visible rather than
mysterious.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "CloudPanel database not readable" | Wrong `dbPath`, or missing ACL — see step 3. |
| "Wrapper not found at …" | Step 1 not done, or a different path than configured. |
| `sudo: a password is required` | The sudoers rule is missing, names the wrong user, or lacks `NOPASSWD`. The panel calls `sudo -n` and never waits for a prompt. |
| "destructive command refused: /etc/rhc-clpctl-allow-destructive does not exist" | Working as designed — create the marker to allow it. |
| Command times out | Default limit is 120 s. Let's Encrypt issuance on a slow DNS propagation can exceed it; the command keeps running on the host. |

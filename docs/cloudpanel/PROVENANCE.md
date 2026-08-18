# Provenance — upstream CloudPanel reference material

**This directory is not RHC code.** It is a verbatim copy of the public
[CloudPanel](https://www.cloudpanel.io) repository, kept as reference material
for the panel's CloudPanel module (`src/lib/cloudpanel/*`, `/admin/cloudpanel`).
See [../CLOUDPANEL.md](../CLOUDPANEL.md) for the module itself.

| | |
|---|---|
| Origin | `https://github.com/rhcsolutions/rhc-cloudpanel.git` (an RHC fork of upstream) |
| Commit at time of import | `4e332236836a190fb9c24a2f277a418ff1e78be2` (2025-09-23) |
| Previous location | `rhc-cloudpanel/` in this working tree, as a **nested git repository** |
| Imported | 2026-08-18 |

## What happened to the git history

The fork carried 72 commits, **all of them upstream's** — it contained no RHC
changes of any kind. When this content was folded into rhc-cms, the nested
`.git` directory was detached rather than merged, so those 72 unrelated commits
do not appear in rhc-cms history. Nothing was lost: the fork still exists at the
origin URL above and can be re-cloned at any time.

## What is actually here

| Path | Note |
|---|---|
| `README.md` | Upstream's marketing README. Its inline image path was rewritten to be relative to this directory so it still renders. |
| `STACK_SUMMARY.md` | A summary of CloudPanel-the-product (not of this repo — that one is at the repo root). |
| `assets/images/` | Upstream logo assets (~500 KB). |
| `.github/ISSUE_TEMPLATE/` | Upstream's issue templates. **Inert here** — GitHub only reads `.github/` at a repository root, so these do not affect issue filing on rhc-cms. |
| `.gitignore` | Upstream's, containing only `/.idea`. Scoped to this directory; kept for completeness. |

## Worth knowing

CloudPanel's public repository contains **no source code** — the product itself
is closed-source, and the repo is documentation, issue templates and branding
only. That is why the CloudPanel module talks to a live host over `clpctl` and
CloudPanel's own SQLite database rather than building against any upstream code.

# Zero-Dependencies Migration (Block-Buster → The Block)

**Last reviewed:** February 4, 2026  
**Scope:** `block-buster/` (Python dashboard server + static web UI) and its integration touchpoints into the Rust workspace.

## What “Zero Dependencies” means here

This repo already enforces “first-party-only” for Rust via `tools/dependency_registry` and `config/dependency_policies.toml`. This document defines the equivalent contract for the non-Rust portions:

### Contract (ordered by severity)

1. **Production runtime (MUST be first-party only)**
   - Python runtime imports: stdlib + our own modules only (no `pip install` runtime deps).
   - Web UI runtime: browser APIs + our own JS/CSS only (no React/Vite/etc).
   - Rust workspace: no crates.io or git sources (already enforced).
2. **Release/CI tooling (SHOULD be first-party or vendored)**
   - If a tool is required for `just lint`, `just test-fast`, CI, or releases, it must either be first-party or vendored under our namespace with provenance recorded.
3. **Experimental/legacy (MAY have third-party deps, but MUST be quarantined)**
   - Must be excluded from default builds/tests and clearly labelled as non-production.

If you’re not sure which bucket something falls into, treat it as **Production runtime** until proven otherwise.

## Current status (as of 2026-02-03)

### ✅ Rust workspace

- `Cargo.lock` contains **no** `registry`/`git` sources (workspace is first-party only).
- The canonical guard is: `cargo run -p dependency_registry -- --check config/dependency_policies.toml`.

### ✅ Block-Buster runtime (Python)

- `block-buster/requirements.txt` is intentionally empty (no runtime deps).
- The dashboard server runs on first-party infrastructure:
  - HTTP server: `block-buster/src/block_buster/core/http_server.py`
  - WebSocket server: `block-buster/src/block_buster/core/websocket.py`
  - JSON-RPC client: `block-buster/src/the_block/rpc_client.py`
  - Persistence: `block-buster/src/block_buster/core/database.py` (SimpleDb)
  - Metrics: `block-buster/src/block_buster/utils/metrics.py`
  - Numpy replacement: `block-buster/src/block_buster/utils/np.py`

### ✅ Block-Buster runtime (Web UI)

- `block-buster/web/` is a dependency-free static web UI.
- `block-buster/web/package.json` has **no** dependencies/devDependencies.

### ⚠️ Remaining non-first-party surface (still blocking “ALL deps”)

| Area | What’s left | Why it matters |
|------|-------------|----------------|
| `scripts/requirements.optional.txt` | `pytest`, `patchelf` | Tooling-only but third-party; decide whether it’s allowed, vendored, or replaced. |
| `blocktorch/experimental/**` | HF/PyTorch stack + git installs (quarantined legacy path) | Must remain strictly excluded from default builds/tests, or move out of tree. |

## Next phases (actionable roadmap for “the last 1%”)

These phases are intentionally scoped so multiple devs can work in parallel without stepping on each other. Each phase has explicit “definition of done” so we don’t drift.

### Phase 0 — Re-assert the Rust dependency gate (1–2 hours)

**Goal:** Make the “first-party Rust” guarantee *operationally true* for every dev, not just conceptually.

**Why now:** The policy is only useful if the standard check actually passes from a clean clone.

**Do:**
- Ensure `cargo run -p dependency_registry -- --check config/dependency_policies.toml` passes.
- If the baseline artifacts drift, regenerate them using the tool and commit the updated `docs/dependency_inventory*.json`.

**Done when:**
- `just dependency-audit` and `make dependency-check` succeed on a clean tree.

### Phase 1 — Delete the last npm-registry dependency graph (0.5–1 day)

**Goal:** Remove `block-buster`’s npm toolchain that pulls from the public registry.

**Do:**
- Prove whether `block-buster/package.json` is still required. If not required, remove:
  - `block-buster/package.json`
  - `block-buster/package-lock.json`
  - Any TS/Jest/ESLint config files that only exist to support that toolchain (e.g. `.eslintrc.json`, `jest.config.cjs`).
- If it *is* required (rare): replace it with either:
  - a zero-dependency Node script (built-ins only), or
  - a first-party generator under `tools/` (Rust or Python stdlib).

**Done when:**
- `rg -n \"registry\\.npmjs\\.org\" -S .` returns nothing (i.e., no lockfiles pulling from the public npm registry).
- No repo workflow (Justfile/Makefile/docs) requires `npm install` for Block-Buster.

**Status:** ✅ Complete (2026-02-04): removed `block-buster/package-lock.json`, `block-buster/package.json`, and legacy ESLint/Jest config files.

### Phase 2 — Make Python packaging optional (0.5–1 day)

**Goal:** Decide whether `block-buster` is a packaged artifact or just a repo-run service.

**Option A (preferred for zero-deps):** “repo-run only”
- Remove the packaging build-system requirement (`setuptools`, `wheel`) and run via `PYTHONPATH=block-buster/src`.

**Option B:** “packaged, but quarantined as tooling”
- Keep `pyproject.toml`, but explicitly document that packaging is not part of production runtime and is not required for CI/ops paths.

**Done when:**
- The chosen approach is written down in `block-buster/RUNNING_FIRST_PARTY_SERVER.md` (or `block-buster/README.md`) and matches reality.

**Status:** ✅ Complete (2026-02-04): “repo-run only” (no `pyproject.toml`; run via `PYTHONPATH=block-buster/src`).

### Phase 3 — Quarantine or eject third-party-heavy subtrees (1–2 days, mostly mechanical)

**Goal:** Keep the repo’s “first-party only” posture credible by ensuring heavyweight third-party stacks don’t leak into default workflows.

**Targets:**
- `blocktorch/experimental/**`: ensure it is never built/tested unless explicitly opted in.
- `scripts/requirements.optional.txt`: tooling-only; keep defaults stdlib-only.

**Done when:**
- `just test-fast` / `just test-full` do not import or execute anything under `blocktorch/experimental`.
- Docs explicitly label the subtree as quarantined, with the opt-in commands listed.

**Status:** ✅ Complete (2026-02-04): tooling deps moved to `scripts/requirements.optional.txt` and are not auto-installed by bootstrap scripts.

### Phase 4 — “Next 1%” hardening (ongoing; small PRs)

These are not dependency removals, but they are the remaining “edge polish” needed for a production-grade first-party stack.

**HTTP client hardening**
- Connection pooling + bounded retries/backoff in `block-buster/src/block_buster/core/http_client.py`.
- End-to-end latency tracing hooks (request start/end timestamps + error classification).

**Persistence hardening**
- Periodic WAL `fsync` + compaction hooks in `block-buster/src/block_buster/core/database.py` (SimpleDb).
- Crash-safety verification: kill -9 / restart loop test with deterministic recovery assertions. ✅ Covered by `block-buster/tests/test_simpledb_kill9.py::TestSimpleDbKill9`.

**Health & telemetry**
- `/health` should surface uptime, db health/flush lag, recent error counts, and feature pipeline lag.
- Metrics must go through `block_buster.utils.metrics` (no third-party exporters).

**Done when:**
- Each PR lands with a unit test under `block-buster/tests/` and an ops note in `block-buster/OPERATIONS.md`.

## Verification checklist (per phase)

### Rust policy gate
- `cargo run -p dependency_registry -- --check config/dependency_policies.toml`

### Block-Buster (Python)
- `python -m unittest discover block-buster/tests`

### Quick “no accidental deps” greps
- `rg -n \"registry\\.npmjs\\.org\" -S .`
- `rg -n \"^\\s*(fastapi|uvicorn|httpx|requests|pydantic|sqlmodel)\\b\" -S block-buster/src || true`

## Notes on doc drift

Block-Buster contains several historical docs describing older React/TypeScript and FastAPI-era designs. Treat this file plus `block-buster/RUNNING_FIRST_PARTY_SERVER.md` as the authoritative “current state” spec; anything else should either be updated or moved under an explicit `docs/archive/` label before it’s cited as truth.

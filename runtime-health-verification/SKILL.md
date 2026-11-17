---
name: runtime-health-verification
description: ALWAYS use at the end of every prompt in a project that runs a long-lived local service — web app, API, worker or dev server — or that already ships a runtime/health probe, and before reporting completion. Proves the running process is healthy on the current checkout, restarts it with the current code and re-probes when it is not, so tests are never mistaken for a working application. Use after every change, even a docs-only or one-line edit. Do not use for libraries or one-shot CLIs that have no running process.
---

# Runtime health verification (always-on)

**Applies to:** a project that runs (or is supposed to run) a long-lived local service:
web UI, HTTP API, background worker, job runner or dev server.

It does **not** apply to a library, a one-shot CLI, a build script or a static document
tree with no process. In those projects, the equivalent proof is the project's own test or
build gate — say explicitly that no runtime probe applies.

Passing tests do **not** prove the app is up. The process may have died, may still be
serving modules imported before your edit, may hold an old schema, or may be locked out of
its database. The standing rule is: **after every prompt, check the running application;
if it does not work, restart it with the current code and test it again.**

## 1. Find the project and its service

1. Resolve the project root (`git rev-parse --show-toplevel`, else the nearest manifest —
   see `clean-checkout-delivery`). Stay inside that project: a workspace may hold several.
2. Look for a running-service signal, in this order:
   - an existing probe: `scripts/runtime_health.py`, `scripts/runtime_health.sh`,
     `scripts/healthcheck.*`, `bin/health*`;
   - a declared run/probe script: `package.json` → `scripts.health`, `scripts.smoke`,
     `scripts.start`, `scripts.dev`; `Makefile` → `health`, `smoke`, `run`, `serve`;
     `docker-compose.yml` → `healthcheck`; `Procfile`; `justfile`;
   - documented run instructions in `README.md` / `AGENTS.md` / `docs/`;
   - framework markers that imply a dev server: uvicorn/FastAPI/Flask/Django, Next/Vite/
     Astro, Express/Nest, Spring Boot, Rails, `go run ./cmd/...`, `cargo run` with a
     server binary, `*.xcodeproj` simulator app.
3. No service and no probe → this skill does not apply. Report that and move on; do not
   invent an HTTP probe for a library.

## 2. Define "working" before you probe

A probe is only meaningful if its checks are written down. A complete definition covers:

| Dimension | Pass condition (project-specific values) |
| --- | --- |
| Reachable | the process answers on the expected host/port within the readiness window |
| Right instance | its identity payload names this app and this checkout/version |
| Dependencies usable | database writable / cache reachable / migrations current / no lock held |
| Data invariant | the project's protected-data check is healthy |
| Surface renders | the route the user actually opens answers `200` with a non-empty body |

Encode these in the probe. Do not re-derive them by hand each time and do not substitute
`pytest` for a runtime probe.

## 3. Find or create the probe

Use the project's existing probe first. If the project runs a service but has none:

- Create `scripts/runtime_health.py` (or `.sh` for shell-only stacks) from
  [`references/probe-template.py`](references/probe-template.py), filling in the base URL,
  identity check and one surface route.
- Keep the exit-code contract: `0` healthy, `1` reachable but unhealthy, `2` not running /
  unreachable. The agent's decision table depends on it.
- Add it to the project's docs and commit it with the change that introduced it.

## 4. Probe, then decide

```bash
<interpreter> scripts/runtime_health.py     # .venv/bin/python, uv run python, node, ./scripts/...
```

| Situation | Action |
| --- | --- |
| Exit 0, nothing you changed is loaded by the process | Leave the process alone; quote the OK line. |
| Exit 0, but you changed code the process loaded | Restart — a long-lived process serves the code imported at startup. |
| Exit 1 | Restart, then investigate if the same problem returns. |
| Exit 2, and nothing owns the port | Start the service (step 5). |
| Exit 2, but another process owns the port | Do not kill it. Report the conflict and use a different port or ask. |

## 5. Restart or start through a managed job

- Use the project's documented lifecycle command (e.g. `npm run dev`, `make run`,
  `uv run <app> serve`, `docker compose up`, `cargo run -- serve`). Prefer a clean
  stop-then-start so a stale process cannot keep the port.
- **Never** `nohup`, `&`, `disown`, a detached terminal, or a second server on the same
  port. Launch the foreground command as the harness's managed background job (in DSH:
  the `bash` tool with `run_in_background: true`) and keep the job handle so you can read
  the startup log and stop it.
- Respect the project's network default: stay loopback-only unless the previous instance
  deliberately served the LAN.
- Starting a second instance is not a restart. Stop the old one first.

## 6. Wait for readiness, then probe again

A PID existing is not "working":

```bash
for _ in $(seq 1 30); do
  <interpreter> scripts/runtime_health.py && exit 0
  sleep 1
done
echo "service did not become healthy" >&2
exit 1
```

## 7. Smoke-test the surface you touched

The probe covers the health route and one page. After a UI, template, route or job change,
also request the affected surface (the changed page, the new endpoint, the job's terminal
state) and confirm it does what the task asked. For job/CLI changes, verify the job reports
a terminal state and leaves nothing running.

## 8. Report the evidence

In the final answer, state: base URL, probe verdict (exit code), the identity/schema/count
values it returned, whether you restarted and why, and the startup log line or job handle
that proves it. On failure, report the exact problem and what you tried — **never claim the
app works**.

## Rules

- **Do not stop a healthy server** just to demonstrate the procedure; leave the user's UI
  running.
- **Never finish or commit with a failing probe**, unless the user explicitly asked to stop
  the server — then say it is stopped and skip the probe.
- **Restart after any change the process loaded**, including template-, CSS- and
  route-only edits.
- **A restart is only done when the re-probe is green**, not when the start command printed
  a URL.
- **Never kill a foreign process** on the port; report it and pick another port.
- **Runtime state is sacred.** The probe must be read-only. If it reports unhealthy
  protected data, stop looping restarts, follow the project's documented recovery, and
  never delete a database, volume or upload directory to make a probe pass.

## Project profiles

Concrete configurations live beside this skill:

- Example Catalog Project — [`references/example-project.md`](references/example-project.md)
  (port 9000, `/api/health`, `catalog stop`/`serve`, DuckDB writer rules).

When you onboard another project that runs a service, add
`references/<project>.md` with its base URL, probe command, lifecycle commands, expected
identity payload and protected-data invariants — and keep this file generic.

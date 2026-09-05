# 0001 — Require Node.js >= 22.13

## Context

The package declared `engines.node: ">=20.0.0"` and CI ran the matrix `[20.x, 22.x]`.

Node 20 reached end of life in April 2026 and no longer receives security fixes. The shared
`node-red-standards` raised its floor accordingly (rule `node engines >= 22`, audit rule added in
0.7.x), so the repo audited at 18/19 and the `standards` CI job failed on every push and pull
request while the declaration stayed at 20.

Raising the floor is not a formality. `engines` is published, so it changes what consumers see:
installing on Node 20 reports `EBADENGINE`. Node-RED itself is commonly run on whatever Node the
host distribution ships, which is not always current.

## Decision

Declare `engines.node: ">=22.13.0"` and run CI on `[22.x, 24.x]`, matching the standard's
templates. 22.13 rather than a bare 22 because that is the version the standard names, and pinning
to the LTS baseline rather than the major's first release avoids depending on behaviour that only
landed later in the line.

Released as **0.35.0**, a minor bump. The package is pre-1.0, where a breaking change is signalled
by the minor rather than the major; no major bump is taken, so the AGENTS.md rule requiring an ADR
for a major bump is not what triggered this file — it is recorded because dropping a supported
runtime is a non-trivial decision that a reader will want the reasoning for.

## Consequences

- Users on Node 20 cannot install 0.35.0 without an `--engine-strict` override, and get
  `EBADENGINE` warnings. They stay on 0.34.5, which remains published and functional.
- Node 20 is no longer tested. A regression that only affects it will not be caught, which is the
  point: it is not a supported target any more.
- The `standards` audit returns to 19/19, so the CI job stops failing.
- Nothing in `grohe/` changed. The code did not use any API that requires 22; this is a support
  statement, not a port.

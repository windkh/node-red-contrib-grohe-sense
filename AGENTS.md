# AGENTS.md — node-red-contrib-grohe-sense

<!-- BEGIN node-red-standards:managed (do not edit — run `nrstd sync`) -->

> These shared rules are maintained centrally in **node-red-standards** and refreshed here by
> `nrstd sync`. Do not edit between the managed markers — change the standard instead. Everything
> below the managed block (the "Project-specific rules" section) is yours and is never overwritten.

## Shared: Architecture

- Node packages are modular: `lib/` holds framework-independent, unit-testable core logic;
  `nodes/` holds one file per Node-RED node; `icons/` holds node icons.
- The registered entry file (`<pkg>/99-<name>.js`) is a thin delegator that only `require`s and
  registers the modules in `nodes/`. Keep runtime glue thin.
- Record non-trivial design decisions as an ADR in `doc/architecture/adr/`.

## Shared: Code style

- Lint: ESLint flat config (`eslint.config.js`), ESLint >= 10. Run the lint script before committing.
  `eslint` and `@eslint/js` must stay on the same major: `@eslint/js@10` peers on `eslint@^10`, and
  pairing `eslint@10` with `@eslint/js@9` silently keeps the v9 recommended rule set.
- ESLint 10's recommended set adds `no-unassigned-vars` and `no-useless-assignment`. Both are errors:
  don't declare a binding only to pass `undefined` around, and don't assign a value no later
  statement reads.
- Format: Prettier (`.prettierrc.json`) — 4-space indent, single quotes, es5 trailing commas.
- Target Node.js >= 20.
- Avoid `var` — use `const`, or `let` only when the binding is reassigned (enforced by `no-var` / `prefer-const`).
- One statement per line — don't pack multiple instructions onto a single line; keep lines simple to read (enforced by `max-statements-per-line`).
- Keep functions short, with a single exit:
    - **One exit per function.** A function leaves in exactly one place: its last statement. This
      includes guard clauses — an early `return` in a precondition check is still a second exit and is
      not allowed. Assign to a single result and return it as the last statement. `throw` is the one
      permitted exception, because it is not a return and a `finally` still runs.
    - **Validate by nesting, not by leaving.** State the precondition as the condition that must hold
      and put the work inside it, with the error path in the `else`. Where the caller is code, `throw`
      instead; where the caller is a Node-RED flow, the `else` calls the error path.
    - **Keep functions short enough that the nesting does not matter.** The objection to nesting is
      really an objection to long functions — at a readable length, one or two levels of indentation
      cost nothing. If the nesting starts to hurt, extract a function; never add a second exit.
    - **Most likely case first within each branch**, so a reader meets what the function normally does
      before the exceptions.
    - **If every path must do trailing work, put that work in `finally`** rather than repeating it
      before each exit — combined with the single exit this makes the epilogue unskippable.
- No defensive programming. Do not check for states that cannot occur, and do not guard against
  hypothetical future changes to code you control. Validate input at the boundary and then trust it.

## Shared: Tests

- Node's built-in test runner (`node --test`) + `node-red-node-test-helper`. Tests live in `test/` as `*.test.js`.
  Import `{ describe, it }` from `node:test` and assert with `node:assert`. Coverage via `c8`.
- Node's default discovery runs **every** `.js` under `test/`, whatever it is named, so shared helpers and
  fixtures belong outside that directory (e.g. `test-helpers/`). The test script deliberately takes no path
  arguments: a `'test/**/*.test.js'` glob would need Node >= 21 and fails on Node 20, which is still supported.

## Shared: Documentation

- `README.md` is user-facing. Architecture docs live under `doc/architecture/`
  (`overview.md`, `structural-design.md`, `behavioural-design.md`, `adr/`).
- Update `CHANGELOG.md` (Keep a Changelog style) for every user-visible change; bump the
  patch version in `package.json` in the same commit.

## Shared: Workflow

- CI (`.github/workflows/node.js.yml`) must pass: lint, format:check, test, coverage.
- Releases go through `.github/workflows/npm-publish.yml`.
- Never bump the major version without an ADR explaining the breaking change.

## Shared: package.json scripts

`lint`, `lint:fix`, `format`, `format:check`, `test` (`node --test` with `--test-force-exit --test-timeout=30000 --test-concurrency=1`, no path args), `coverage` / `coverage:check` (c8 over `npm test`).

<!-- END node-red-standards:managed -->

## Project-specific rules

<!-- Repo-specific rules go here. `nrstd sync` never touches this section. -->

### What this package talks to

The GROHE **Ondus** cloud (`https://idp2-apigw.cloud.grohe.com/v3/iot`). The route set implemented here
follows the prior open-source clients credited in `README.md` (Java, C#, TypeScript). GROHE can change the
API at any time — that is the normal cause of a bug report, not a regression in this repo. When a route
changes, capture the new request/response in `test/fixtures/` and pin the behaviour with a test.

### Module boundaries

- **`grohe/lib/ondusApi.js`** is the _only_ file that performs HTTP (via `superagent`). Nothing else may
  import `superagent` or build a URL. It owns `OndusSession` (login, token refresh, the `get/post/put/patch/del`
  verbs, and one method per route), the frozen `OndusType` (`101` Sense, `102` Sense Plus, `103` Sense Guard)
  and the frozen `COMMAND_KEYS` whitelist.
- **`grohe/lib/converters.js`** is pure: API shape → flow shape, no I/O, no clock beyond what is passed in.
  It is at 100% coverage — keep it that way, it is the cheapest place to add a test.
- **`grohe/lib/locator.js`** resolves room + appliance _names_ (as shown in the Ondus app) to ids. On failure
  it returns a diagnostic object (`roomNotFound` / `applianceNotFound` plus the available names) instead of
  throwing, so the user sees what actually exists ([#25](https://github.com/windkh/node-red-contrib-grohe-sense/issues/25)).
  Matching is exact — no trimming, no case folding.
- **`grohe/lib/backoff.js`** is the capped exponential backoff for the location node's reconnect loop
  ([#20](https://github.com/windkh/node-red-contrib-grohe-sense/issues/20)).
- **`grohe/nodes/grohe-location-node.js`** is the config node: it holds the credentials and the single
  session, refreshes the token, and drives reconnect. It communicates state to the sense nodes purely by
  events (`connecting`, `connected`, `disconnected`, `initialized`, `initializeFailed`).
- **`grohe/nodes/grohe-sense-node.js`** is one instance per appliance: it polls, dispatches commands and
  notification operations, and shapes the outgoing `msg`.

### Ondus API rules that are easy to get wrong

- **Login scrapes an HTML form.** `getActionUrl` extracts `action="…"` with a regex and decodes it with `he`.
  This is inherently brittle — it breaks whenever GROHE touches the login page. Don't "clean it up" into
  something that looks safer but silently returns a wrong URL.
- **Commands are Sense Guard (`103`) only, and are read-merge-write.** The API validates the command object
  as a whole and demands the complete field set, so the node reads the current command, merges the caller's
  fields onto it, and sends the full object. Never send a partial command. Unknown keys are dropped against
  `COMMAND_KEYS`; a wrong value type is rejected with `node.error` and nothing is sent.
- **`groupBy` must reach the API in lower case** (`hour|day|week|month|year`). Input is accepted in any case
  and lower-cased; an invalid value falls back to `day`.
- **Notifications are account-wide**, served from `/profile/notifications`, not per appliance. Filtering by
  appliance happens client-side on the `appliance_id` each notification carries. `getAllNotifications` follows
  `continuationToken` and is **capped at 20 pages** — the cap is load-bearing, the API will otherwise hand out
  a token forever.

### Rate limits — the single most important constraint

Roughly **1000 requests per endpoint per 24 h**; exceeding it **blocks that endpoint for 24 h** and surfaces as
`Caught exception: Forbidden` (HTTP 403). One trigger of the sense node costs several requests (info, status,
details, notifications, plus command for Sense Guard). There is **no push mechanism** — everything is polling.

A Sense Guard uploads every ~15 min; a Sense once a day. **Never ship an example flow, default, or doc snippet
that polls faster than every 15 minutes**, and don't wire several poll paths onto the same appliance
([#24](https://github.com/windkh/node-red-contrib-grohe-sense/issues/24)).

### Tests

- **No test may touch the network.** Inject a fake session / spy object (see `spySession` in
  `test/ondusApi.test.js` and `buildHarness` in `test/senseNode.test.js`) and assert on the recorded
  verb + URL + body.
- `test/fixtures/*.json` are recorded real API responses ([#26](https://github.com/windkh/node-red-contrib-grohe-sense/issues/26),
  [#27](https://github.com/windkh/node-red-contrib-grohe-sense/issues/27)). They are `.json`, so Node's
  test discovery (which runs every `.js` under `test/`) ignores them.

### Node-RED specifics

- `grohe/99-grohe.html` holds the editor templates in `<script type="text/x-red">` blocks. It is generated-ish,
  hand-edited rarely, and excluded from nothing — so if you touch it, re-check the node appears correctly in the
  palette and both config dialogs still open.
- `examples/*.json` are editor exports. They must stay in the `files` array of `package.json`: Node-RED reads
  that directory in installed packages to populate **Import → Examples**.

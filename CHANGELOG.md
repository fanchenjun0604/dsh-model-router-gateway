# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.1.0 — Unreleased（攒批中）

### Added

- **Management UI moved out of the plugin page**: the operations card now lives
  in a dedicated Settings page (`设置 → 模型路由网关`). The plugin detail page
  keeps the host's description/README only. A Settings-page switch can pin an
  optional entry to the left sidebar (`main` panel + `sidebar.panellist`), and
  the choice persists as `navEnabled` in the state file; the sidebar panel
  hides the switch, so the Settings page stays the single control.
- **True streaming**: with `stream: true` the gateway now forwards upstream
  token deltas as OpenAI SSE chunks as they are generated, instead of
  buffering the whole answer and slicing it afterwards. First-token latency
  drops to the upstream's first token (typically 1–3 s), which is what
  agent clients with short first-token watchdogs (DeepWrite et al.) need.
  Failed candidates fall back down the route only before the first token;
  a post-token failure emits an SSE `error` event instead of switching
  silently. `reasoning-delta` maps to `delta.reasoning_content`.

### Fixed

- **Filter-aware bulk selection**: with the visibility filter active, the
  per-provider 全选 and the top-level 全部显示/全部隐藏 now act only on the
  models matching the filter, consistent with 反选/清空 (previously they
  touched unshown models).

## 1.0.6 — 2026-11-23

### Fixed

- **Model exposure actually hides models now**: the card saves "all unchecked"
  for a provider as an empty array, but the gateway treated an empty array as
  "no filter" and exposed the whole provider. An empty list now hides every
  model of that provider (`/v1/models` and the "全部隐藏" button follow the
  card's real semantics).
- **Hidden models can no longer be called directly**: `provider:model` calls
  are checked against the exposure list, so knowing a hidden model id no
  longer bypasses the card.
- **Long generations no longer trip first-byte watchdogs**: `/v1/chat/completions`
  with `stream: true` now opens the SSE response immediately with comment
  frames (`: connected`, then `: ping` every 8s) while the answer is being
  generated. Mobile agent clients (DeepWrite and similar) that abort after a
  few idle seconds now keep the connection through long generations.
- **First SSE chunk carries `role: "assistant"`** for strict agent clients.
- **CORS headers on every API response** so webview-based clients can call the
  gateway (the standalone LAN listener already had them).

## 1.0.5 — 2026-11-18

### Fixed

- **Route ID could silently fail**: leaving the ID empty while creating made
  保存 do nothing visible (the auto-generated-from-name fallback produced an
  empty string for Chinese names, and the error was rendered at the page top,
  off-screen). The ID is now required at creation, and **every save failure
  reports inside the form** with the offending field named (ID / 名称 / 模型).
- **Create and edit are no longer mutually exclusive**: clicking 编辑 used to
  replace the 新建 entry entirely (it only reappeared after save/cancel). The
  form now always shows a 新建 entry next to the "编辑中" state; switching
  modes keeps the form open.

### Added

- **Visibility filter box**: type to match across every provider's models;
  purely a display filter — checked state is untouched and shared across
  filtering, and 全选/反选/清空 act on the filtered subset only (bulk
  maintenance like "kill all minimax variants" in one click).
- **Per-block saves**: the gateway block (key + advanced settings) and the
  visibility block each carry their own save button that submits only their
  own fields, with an inline 已保存/失败 status. Finding one global 保存
  button below unrelated sections is over.
- The gateway block can now collapse like the other sections (default open).
- **全部隐藏 button** next to 全部显示 in the visibility block: one click
  clears every provider's list (a `{provider: []}` map that saves and reloads
  exactly as the per-provider bulk ops do).
- The card intro is now a genuine one-liner ("详情见下方"), matching the
  collapsible full guide beneath it instead of front-loading a paragraph.

### Security

- `POST /admin/settings` no longer echoes the full gateway key back in its
  response (the caller submitted it; `/config` stays the only read surface).
- Creating a route without an ID is rejected server-side (400) instead of
  assigning a random hex one clients could never address.

## 1.0.4 — 2026-11-08

### Fixed

- **Edit button gave no visible feedback**: the edit form lives at the bottom
  of a long card and looked identical to the create form. Clicking 编辑 now
  scrolls the form into view and it switches to a highlighted "✎ 正在编辑"
  state (accent border + title), clearly distinct from 新建路由组.
- **Edge arrows were ambiguous**: first/last chain entries kept a faded
  disabled ↑/↓ that suggested a broken button. They are now simply not
  rendered at the ends.

### Changed

- **Chain chips are readable**: bigger font, bigger hit targets, and each
  entry shows the provider/model display names (e.g. `Our Free Model ·
  Kilo Auto Free`) with the raw `provider/model` id preserved in the tooltip
  and still used by every API call.
- **Saved-chain reorder feels instant**: ↑/↓ swaps locally first and the PUT
  is debounced (rapid clicks coalesce into one save); a failed save reloads
  truthfully instead of leaving a lying order.
- **README slimmed for npm**: the package description is a short intro again
  (it used to inline the entire bilingual manual). The full guide now ships
  inside the package (`docs/usage.md`) and renders offline in the card's new
  使用说明 panel — no GitHub dependency, nothing blocked.
- Added `homepage`/`repository`/`bugs` fields pointing at the npm page.

### Added

- **Drag to reorder in the create/edit form**: grab the ⠿ handle and drop;
  arrow buttons stay as the keyboard-accessible fallback. Reordering the
  draft is local until 保存.
- Bundled in-card guide panel (served from the package, `/docs` — static
  content outside the auth fence, so the masked public view can read it too).

### Fixed (pre-release rounds)

- Drag-down in the draft chain was a no-op: the drop index double-counted
  the slot shift caused by removing the dragged row.
- The guide panel flashed closed: it fetched with the auth fence in mind;
  the endpoint moved to the fence-free `/docs` and the fetch matches.
- Card layout: one-sentence intro with the expandable full guide directly
  under it (was: nothing up top, guide buried at the bottom); the
  create/edit route form is collapsed by default like any other section —
  编辑 opens and scrolls to it, 保存/取消 collapses again.
- npm README reduced to the single-sentence intro + feature bullets.


## 1.0.3 — 2026-11-06

### Added

- In-card self-update: **check for updates** compares the installed version
  against npm `latest`, and **upgrade** runs remove → install through the
  host's plugin manager right from the management card — no plugin page, no
  terminal. A persisted marker lets the card report the outcome across the
  remount the upgrade itself causes (including interrupted runs), and every
  manager step is deadline-bounded. On deployments without an upgrade path
  (no plugin manager in the composition) the card says so and points to the
  plugin page. Works on remote web deployments too: upgrade the Unikraft
  instance without leaving the browser.
- Cooldown visibility: `/config` reports which models are currently cooling
  and for how long; the card renders the chain chips with a ⏳ countdown and
  a red tint, so the fallback order's live state is no longer a black box.
- Chain ordering: models in a saved route can be moved up/down directly on
  the chip row, and the edit form got the same ↑↓ buttons — re-tuning a
  fallback order no longer means deleting and re-adding.
- Copy buttons for BaseURL and the current gateway key.

### Removed

- `README.zh.md`: the bilingual single-page `README.md` (since 1.0.2) is now
  the only documentation front, so the separate Chinese file no longer drifts.

## 1.0.2 — 2026-11-06

### Security

- Public deployments no longer leak the gateway key: `/config` answers with a
  masked view (key shown as `sk-a…z9`, model lists trimmed) unless the caller
  passes the host's own connection admission check (loopback / authenticated
  DSH session). Admin mutations (route CRUD, settings) now additionally
  require that trust fence — a bare gateway key from off-box cannot manage.
- Route ids are validated (`[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`) to keep client
  addressing safe.

### Added

- Failure cooldown: a model that exhausts its attempts is skipped directly
  for `failureCooldownMs` (default 60s) instead of burning a fresh timeout on
  every request; success clears the mark. Configurable in the card and patch.
- Advanced settings in the management card: per-model timeout, retries, and
  failure cooldown — all persisted through the state file.
- Route id is user-settable at creation (auto-slug from the name when left
  blank) and fixed afterwards, mirroring its role as the external model name.

### Changed

- `chat.completions` now echoes the actually answering model in `model`
  (e.g. `our-free-model/kilo-auto/free`) instead of `route:<id>`.
- `README.md` is one bilingual document (English + full 中文 section) so
  npmjs.com — which renders a single README — also shows the Chinese docs.

## 1.0.0 — 2026-11-04

Initial public release.

### Added

- Ordered fallback route groups over every model registered in DSH's `llm`
  service (silent failover on error / quota / rate-limit / timeout / empty
  response, before the first token).
- OpenAI-compatible gateway: `GET /v1/models`, `POST /v1/chat/completions`
  (stream + non-stream), Bearer gateway-key auth.
- Optional LAN listener (`publicPort`) bound to `0.0.0.0` for phones and
  remote clients when the host web server is loopback-only.
- Per-provider model visibility allow-list (select-all / invert / clear) for
  a lean external model list.
- Visual management card (plugins/settings seats) for route groups, gateway
  key, and visibility — with persistence to a state file next to the profile.
- Legacy path compatibility: requests under `/api/model-router/*` still reach
  the gateway.
- Self-contained runtime (`@deepseek-ai/schemastery` auto-installed; the rest
  is Node builtins + DSH services); works on desktop (Electron) and web
  deployments alike.

# yot Tracking Plugin System — Specification (形A / SDUI)

**Date:** 2026-08-13
**Status:** Draft (for review)
**Scope:** yot-client (schema, catalog, renderer, loader) + yot-server (spec endpoint)

---

## 1. Overview

The Tracking feature of yot-client becomes **spec-driven**. A plugin is a single
JSON document (a *spec*) that declares, in four blocks, everything a tracking
surface needs: where its data comes from (`data`), how items are classified and
labelled (`derive`), what the rows/details look like (`layout`), and what taps do
(`actions`).

The client evaluates the spec against a pre-registered **component catalog** and
a set of **derive hooks** (typed, settings-based — no expression language, no
runtime code execution). The server serves specs over HTTP so they can update
without an app-store release.

### Design goals

1. **No code at runtime** — a spec is *data*, never code. No `eval`, no
   `new Function`, no downloaded executable code (App Store guideline 2.5.2).
2. **Safe by construction** — every spec is zod-validated; invalid specs are
   rejected and the app falls back to a bundled default.
3. **Default parity** — the bundled default spec reproduces the current demo
   Tracking screen exactly; the existing test suite is the regression net.
4. **Extensible boundary** — freedom is bounded by the catalog + hooks; both grow
   on the host side as new needs appear.

### Non-goals (explicitly out of scope)

- Arbitrary algorithms by plugin authors (→ QuickJS/形B, deferred).
- Free-form visual styling (colors/spacing/fonts beyond catalog props).
- Replacing non-tracking screens (Calendar, event editing, onboarding, settings).

---

## 2. Terminology

| Term | Meaning |
|---|---|
| **Spec** | A `TrackingPluginSpec` JSON document — the whole plugin. |
| **Catalog** | The host's registry of renderable components, keyed by `type` string. |
| **Derive hook** | A named, settings-based function that computes one derived field. |
| **Element tree** | A nested JSON structure (`ElementNode`) describing layout. |
| **Action** | A named host capability (open item, notify, callAsk, …) a node can bind to. |
| **Serialized item** | A tracking item with `Date`s flattened to ISO strings / epoch ms for JSON. |

---

## 3. The Spec Schema

A `TrackingPluginSpec` has exactly these top-level fields:

```
id        string                     unique plugin id
version   integer ≥ 1                schema version
data      DataSource                 (required)
derive    DeriveSpec                 (optional — defaults apply)
listRow   ElementNode                (optional — defaults apply)
detail    ElementNode                (optional — defaults apply)
actions   Record<string, ActionDef>  (optional)
```

### 3.1 `data`

```ts
type DataSource = { franchises: Franchise[]; items: Item[] };
```

```ts
interface Franchise {
  name: string;   // "Genshin Impact" — key referenced by Item.franchise
  abbr: string;   // "GI" — filter-pill label
  color: string;  // "#E8453C" — accent for rows/progress
}

interface Item {
  id: string;           // stable id (also the route param for detail)
  title: string;
  franchise: string;    // matches a Franchise.name
  type: string;         // free-form ("gacha", "manga", "anime", …)
  start: string | null; // ISO-8601 date; null = TBA
  end: string | null;   // ISO-8601 date; null = single-day or TBA
  desc: string;
  [extra: string]: unknown; // open — plugins may add arbitrary fields
}
```

- `start`/`end` are **whole calendar days**; time-of-day is ignored (matches the
  current design's day arithmetic).
- The open `extra` fields are readable from `layout` via `{{item.<field>}}` and
  from derive hooks that name a `field`. They enable plugins like the F1 example
  (a `round` field) without schema changes.

### 3.2 `derive`

All fields optional. Omitted fields fall back to the built-in defaults (which
reproduce the current demo). Each hook is settings-based, **not** an expression.

```ts
interface DeriveSpec {
  group?: GroupHook;
  timeLabel?: TimeLabelHook;
  progress?: ProgressHook;
}
```

#### `group` hook

Classifies an item into a group label. Modes:

```ts
type GroupHook =
  | { mode: "deadline"; thresholdDays: number }   // default (7)
  | { mode: "category"; field: string }           // group by an item field
  | { mode: "static"; value: string };            // single fixed group
```

- `deadline` reproduces today's logic: `Active` if active, `TBA` if unannounced,
  `This Week` if `daysUntil ≤ thresholdDays`, else `Later`.
- `category` groups by the item field (e.g. `"magazine"`, `"platform"`).
- `static` puts every item in one bucket.

> **Host-owned bucket ordering:** the group *buckets* are still rendered in the
> fixed `Active → This Week → Later → TBA` order (or the order the groups first
> appear for `category`/`static`). Custom bucket labels are a follow-up. The
> hook controls *classification*, not *bucket chrome*.

#### `timeLabel` hook

Produces the row's right-aligned time text. Modes:

```ts
type TimeLabelHook =
  | { mode: "countdown" }                         // default
  | { mode: "date"; format?: string };            // render start date
```

- `countdown` reproduces today: `"Nd left"` / `"Live"` / `"TBA"` / `"Today"` /
  `"Nd"`.
- `date` renders `item.start` (e.g. `"2026-08-13"`); `format` is a
  date-fns format string, default ISO.

#### `progress` hook

Computes the 0–1 progress bar value. Modes:

```ts
type ProgressHook =
  | { mode: "range" }                                     // default
  | { mode: "index"; currentField: string; totalField: string }
  | { mode: "ratio"; doneField: string; totalField: string }
  | { mode: "threshold"; target: number; valueField: string; direction?: "down" | "up" }
  | { mode: "none" };
```

- `range`: fraction elapsed through an active multi-day `start`–`end` span (the
  current demo behavior). `showProgress` = active and multi-day.
- `index`: `item[currentField] / item[totalField]` (e.g. F1 round/24, book
  page/pages). Always shows the bar when the fields exist.
- `ratio`: `item[doneField] / item[totalField]` for collection/completion
  trackers.
- `threshold`: distance to a target price/count, clamped 0–1 (e.g. progress
  toward a sale price). `direction` defaults `"down"`.
- `none`: no bar.

### 3.3 `layout` — element trees

`listRow` and `detail` are `ElementNode` trees (see §4). Omitted → host default.

### 3.4 `actions`

```ts
interface ActionDef {
  kind: "openItem" | "openUrl" | "callAsk" | "notify" | "toggleState";
  params?: Record<string, unknown>;
}
```

See §5 for each kind's params and behavior.

---

## 4. Element Tree & Component Catalog

### 4.1 ElementNode

```ts
interface ElementNode {
  type: string;                                  // catalog key (required)
  value?: string;                                // "{{item.title}}" or literal
  props?: Record<string, unknown>;               // component-specific (see catalog)
  showIf?: string;                               // conditional (see §4.4)
  action?: string;                               // key into spec.actions
  children?: ElementNode[];                      // nested nodes
}
```

### 4.2 Interpolation

`value` and string `props` support `{{path}}` interpolation against a context of
`item` and `derived` (and `color`). Dot paths resolve nested fields. Unknown
paths interpolate to `""`.

```
{{item.title}}            → item.title
{{item.round}}            → item.round (extra field)
{{derived.timeLabel}}     → derived.timeLabel
{{color}}                 → franchise accent color
```

### 4.3 Catalog (initial)

| type | purpose | props | notes |
|---|---|---|---|
| `Row` | horizontal row | `gap?`, `align?` | presses via `action` |
| `Column` | vertical stack | `gap?` | |
| `Scroll` | scroll container | — | detail body |
| `Spacer` | fixed/flex space | `size?`, `flex?` | |
| `Divider` | hairline | `color?` | |
| `Title` | primary text | — | 15/semibold/ink, 1 line |
| `Subtitle` | secondary text | — | 12/regular/muted, 1 line |
| `Text` | body text | — | 15/regular/body |
| `TimeLabel` | right-aligned time | — | 12/medium/muted |
| `Badge` | small rounded tag | — | e.g. F1 round number |
| `ProgressBar` | 0–1 bar | `progress`, `color` | 80×3 (row) / 4px (detail) |
| `Checkbox` | toggle | `checked` | pairs with `toggleState` |

> Catalog props are **fixed** and typed. No arbitrary style injection. New
> components and new props are host-side additions.

### 4.4 Conditionals (`showIf`)

`showIf` is a **restricted boolean condition** — not an expression language. It
checks a single derived/item value against a literal:

```ts
type Condition =
  | { field: string; is: "truthy" | "falsy" | "null" | "notNull" }
  | { field: string; eq: string | number | boolean }
  | { field: string; gt: number }
  | { field: string; lt: number };
```

Example (show the progress bar only when the derive says so):

```json
{ "type": "ProgressBar", "showIf": { "field": "derived.showProgress", "is": "truthy" },
  "props": { "progress": "{{derived.progress}}", "color": "{{color}}" } }
```

This keeps `showIf` declarative, validatable, and far from arbitrary logic while
covering the real cases (visibility, threshold comparisons).

---

## 5. Action Registry

Actions are host capabilities a node (or the whole row) can bind via `action`.

| kind | params | behavior |
|---|---|---|
| `openItem` | — | navigate to `tracking/[id]` for the bound item |
| `openUrl` | `{ url: string }` | open URL (Linking.openURL) |
| `callAsk` | `{ query?: string }` | invoke yot `/api/ask`; default query templates the item title |
| `notify` | `{ when?: "now" \| "start" \| "beforeStart", minutesBefore?: number }` | schedule/emit a local notification |
| `toggleState` | `{ field: string }` | flip a boolean on the item's local plugin state |

- `toggleState` writes to per-plugin local state (persisted), enabling
  checklists/streaks (Idea 1, 4) without a server round-trip.
- `callAsk` is the bridge to yot's AI/MCP path (Idea 3): the client sends a query,
  the server resolves it against yot tools. API keys stay server-side.

---

## 6. Serialized Context & Defaults

The renderer evaluates each item into a serialized context:

```ts
interface ItemContext {
  item: { id, title, franchise, type, start, end, desc, ...extra }; // start/end = ISO|null
  derived: {
    group: string;
    timeLabel: string;
    progress: number;      // 0–1
    showProgress: boolean;
    daysUntil: number | null;
    daysLeft: number | null;
    isActive: boolean;
    isTBA: boolean;
  };
  color: string;           // franchise accent, else theme ink
}
```

The **default spec** (bundled) sets `derive` to `{ group: {mode:"deadline",
thresholdDays:7}, timeLabel:{mode:"countdown"}, progress:{mode:"range"} }` and a
`listRow`/`detail` tree that reproduces the current `TrackingView` and
`tracking/[id]` byte-for-byte. This is the fallback and the acceptance bar.

---

## 7. Server Endpoint

yot-server exposes the spec so it can update OTA.

```
GET /api/plugins              → { "plugins": ["tracking-demo", ...] }
GET /api/plugins/tracking     → TrackingPluginSpec (embedded default)
```

- Registered under `protected_routes` (requires `Authorization: Bearer <yot-api-key>`).
- The default spec is embedded at compile time (`include_str!` of
  `static/plugins/tracking.json`) — the canonical copy. The client bundles an
  identical fallback for offline.
- Future: user-authored specs stored server-side and listed here.

---

## 8. Client Loader & Fallback

```
loadTrackingSpec(now):
  1. GET /api/plugins/tracking via the authed client transport
  2. zod-validate the payload
  3. on any failure (network, non-2xx, invalid) → buildDefaultSpec(now)
```

- `buildDefaultSpec(now)` anchors the demo dataset to `now` (today's behavior).
- Validation failure never crashes the app — it silently uses the default.

---

## 9. Validation Rules (zod)

- `id` non-empty string; `version` positive int.
- `data` is inline (`franchises` + `items`; each item has required fields).
- `derive` hooks match their mode's required params (`thresholdDays`, `field`,
  `totalField`, `target`, etc.); unknown modes fail.
- `listRow`/`detail` are valid `ElementNode` trees (recursive); `type` must be a
  catalog key (validated at render, with a clear error for unknown keys).
- `showIf` matches the `Condition` shape.
- `actions` values match `ActionDef`; `action` references in nodes must exist in
  `spec.actions` (checked at render).

---

## 10. Rendering Pipeline

```
spec (JSON)
  → zod-validate
  → data resolve (inline)
  → per item: derive hooks → derived fields
  → listRow/detail element tree
  → renderer: interpolate {{…}}, evaluate showIf, resolve catalog component,
    bind action
  → native React tree
```

- List iteration (one node per item) is host-owned; the spec only defines the
  *row* shape.
- Unknown catalog `type` → the renderer throws a descriptive error; in production
  the spec fails validation/falls back rather than crashing mid-frame.

---

## 11. Worked Examples

### 11.1 Minimal — gacha schedule (data swap only)

```json
{ "id": "gacha-schedule", "version": 1,
  "data": {
    "franchises": [{ "name": "Genshin Impact", "abbr": "GI", "color": "#E8453C" }],
    "items": [{ "id": "b1", "title": "5.3 Banner", "franchise": "Genshin Impact",
                "type": "gacha", "start": "2026-07-01", "end": "2026-07-21", "desc": "" }] } }
```

`derive`, `layout`, `actions` omitted → defaults.

### 11.2 Category grouping — weekly manga

```json
{ "id": "weekly-manga", "version": 1,
  "data": { "franchises": [], "items": [] },
  "derive": {
    "group": { "mode": "category", "field": "magazine" },
    "timeLabel": { "mode": "date" } } }
```

### 11.3 Layout + index progress — F1 2026

```json
{ "id": "f1-2026", "version": 1,
  "data": { "franchises": [], "items": [] },
  "derive": { "progress": { "mode": "index", "currentField": "round", "totalField": "totalRounds" } },
  "listRow": {
    "type": "Row", "action": "openItem",
    "children": [
      { "type": "Badge", "value": "{{item.round}}" },
      { "type": "Column", "children": [
        { "type": "Title", "value": "{{item.circuit}}" },
        { "type": "Subtitle", "value": "{{derived.timeLabel}}" } ] } ] } } }
```

### 11.4 Stateful checklist — assignment deadlines

```json
{ "id": "deadlines", "version": 1,
  "data": { "franchises": [], "items": [] },
  "derive": { "progress": { "mode": "ratio", "doneField": "done", "totalField": "total" } },
  "listRow": {
    "type": "Row",
    "children": [
      { "type": "Checkbox", "action": "toggle", "props": { "checked": "{{item.done}}" } },
      { "type": "Title", "value": "{{item.title}}" },
      { "type": "TimeLabel", "value": "{{derived.timeLabel}}",
        "showIf": { "field": "derived.showProgress", "is": "truthy" } } ] },
  "actions": {
    "toggle": { "kind": "toggleState", "params": { "field": "done" } },
    "addToYot": { "kind": "callAsk" } } }
```

---

## 12. Risks & Open Questions

1. **Group bucket chrome** — custom group labels/order are deferred. A plugin can
   reclassify items but the bucket UI stays fixed for now.
2. **Data sourcing** — plugin data is inline only (no `fetch`). External data
   (anime schedules, race dates, …) is ingested by an agent writing events into
   the calendar, not by the plugin itself.
3. **`notify` permissions** — local notifications require OS permission; the
   action must degrade gracefully when denied.
4. **Async derive** — derive hooks are synchronous pure functions today (no async
   needed). If a future hook needs async (e.g. remote lookup), the pipeline gains
   a resolve pass; out of scope now.
5. **Catalog/style extensibility** — free-form styling is a known boundary. When a
   real plugin needs it, add limited token-referenced style props (§12 of the
   design discussion) rather than raw style injection.

---

## 13. File Map (implementation targets)

**yot-client**
- `src/plugins/schema.ts` — zod schema + types (§3, §4.1, §5).
- `src/plugins/hooks.ts` — derive hook implementations (§3.2).
- `src/plugins/catalog.tsx` — component catalog (§4.3).
- `src/plugins/renderer.tsx` — element-tree renderer + interpolation + showIf (§4, §10).
- `src/plugins/defaultSpec.ts` — default spec + `buildDefaultSpec(now)` (§6).
- `src/plugins/loader.ts` — server fetch → fallback (§8).
- `src/store/tracking.ts` — add spec-aware `describeWithSpec` (§10).
- `src/components/feed/TrackingView.tsx`, `app/tracking/[id].tsx` — render via spec.

**yot-server**
- `src/rest/plugins.rs` — endpoints (§7).
- `static/plugins/tracking.json` — canonical default spec.
- `src/rest/mod.rs` — register routes.

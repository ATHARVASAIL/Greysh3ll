# GreySh3ll regression suite

118 tests across seven suites, plus `npm run audit`, `npm run responsive` and `npm run fullcheck` — an end-to-end driver that boots both real pages and exercises every user flow, reporting any error it triggers. They load the real `js/*.js` sources into a
jsdom window built from the real `assessment.html`, with `localStorage` and
`fetch` replaced by controllable mocks — so they exercise the shipped code,
not a reimplementation of it.

## Running

```bash
cd tests
npm install        # jsdom is the only dependency
npm test
```

`npm run responsive` is separate: it serves the app over HTTP and drives
headless Chromium through six viewports from 320px to 1440px, checking for
horizontal overflow, touch targets below 44px on coarse pointers, and
console errors. It needs `pip install playwright && playwright install
chromium`. jsdom performs no layout, so this is the only check here that
can confirm anything visual.

`npm run fullcheck` is the exhaustive browser pass: 18 viewports from
320px to 1920px including phone landscape, driving every feature at each
one and checking overflow, clipped text, overlay fit, touch targets and
console errors. Run it in batches with
`python3 full_check.py <start> <end>` when a full sweep would take too
long in one go.

By default the suite tests the app in the parent directory. To point it
somewhere else:

```bash
GS_APP=/path/to/vapt-console-hacker npm test
```

## The suites

| File | Tests | Covers |
|---|---|---|
| `core.test.js` | 17 | lazy index/detail loading, shared in-flight requests, toolkit bundle, primer table wrapping, scan ingestion (incl. the port-512 constant), custom cases, chain sequences, remediation model, `ensureAllDetail` progress |
| `storage_safe.test.js` | 15 | `safeStorageSet/Get/Remove/Pref`, quota detection, warn-once behaviour and — the regression that bit us — warning re-arm after a successful save |
| `chunk.test.js` | 18 | `CATEGORY_CHUNK_SIZE`, sentinel insert/remove, IntersectionObserver fallback, chunk arithmetic (no row skipped or duplicated), `ensureItemRendered`, and the Expand-all path |
| `import.test.js` | 21 | `validateProgressPayload` rejection paths, malformed-field reporting, status validation, summary counts, unmatched-ID counting, `applyProgress` |
| `logic.test.js` | 20 | correctness of the numbers an analyst reports: CVSS against published base scores, coverage and N/A handling, risk scoring and remediation discounting, every status chip, all sort modes, report inclusion |
| `ui.test.js` | 14 | regressions from the v1.5 audit: duplicate class attributes, data-sev/data-rem correctness, coverage-tab rendering, reduced-motion, null canvas contexts, prompt handling |
| `csp.test.js` | 13 | CSP meta tags on both pages, `defer` on all scripts, zero inline styles outside the sanctioned PDF report builder, utility classes present, `applyCspStyles` behaviour, placeholder copy consistency |

## Adding a test

`harness.js` exposes `boot({ scripts, page, noIntersectionObserver })`. Because
the app's files are classic scripts, their top-level `const`/`function`
declarations live in script scope rather than on `window` — reach them with
`w.$('EXPR')` to evaluate an expression and `w.$fn('name')(...)` to call a
function. `w.__storage` controls storage failures (`failNext`, `failAlways`,
`failMode`), `w.__toasts` records user-facing warnings, `w.__fetchLog` records
what was actually fetched, and `w.__ios` holds the mock IntersectionObservers
(call `.trigger()` to simulate the sentinel scrolling into view).

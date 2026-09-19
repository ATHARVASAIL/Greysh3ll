<div align="center">

<img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&size=32&pause=1200&color=2F8CFF&center=true&vCenter=true&width=650&lines=GreySh3ll;VAPT+Assessment+Console;524+Test+Cases+%C2%B7+10+Domains;Zero+Backend+%C2%B7+100%25+Client-Side" alt="GreySh3ll" />

**A multi-page, offline-first penetration-testing checklist & assessment console.**

[![Live Demo](https://img.shields.io/badge/%F0%9F%94%97_live_demo-atharvasail.github.io%2Fgreysh3ll-2f8cff?style=for-the-badge)](https://atharvasail.github.io/greysh3ll/)

[![Deploy Status](https://img.shields.io/github/actions/workflow/status/ATHARVASAIL/greysh3ll/deploy.yml?branch=main&label=deploy&logo=github&style=flat-square)](../../actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2f8cff.svg?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.2-blueviolet?style=flat-square)](#-changelog)
[![Backend](https://img.shields.io/badge/backend-none-informational?style=flat-square)](#)
[![Stack](https://img.shields.io/badge/stack-HTML·CSS·vanilla_JS-2f8cff?style=flat-square)](#)
[![Last Commit](https://img.shields.io/github/last-commit/ATHARVASAIL/greysh3ll?style=flat-square&color=2f8cff)](../../commits/main)

</div>

<br>

<div align="center">

**524 test cases · 10 domains · real payloads · zero backend**

</div>

---

## 📑 Table of Contents

- [What is GreySh3ll](#-what-is-greysh3ll)
- [Domains Covered](#-domains-covered)
- [Feature Overview](#-feature-overview)
- [User Manual — How to Use GreySh3ll](#-user-manual--how-to-use-greysh3ll)
  - [1. The Dashboard](#1-the-dashboard)
  - [2. Assessment Mode](#2-assessment-mode)
  - [3. Browsing & filtering the checklist](#3-browsing--filtering-the-checklist)
  - [4. Search & Command Palette](#4-search--command-palette)
  - [5. Working a test case](#5-working-a-test-case)
  - [6. The Analyst Toolkit](#6-the-analyst-toolkit)
  - [7. Progress, XP & badges](#7-progress-xp--badges)
  - [8. Saving, exporting & reporting](#8-saving-exporting--reporting)
  - [9. Themes & keyboard shortcuts](#9-themes--keyboard-shortcuts)
- [Running It Locally](#-running-it-locally)
- [Project Layout](#-project-layout)
- [Editing Test-Case Data](#️-editing-test-case-data)
- [Changelog](#-changelog)
- [Scope & Responsible Use](#-scope--responsible-use)
- [License](#-license)

---

## 🧠 What is GreySh3ll

**GreySh3ll** is a terminal-styled, gamified checklist for running
structured penetration tests. It walks a tester through **524 test
cases across 10 domains** — in the order a real engagement actually
runs: recon first, then application layers, then the human layer last.

Every test case ships with:

| Field | What it gives you |
|---|---|
| **Prerequisites & root cause** | Exactly what access/tools you need, and *why* the flaw exists |
| **Identification steps** | A concrete, ordered checklist to confirm the vulnerability is present |
| **Exploitation walkthrough** | A realistic path from confirmation to proof-of-impact |
| **Real payloads/commands** | Copy-paste-ready — not generic placeholder text |
| **Known variants** | Related flavors of the same weakness you should also check |
| **Mitigation guidance** | Written for both a technical fix and a client-facing explanation |
| **CWE / OWASP / MITRE ATT&CK mapping** | Ready to drop straight into a report |

Everything runs **entirely client-side** — no build step, no backend,
no database. The app `fetch()`s JSON from `data/` and saves your
progress, notes, and flags to your browser's `localStorage`.

---

## 🧩 Domains Covered

| # | Domain | Cases | Focus |
|:-:|---|:-:|---|
| 01 | **NET** | 150 | Network & infrastructure recon, protocol, and configuration testing |
| 02 | **WEB** | 146 | Web application — auth, access control, injection, business logic |
| 03 | **API** | 35 | REST/GraphQL authorization & OWASP API Security Top 10 |
| 04 | **LLM** | 10 | LLM/AI application security — OWASP Top 10 for LLM Apps (2025) |
| 05 | **CLOUD** | 30 | Cloud IAM, storage, and container/orchestration misconfiguration |
| 06 | **MOBILE** | 33 | iOS/Android local storage, binary protection, network communication |
| 07 | **THICK** | 28 | Desktop/native client binaries, local storage, IPC |
| 08 | **WIFI** | 26 | Wi-Fi & short-range RF layer attacks |
| 09 | **SRC** | 35 | White-box source code review |
| 10 | **SOCIAL** | 19 | Human-layer & physical security — phishing, vishing, BEC/invoice fraud, pretexting, physical access |

> API, LLM, CLOUD, MOBILE, THICK, WIFI, SRC, and SOCIAL are actively
> being expanded to close the gap with NET/WEB. SOCIAL was the first
> pass (14 → 19); see the [Changelog](#-changelog).

---

## ✨ Feature Overview

<table>
<tr>
<td width="50%" valign="top">

**🎯 Assessment Mode**
Walk all 524 cases one at a time, in engagement order, with a live
progress counter.

**🔍 Command Palette & Dashboard Search**
`Ctrl/Cmd + K` in the Workspace, or search straight from the Dashboard —
either jumps to a test case by name, ID, or CWE and opens the Workspace
pre-filtered.

**🧭 Smart Continue**
The Dashboard's main CTA isn't generic — it finds whichever domain
you're partway through (or the next untouched one) and routes you
straight there.

**🧰 Analyst Toolkit**
Built-in CVSS calculator, payload cheat-sheet, and OSCP-style drills.

**🏆 Gamification**
XP, streaks, levels, and unlockable badges to track engagement progress.

</td>
<td width="50%" valign="top">

**📐 Collapsible Sidebar & Hero**
The Workspace sidebar collapses to a slim icon rail so the checklist
gets full width; the Dashboard's identity card collapses to a strip
once your name is saved — both remembered across visits.

**⚡ Lazy-Rendered Categories**
Domain sections start collapsed and don't build their item rows until
you actually expand them — the difference between an instant click and
rendering 150 rows (NET) you can't even see yet.

**💾 Export / Import**
Save progress as JSON, export findings as CSV, print a client-ready PDF.

**🎨 Light / Dark Themes**
Fully responsive, print-friendly, and easy on the eyes during long
engagements.

**🗂️ Structured Assessor Notes**
Per-item findings, evidence links, PoC details, and affected endpoints.

**⚡ Zero Setup**
No install, no build, no server — open it and start testing.

</td>
</tr>
</table>

---

## 📖 User Manual — How to Use GreySh3ll

GreySh3ll is two pages, not one long scroll:

| Page | What it's for |
|---|---|
| **`index.html`** — Dashboard | Your identity, overall coverage, severity breakdown, and a card per domain. This is where you land and decide what to work on. |
| **`assessment.html`** — Workspace | The actual full-screen checklist — search, filters, the 524 test cases, Assessment Mode, and every modal (Toolkit/Badges/Stats/Command Palette). |

### 1. The Dashboard

Open the [live dashboard](https://atharvasail.github.io/greysh3ll/) (or
run it locally — see [below](#-running-it-locally)). On first load:

1. Click **Edit** on the hero identity card to set your display name,
   subtitle, and tagline, or upload/generate an avatar. This is purely
   cosmetic and saved locally. The card **collapses to a slim strip**
   automatically once you save it (or on your next visit) — click the
   collapse arrow any time to expand it again.
2. Check the **coverage ring** and **severity breakdown** for an
   at-a-glance read on where the engagement stands.
3. Use the **Continue Testing** button to jump straight to wherever
   you left off, or the **search box** to jump straight to a specific
   test case, or click any category card to open the Workspace
   pre-filtered to that domain (`assessment.html?domain=WEB`).
4. Your progress starts at **0 / 524** — everything else is ready to go.

### 2. Assessment Mode

This is the recommended way to run a real engagement, from the Workspace:

1. Click **Assessment Mode** (in the sidebar or via the command palette).
2. GreySh3ll presents test cases **one at a time**, in the built-in
   engagement order — network recon first, human-layer testing last.
3. For each case, read the **prerequisites → identify → exploit →
   mitigate** flow, mark it **Pass / Fail / Not Applicable / Flagged**,
   and move to the next.
4. The counter in the top bar (`Test X / 524`) tracks exactly where you
   are — close the tab and come back later, your position is saved.

### 3. Browsing & filtering the checklist

Prefer to jump around instead of going in order? Use the sidebar:

- **Domain filter** — show only NET, WEB, LLM, etc.
- **Severity filter** — Critical / High / Medium / Low.
- **Status filter** — Not Tested / Pass / Fail / N/A / Flagged.
- **Domain context panel** — add engagement-specific notes (scope,
  target details, authorization reference) per domain, so context
  travels with the findings.
- **Collapse the sidebar** — the icon in the sidebar header shrinks it
  to a slim rail so the checklist takes the full width; click again to
  bring back the full domain list. Your preference is remembered.

Filters combine — e.g. "LLM domain, Critical severity, Not Tested" to
see exactly what's left to check in that category. Domain sections
themselves start collapsed too — click a section header to expand it
and load its test cases.

### 4. Search & Command Palette

Press **`Ctrl/Cmd + K`** anywhere in the Workspace to open the command
palette, or use the search box on the Dashboard before you even open
it. Either way, type a test-case name, ID (`LLM-003`), or CWE
(`CWE-1427`) to jump straight to it — much faster than scrolling for a
specific finding mid-engagement.

### 5. Working a test case

Click any test case to expand its full detail panel:

- **What it is / root cause / impact** — the theory, kept short.
- **Steps to identify** — numbered, in the order you'd actually check them.
- **Exploitation steps** — a realistic walkthrough to proof-of-impact.
- **Example payloads** — each labeled and ready to copy with one click.
- **Variants** — related flavors of the same weakness worth checking too.
- **Mitigation** — numbered fixes you can lift directly into a report.
- **Assessor Notes** — your own findings, evidence links, PoC details,
  and affected endpoints, saved per test case.

Mark the case **Pass**, **Fail**, **N/A**, or **Flagged** from the same
panel — flagged items surface in the dashboard for later follow-up.
Marking a status only updates that one row and its category's counts —
it doesn't reload or collapse the rest of the list.

### 6. The Analyst Toolkit

Open it from the top bar (**Toolkit**) for quick reference without
leaving the app:

- **Coverage & Risk** — live engagement scorecard: coverage % per domain
  (excluding cases marked N/A), a severity-weighted risk score that discounts
  findings you have verified as fixed or risk-accepted, untested high/critical
  gaps, and a remediation status breakdown.
- **CVSS Calculator** — score a finding and get the vector string instantly.
- **Payload Cheat-Sheet** — a quick-reference index of common payloads
  across domains, independent of Assessment Mode.
- **OSCP-style Drills** — short practice scenarios to sharpen specific
  techniques between real engagements.
- **Scan Import** — paste raw Nmap/Nuclei/Burp output; it's parsed and
  matched against the 524 test cases by port/service and finding-name
  keywords, ranked by confidence, with a one-click "Add as evidence."
- **Attack Chains** — link findings that chain together ("A enables
  B"), with multi-hop sequences auto-grouped for the report.
- **Custom Cases** — add your own test cases alongside the built-in
  524, scoped to the current engagement.

### 7. Remediation & retest tracking

A finding's life does not end when you confirm it: it gets reported, the client
fixes or accepts it, and it gets retested — often weeks later. Any test case
marked **Fail** gains a remediation block in its notes with six states (Open,
In Remediation, Ready to Retest, Fixed, Risk Accepted, Still Vulnerable), a
retest date (auto-filled when you record a verification outcome) and a retest
note. This is a separate axis from test status, so the historical finding stays
intact while its remediation state moves on. Remediation data flows into the
PDF report, the CSV export, the JSON backup, and the Coverage & Risk scorecard.

### 8. Progress, XP & badges

Every completed test case earns XP; consecutive days of activity build
a streak. Open **Badges** in the top bar to see:

- Your current **level** and XP toward the next one.
- Your **current streak** and longest streak.
- **Unlocked badges** for milestones (first domain cleared, 100 cases
  done, all criticals resolved, etc.).

This is designed to make long, repetitive assessments — hundreds of
checks across ten domains — noticeably less tedious.

### 8. Saving, exporting & reporting

- **Save** (top bar) — exports your entire progress state (statuses,
  notes, flags, identity) as a JSON file. Reload it anytime via
  **Import** to resume on another device or after clearing your browser.
- **CSV** — exports all findings (status, severity, domain, notes) as a
  spreadsheet-ready CSV.
- **Report** — generates a proper client-ready report (cover page,
  executive summary, risk-by-severity breakdown, detailed findings for
  anything failed or flagged, and a full test-coverage appendix), then
  opens the browser's print dialog — choose **Save as PDF**. This isn't
  a printout of the app UI; it's a purpose-built document with its own
  typography, meant to be handed to a client as-is.

> Nothing is ever sent anywhere. Export/import is local file I/O only —
> there is no server component to leak data to.

### 9. Themes & keyboard shortcuts

- Toggle **light/dark** via the sun/moon icon in the top bar (works the
  same on both pages, and stays in sync between them).
- `Ctrl/Cmd + K` — Command Palette
- `Esc` — close any open modal, panel, or the mobile sidebar drawer
- Arrow keys — step through cases while in Assessment Mode

---

## 🖥️ Running It Locally

Because the app `fetch()`s JSON files from `data/`, opening `index.html`
directly via `file://` will fail in most browsers (CORS). Serve the
folder instead:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works equally well — `npx serve`, VS Code's Live
Server extension, etc. No dependencies, no build step, no `npm install`.

---

## 📁 Project Layout

<details>
<summary><strong>Click to expand full file structure</strong></summary>

```
index.html                     Dashboard — identity, coverage, category cards
assessment.html                Workspace — full-screen checklist, all 524 cases

css/
  base.css                     design tokens (:root), reset, base type
  layout.css                   ambient backdrop, modals, topbar, hero
                                identity block, page grid, main toolbar
  components.css               category sections, test-item cards, the
                                5-value status system, domain context
                                panel, structured assessor notes,
                                Dashboard stat/ring/domain-card styles
  responsive-performance.css   breakpoints (1400/980/768/600/420px),
                                mobile nav-drawer, reduced-motion, print
  theme-extras.css             light theme overrides + badges, Analyst
                                Toolkit modal, command palette, drills,
                                collapsible hero/sidebar-rail styles

js/
  storage.js                   constants, persistence, identity/profile
                                storage — no DOM access
  filters.js                   pure filter/sort logic over test-case data
  search.js                    search box + command palette (Ctrl/Cmd+K)
  dashboard.js                 Workspace stats + gamification (XP,
                                streaks, badges) — not loaded on index.html
  core.js                      shared `state`, constants, small render/
                                format helpers — load before the rest
  rendering.js                 profile bar, time tracker, sidebar, the
                                lazy-rendered category/detail-panel renderer
  interactions.js              event binding, in-place status/flag
                                updates, sidebar collapse (drawer + rail),
                                theme toggle, keyboard shortcuts
  assessment.js                Assessment Mode, toast notifications,
                                export/import, domain context editor
  toolkit.js                   Analyst Toolkit (CVSS calculator, payload
                                cheat-sheet, OSCP-style drills)
  effects-identity.js          particle/confetti canvases + the hero
                                identity block (editable name/subtitle/
                                tagline, avatar) — shared by both pages
  boot.js                      boot() — reads ?domain=/?search= from the
                                URL, sets default collapsed state, first
                                render (assessment.html only)
  home.js                      Dashboard-only boot + stats/ring/domain-card
                                rendering + smart Continue CTA + search box
                                + collapsible hero (index.html only —
                                does not load the Workspace files above)

data/
  net.json, web.json, api.json, llm.json, cloud.json, mobile.json,
  thick.json, wifi.json, src.json, social.json
                                one file per domain (see table above).
                                Each item has: id, title, domain, phase,
                                sequence, cwe, severity/severityLabel,
                                whatItIs, rootCause, impact,
                                prerequisites, stepsToIdentify[],
                                exploitationSteps[], examplePayloads[]
                                ({label, command}), variants[],
                                mitigation[], reference, assessorNotes,
                                flagged

.github/workflows/deploy.yml   GitHub Actions → GitHub Pages deployment
                                (auto-runs on every push to main)
```

> **Load order matters.** CSS files override earlier selectors in the
> order listed. JS files are plain scripts (not ES modules) sharing one
> global scope on purpose — a file may reference state/functions
> defined in any file listed above it in the page's `<script>` order,
> never below. `index.html` and `assessment.html` intentionally load
> **different** subsets of `js/` for exactly this reason — see the
> per-file notes above.

</details>

To add or remove a domain, register it once in `CATEGORIES` in
`js/storage.js` and drop a matching `data/<code>.json` file — every
other part of the app (loader, filters, search, dashboard, category
cards) picks it up automatically.

---

## ✏️ Editing Test-Case Data

Every domain file in `data/` follows the same schema (see `net.json`
for the reference item shape). When adding or editing a test case, keep
`stepsToIdentify`, `exploitationSteps`, `examplePayloads`, and
`mitigation` specific to that exact vulnerability — the checklist's
value is entirely in the payloads/commands being real and runnable, not
generic boilerplate. New items should match the depth of the existing
ones: 6 identification steps, 6 exploitation steps, 6 labeled payloads,
4–5 variants, and correct CWE/OWASP/MITRE references — not padding.

---

## 📋 Changelog

- **Scan-output ingestion, attack chains, custom test cases, and
  evidence attachments.** Toolkit now has three new tabs: **Scan
  Import** parses pasted Nmap (XML/greppable/text), Nuclei (JSON
  Lines), or Burp (XML) output client-side and suggests which test
  cases it gives you evidence for, one click adds the match as a
  finding; **Attack Chains** lets you link findings together ("A
  enables B") and auto-groups multi-hop links into sequences, included
  as their own section in the PDF report; **Custom Cases** lets you
  add client-specific or emerging techniques alongside the built-in
  524, scoped per engagement and included in every export. Assessor
  Notes also gained **Evidence Attachments** — screenshots are
  compressed client-side and embedded directly in the printed report.
  Nothing here leaves your browser; scan parsing and image processing
  both run locally.

- **Rebuilt the Print/PDF report from scratch.** "Print" used to just
  print the interactive checklist UI as-is — and with category
  sections now collapsed by default for performance, that meant it was
  actually printing mostly-empty collapsed headers. Replaced it with a
  real report generator: a cover page (tester, date, scope, completion
  %), an executive summary (risk-by-severity table, engagement details
  pulled from the domain context notes if filled in), a full coverage
  table per domain, a **Detailed Findings** section covering only
  failed/flagged test cases (with description, impact, assessor
  findings, PoC, affected endpoints, and mitigation — the actual
  report content, not a UI dump), and an appendix with the complete
  test log for audit purposes. Styled with proper print typography
  (serif headings, `@page` margins, page-break rules) instead of
  reusing the on-screen dark-terminal theme, which doesn't translate
  to paper. Verified by actually executing the generator with sample
  data rather than just reading the code — confirmed passed/non-flagged
  items are correctly excluded from Findings but still appear in the
  appendix, and that failed/flagged items carry through every field.
  Also gave "Save as PDF" a proper suggested filename instead of the
  app's generic page title, and renamed the JSON/CSV export files from
  the old `vapt-*` naming to `greysh3ll-*`.
- **Fixed severely cramped text in Assessment Mode on mobile** (and the
  same bug in Stats, Badges, and Toolkit). Assessment Mode renders test
  case content inside its own modal wrapper, which has its own padding
  — and that padding was never reduced for mobile, so it was stacking
  on top of the detail panel's own (already mobile-optimized) padding
  nested inside it. On a ~360px phone that added up to roughly 90px of
  pure padding on each side before any text started, which is exactly
  why only 4–5 words fit per line despite the card looking reasonably
  wide. Reduced the outer modal padding at both mobile tiers across all
  four modals that share this structure.
- **Fixed invisible text while editing the identity name in dark
  theme.** The name field uses a gradient `background-clip:text`
  effect for its color, and the "you're editing this" highlight style
  was unintentionally overriding that gradient background with a
  near-invisible flat tint — while the text's actual fill color stayed
  fully transparent, so typed text had nothing to render against.
  Confirmed (via CSS specificity, not just guessing) why this was
  dark-theme-specific: light theme's own more-specific override
  happened to protect it by accident, dark theme's didn't. Also swept
  for the same class of bug elsewhere (hardcoded colors that don't
  adapt to theme, other gradient-text tricks) — found none.
- **Full architecture/logic/accessibility audit.** Verified (by actually
  executing both pages' complete script bundles in their real load
  order, not just reading them) that there are zero broken file paths
  and zero reference-before-definition bugs. Traced every genuine
  user-input path (identity, notes, search, domain context, profile
  names) for XSS — all properly escaped or using safe `.textContent`/
  `.value` APIs. Found and fixed **12 icon-based buttons with no
  `aria-label`** across both pages — several of these lose their only
  visible text specifically on mobile (where a `.lbl` span gets
  `display:none`'d to save space), which meant screen-reader users on
  mobile had no accessible name for Toolkit, Stats, Badges, Import,
  Export, Print, Expand-all, Assessment Mode, and the profile
  rename/delete buttons. Also removed genuinely dead CSS left over from
  earlier restructuring — `.hstat`/`.identity-stats` (hero stats moved
  to the Dashboard's stat cards) and `.xp-top-row`/`.xp-track`/
  `.xp-fill` (the old full-size XP bar, replaced by the compact
  workspace-strip version) — confirmed zero remaining references
  before deleting each one.
- **Restructured every test case's detail panel into collapsible
  chapters** (Overview / Test Steps / Payloads / Variants & Mitigation)
  to cut mobile scroll length — Status and Assessor Notes stay always
  visible since they're the active interaction points. Also fixed the
  Prerequisites callout stacking its badge above the text on narrow
  screens instead of squeezing the reading column down to a handful of
  words per line, and trimmed redundant nested padding. Applies
  everywhere the detail panel renders — the main list and Assessment
  Mode share the same function, so both got the fix at once.
- Expanded **SOCIAL** from 14 → 19 cases (BEC/CEO-fraud wire transfer,
  vendor invoice fraud, malicious recruiter/job-applicant pretexts,
  front-desk/reception pretexting, fake internal-audit requests).
  API, LLM, CLOUD, MOBILE, THICK, WIFI, and SRC are next.
- **Removed the actual root cause** of sections staying blank until an
  unrelated click: category sections relied on an IntersectionObserver
  to reveal themselves (`opacity:0` until a JS-added class arrived),
  which isn't reliably immediate on every browser. Replaced with a
  self-contained CSS animation that plays automatically and always
  ends visible, with no async trigger to depend on.
- **Assessment Mode is now filter-aware** — if the Workspace is scoped
  to a domain (e.g. arriving via `assessment.html?domain=WEB`),
  Assessment Mode walks only that domain's cases in sequence, instead
  of always cycling through all 524 regardless of context.
- Removed a **duplicate Assessment Mode entry point** — a floating
  action button did the exact same thing as the toolbar's "Start
  Assessment Mode" button; kept only the toolbar one plus the
  distinct "jump to next incomplete test" FAB.
- Fixed the sidebar's collapse-to-rail button genuinely overlapping
  the profile-bar row on desktop (the sidebar's top padding was
  smaller than the absolutely-positioned button's footprint), and
  redesigned the collapsed rail view — it was cramming "10. SOCIAL"
  into a fixed 40px box; it now shows a clean, auto-sized short code
  with the full domain name available on hover.
- Fixed the category header row overflowing on narrow phones (a fixed
  120px severity bar plus a non-shrinking count left almost no room
  for the domain name/description) — it now wraps onto its own row
  below the title at ≤600px.


- Added the **LLM domain** (10 cases, mapped to the OWASP Top 10 for
  LLM Applications 2025).
- Rebranded from green to a blue accent theme, including a full audit
  that turned up several stray/unclosed CSS comments silently dropping
  entire rulesets (a broken breakpoint, a broken light-theme override,
  and a couple of individual component rules).
- Split the single page into **two pages** — `index.html` (Dashboard)
  and `assessment.html` (Workspace) — with a defensively-scoped script
  split so the Dashboard never loads the Workspace's DOM-dependent files.
- Made the Workspace sidebar collapsible (mobile drawer + backdrop +
  Esc-to-close, and a desktop icon-rail mode), and the Dashboard's hero
  identity card collapsible.
- **Lazy-rendered category sections**: domains start collapsed and
  don't build their item rows until expanded — fixed the real
  performance cost of opening large domains like NET (150) and WEB
  (146), and removed a `content-visibility:hidden` rule that could
  leave freshly-rendered content unpainted until an unrelated click.
- Status/flag/checkbox changes on a test case now patch just that item
  and its category header in place instead of re-rendering the entire
  524-case list.
- Fixed the Expand/Collapse-all toggle's label being out of sync with
  actual state, and a hero-card button that was rendering directly on
  top of another button at the same coordinates.
- Added the **smart Continue Testing** CTA and a **Dashboard search
  box** that jumps straight into the Workspace, pre-filtered.
- Fixed global link underlines (`a{}` was resetting color but not
  `text-decoration`).

---

## 🔒 Scope & Responsible Use

GreySh3ll is a **checklist and knowledge tool**, not a scanner or
exploit framework — it doesn't touch a network or target on its own.
It's built to sit next to Burp Suite, Nmap, etc. during an authorized
engagement, as the structured methodology layer. Nothing here should be
run against systems you don't have explicit written authorization to
test.

---

## 📜 License

MIT — see [LICENSE](LICENSE). Use it, fork it, adapt it for your own
methodology.

<div align="center">

<sub>Built for the offensive security community, one domain at a time.</sub>

</div>

## Mobile layout notes

Two things in this UI were rebuilt specifically because they failed on a phone
and looked fine on a desktop:

- **Primer comparison tables stack into labelled cards below 768px.** A sticky
  first column with horizontal scroll was tried first and removed — on a ~400px
  screen the pinned label column occluded the next one and sliced text
  mid-word. Column headings are injected as `data-label` attributes at render
  time (`preparePrimerHtml`), so each stacked row keeps its heading and nothing
  scrolls sideways.
- **The floating action button fades while scrolling.** Being fixed over the
  bottom-right of the content column, it sat on top of text being read. It
  returns to full opacity on scroll-stop, hover or focus, stays clickable while
  dimmed, and does not dim at all under `prefers-reduced-motion`.

## Accessibility: colour contrast

Every text colour in the palette is verified against WCAG AA (4.5:1) on all five
surfaces in the elevation scale. On a dark palette this genuinely needs checking
by number rather than by eye — three tokens shipped below the requirement for
months (`--text-faint` was at 1.62:1) because low contrast reads as "subtle"
rather than as broken until you try to use the app in daylight.

```
python3 tools/check-contrast.py
```

It exits non-zero on failure, so it can gate a commit. Re-run it after touching
the palette in `css/base.css` or the status colours in `js/storage.js` — the
latter duplicate the tokens as hex and are checked too, since they drift.

## Data build step

The editable source of truth is `data/*.json` (one file per domain). The app
does **not** read those directly at runtime — it reads two generated artifacts:

- `data/index.json` — every test case with light fields only (~228 KB), fetched on startup
- `data/detail/<domain>.json` — the heavy fields, fetched per domain on first use

After editing any source file, regenerate them:

```
python3 tools/build-data.py
```

This dropped the upfront payload from ~3 MB to ~228 KB (92% less) — the app is
interactive before most of the content has been downloaded, and a domain's
detail arrives only when something actually opens it.

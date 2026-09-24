# Contributing to GreySh3ll

Contributions are welcome, and content contributions are the most useful
kind. The test-case corpus reflects one person's methodology, so coverage is
uneven — if a domain you work in is thin, that is exactly where help counts.

## Before you start

Open an issue describing what you intend to add or change. For test-case
content, say which domain and roughly what the case covers, so two people
don't write the same thing.

## Editing test-case content

Domain files live in `data/*.json`. Edit those, never `data/index.json`,
`data/toolkit.json` or `data/detail/*` — those are generated. After editing:

```bash
python3 tools/build-data.py
```

Every case is held to a measured standard, not a subjective one. A new case
must have:

- All prose fields populated: `whatItIs`, `rootCause`, `impact`,
  `prerequisites`
- At least 6 `stepsToIdentify` and 6 `exploitationSteps`
- At least 6 `examplePayloads`, 4 `variants` and 6 `mitigation` entries
- A CWE reference, a standard, tools, and links
- No prose field averaging over 50 words per sentence
- No substantial overlap with an existing case

Write in plain, specific prose. Say what the weakness actually is and why it
exists, rather than restating the title at greater length. Where a test
touches real people or third parties, state the scope constraints in
`prerequisites` rather than leaving them implied.

## Code changes

```bash
cd tests && npm install && npm test   # 118 tests
npm run audit                         # end-to-end driver over both pages
python3 tools/check-contrast.py       # WCAG AA gate
```

All three must pass. Conventions worth knowing:

- No inline `style="..."` attributes — the CSP has no `unsafe-inline`.
  Use a utility class or a `data-*` attribute with a CSS rule.
- Never put two `class` attributes on one element. HTML keeps the first and
  silently drops the second; this has caused real visual bugs here before.
- Colours come from the design tokens in `css/base.css`. A hardcoded hex
  that duplicates a token will drift from it.
- Don't restate the case count or domain counts in code — derive them from
  the data. They have gone stale before.

## Pull requests

Keep them focused. Describe what changed and how you verified it. If you
fixed a bug, a test that would have caught it is the most valuable part of
the change.

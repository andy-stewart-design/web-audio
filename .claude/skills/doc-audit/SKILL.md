---
name: doc-audit
description: Audit the Drome user-facing docs against the current source code. Produces a prioritized checklist of hard gaps (undocumented API) and soft gaps (incomplete coverage). Use when the API has changed, new features have been added, or you want a periodic check on doc health.
---

# Doc Audit

Audit the current state of `/docs` against the source code and produce a prioritized checklist of what needs attention.

## Process

1. **Read the doc structure** — list all files under `./docs/`
2. **Read the full public API surface** by exploring the source packages. Start from each package's `index.ts` to identify public exports, then follow those exports into their source files to understand the full method surface, parameters, and types. Packages to cover: `@web-audio/fluid`, `@web-audio/clock` (concepts only — clock is not a user-facing API), `@web-audio/patterns`, `@web-audio/schema`
3. **Read every doc file** under `./docs/`
4. **Cross-reference** source against docs to identify gaps

## What to check

### Hard gaps (source not documented)

- Exported methods or classes with no coverage in any doc file
- Method parameters that are not described anywhere
- Types or concepts referenced in source (e.g. `ScaleAlias`, `CycleInput`, `Waveform`) with no glossary or guide entry
- Items documented that no longer exist in source (stale docs)

### Soft gaps (incomplete coverage)

- Methods documented but with no code example
- Parameters listed but not explained (what values are valid? what does it default to?)
- Concepts mentioned but not linked to an explanation (e.g. "euclid rhythm" referenced without a guide entry)
- Guide pages missing a summary or introduction section
- Glossary terms used in guides but not defined in `concepts/glossary.md`

## Output format

Produce a markdown checklist, hard gaps first. Be specific — include the file and method/concept name for each item. Do not include items that are already covered.

```markdown
## Hard gaps

- [ ] `Instrument.xox()` — no coverage found in any guide page
- [ ] `Envelope.adsr()` parameters — `attack`, `decay`, `sustain`, `release` not described in effects.md
- [ ] `Waveform` type — values (`sine`, `square`, `sawtooth`, `triangle`) not listed in glossary or synthesizers.md

## Soft gaps

- [ ] `synthesizers.md` — no example comparing waveform sounds
- [ ] `patterns-in-practice.md` — `euclid()` rotation parameter not explained
- [ ] `glossary.md` — missing entry for `RandomCycle`
- [ ] `effects.md` — `lpf()` / `hpf()` / `bpf()` shorthands not mentioned (only `filter()` is documented)
```

Keep the checklist actionable — each item should be specific enough that someone can resolve it without further investigation.

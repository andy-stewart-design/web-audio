# Documentation Plan

## Goals

1. **Catch up** — produce a complete first draft of user-facing docs for the current API
2. **Stay current** — lightweight process for keeping docs in sync as the API evolves

## Approach

- Docs are hand-authored markdown, AI-assisted (near-publishable drafts, human reviews/edits)
- No TypeDoc or automated generation from source — the doc structure follows how users think, not how the code is organized
- All code examples are written for the REPL context: `d` is pre-instantiated, no import statements

## Audience

Users experience Drome in a browser-based REPL. They type expressions like `d.synth().notes(60).push()`, hit play, and hear the output. Documentation should reflect this — no setup instructions, no install steps.

## Repository Structure

```
./docs/                          ← lives here until the docs site (apps/docs) exists
  getting-started.md
  concepts/
    live-coding.md               ← philosophy, why Drome exists
    patterns.md                  ← how to think about cycles/patterns conceptually
    clock.md                     ← how the clock drives everything (concepts only, no API ref)
    glossary.md                  ← drawn from LEXICON.md + UBIQUITOUS_LANGUAGE.md
  guides/
    synthesizers.md              ← waveforms, oscillator behavior, inline method ref
    instruments.md               ← shared instrument methods (notes, euclid, hex, etc.), inline method ref
    effects.md                   ← filters (lp/hp/bp), envelope modulation, inline method ref
    patterns-in-practice.md      ← euclid, hex, xox, sequence — practical usage with examples
    randomness.md                ← rand(), RandomCycle, nondeterminism
```

Method references are inline on the relevant guide pages (no separate reference section). The clock has a concepts entry only — users never interface with AudioClock directly.

## Catch-Up Workflow

Generate pages in this order (each page is a separate AI-assisted pass):

1. **Glossary** — terminology underpins everything else; source from LEXICON.md + UBIQUITOUS_LANGUAGE.md
2. **Concepts** — live-coding, patterns, clock
3. **Guides** — synthesizers, instruments, effects, patterns-in-practice, randomness
4. **Getting started** — written last, once the full picture is clear

Per-page context to provide:
- Relevant source files (e.g. `instrument.ts`, `synthesizer.ts` for the instruments guide)
- `LEXICON.md` and `UBIQUITOUS_LANGUAGE.md` for terminology
- This plan for structural context

## Ongoing Maintenance

A custom Claude Code skill (`/doc-audit`) reads the current source and docs and outputs a prioritized checklist:

- **Hard gaps** — API surface in source with no doc coverage, or documented items that no longer exist
- **Soft gaps** — incomplete coverage (missing examples, undocumented parameters, referenced concepts not explained)

Run it manually after significant API changes, or periodically when the codebase has evolved. The output is a markdown checklist to work through directly or paste into a GitHub issue.

No CI enforcement for now — add process if manual maintenance proves insufficient.

---
name: refine-context
description: Extract a DDD-style glossary from the current conversation, flagging ambiguities and proposing canonical terms. Saves to CONTEXT.md. Use when user wants to define domain terms, build a glossary, harden terminology, create a ubiquitous language, or mentions "domain model" or "DDD".
disable-model-invocation: true
---

# Refine Context

Extract and formalize domain terminology from the current conversation into a consistent glossary, saved to a local file. If this is invoked at the beginning of the session, scan the codebase and propose updates.

## Process

1. **Scan the conversation** for domain-relevant nouns, verbs, and concepts
2. **Identify problems**:
   - Same word used for different concepts (ambiguity)
   - Different words used for the same concept (synonyms)
   - Vague or overloaded terms
3. **Propose a canonical glossary** with opinionated term choices. Get user approval before making edits.
4. **Write to `CONTEXT.md`** in the working directory using the format below
5. **Output a summary** inline in the conversation

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others as aliases to avoid.
- **Flag conflicts explicitly.** If a term is used ambiguously in the conversation, call it out in the "Flagged ambiguities" section with a clear recommendation.
- **Only include terms relevant for domain experts.** Skip the names of modules or classes unless they have meaning in the domain language.
- **Keep definitions tight.** One sentence max. Define what it IS, not what it does.
- **Show relationships.** Use bold term names and express cardinality where obvious.
- **Only include domain terms.** Skip generic programming concepts (array, function, endpoint) unless they have domain-specific meaning.
- **Group terms into multiple sections** when natural clusters emerge (e.g. by subdomain, lifecycle, or actor). Each group gets its own section. If all terms belong to a single cohesive domain, one section is fine — don't force groupings.

## Re-running

When invoked again in the same conversation:

1. Read the existing `CONTEXT.md`
2. Incorporate any new terms from subsequent discussion
3. Update definitions if understanding has evolved
4. Re-flag any new ambiguities
5. Rewrite the example dialogue to incorporate new terms

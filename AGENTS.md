## When working in Typescript

- When adding a package to a project, add it with an install command instead of manually editing `package.json` directly.
- Run check/format/lint commands when you’re done making a change. If they don't exist, suggest making them for the project you're in.
- Avoid explicit return types unless absolutely needed.
- Casting with `as any` should be a last resort. Always use real type safety. Lean on type inference instead of manually writing new types.
- Avoid running the `dev` command. If you really need to, ask first.

## When writing functions

- Bias towards function declarations for named functions, reserving arrow function expressions primarily for callbacks and closures
- Avoid explicit return types unless absolutely needed. Bias towards implicit return types.

## In general

- When asking questions, ask them one at a time.
- Read the full contents of a file every time, never subsets so you don't miss important context.

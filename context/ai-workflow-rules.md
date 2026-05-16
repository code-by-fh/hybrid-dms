# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven workflow. The context files define
what to build, how to build it, and the current state of progress. Always implement against
these specs. Do not infer or invent behavior that is not defined here.

When a requirement is ambiguous, resolve it in the relevant context file first, then
implement. When a requirement is missing, add it as an open question in
`progress-tracker.md` before writing any code.

## Scoping Rules

- Work on one feature unit at a time.
- A unit is a self-contained change that can be verified end-to-end without depending on
  unfinished work elsewhere.
- Do not combine unrelated concerns in one implementation step (e.g., UI changes +
  sync engine changes = two steps, not one).
- Prefer small, verifiable increments over large speculative changes.
- Do not add features, error handling, or abstractions beyond what the current unit
  requires.

## When to Split Work

Split an implementation step if it touches more than one of:

- Main process (IPC handlers, services, database)
- Renderer UI (components, state, layout)
- Preload bridge (new IPC channel exposure)
- Build / packaging config

Or if it introduces a new architectural pattern not yet established in the codebase.
Or if the change cannot be fully verified within the scope of the current task.

## Process / IPC Boundary

- Any new data flow from renderer to main requires:
  1. A new IPC channel registered in `main.ts`
  2. The channel exposed in `preload.ts`
  3. The call made via `window.electronAPI` in the renderer
- Never shortcut this by reaching across the boundary directly.

## Handling Missing Requirements

1. Stop before implementing.
2. Add the open question to `progress-tracker.md` under "Open Questions".
3. Propose the two most reasonable resolutions.
4. Wait for a decision before continuing.

Do not pick a resolution unilaterally and continue.

## Protected Files

Do not modify the following unless explicitly instructed:

- `src/index.css` token definitions — only update when a new design token is formally
  defined in `ui-context.md`.
- `src/preload/preload.ts` — only update when a new IPC channel is formally added to
  the architecture.
- `context/*.md` — update these to reflect changes, but never use them to justify
  undocumented behavior.

## Keeping Docs in Sync

After any meaningful implementation change, update the relevant context file before
moving to the next unit:

- New or changed IPC channel → `architecture.md` (IPC inventory table)
- New or changed data model → `architecture.md` (storage model)
- New code pattern established → `code-standards.md`
- New or changed feature → `project-overview.md` (features/scope)
- New UI token or layout pattern → `ui-context.md`
- Completion of a unit → `progress-tracker.md`

## Verification Before Moving On

Before marking a unit complete:

1. The feature works end-to-end within its defined scope.
2. No invariant defined in `architecture.md` is violated.
3. `npm run build` passes without type errors.
4. `progress-tracker.md` is updated to reflect the completed work.
5. Any new open questions raised during implementation are recorded.

Do not claim a unit is complete based on code structure alone — verify the actual
behavior runs correctly (build, start, exercise the path).

## Do Not

- Do not refactor surrounding code while implementing a feature unit.
- Do not rename files or symbols outside the scope of the current task.
- Do not add logging, comments, or documentation beyond what is needed for the
  current unit.
- Do not use `any` in TypeScript to make a type error go away — fix the type.
- Do not skip the IPC pattern because a direct Node.js call would be simpler.
- Do not commit half-finished implementations.

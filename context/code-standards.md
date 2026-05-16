# Code Standards

## General

- Keep modules small and single-purpose. One service = one concern.
- Fix root causes — never layer workarounds or add compatibility shims.
- Do not mix main-process concerns with renderer concerns in one file.
- No features, abstractions, or error handling for scenarios that cannot happen.

## TypeScript

- Strict mode is required throughout (`"strict": true` in tsconfig).
- No `any` unless interfacing with an untyped third-party API; add a comment explaining why.
- All async functions use `async/await`. No raw `.then()` chains.
- Define types inline (`interface` / `type`) close to their usage. Shared types go in a
  dedicated types file if used across more than two modules.
- Validate unknown external input (Ollama API response, IPC payloads) at the boundary
  before trusting it.

## Electron / IPC

- IPC channel names use `kebab-case` strings (`save-and-move`, `get-documents`).
- Every handler is registered once in `main.ts` at startup — never dynamically.
- Handlers return plain serializable values. On error, return `{ error: string }`.
  Never throw across IPC boundaries.
- The renderer calls `window.electronAPI.*` only — never accesses Node APIs directly.
- The preload contains zero business logic — it is a typed bridge only.

## React

- Functional components only. No class components.
- Props typed with an `interface` defined directly above the component.
- State management: `useState` / `useEffect` / `useCallback`. No external state library.
- Context is used only for cross-cutting concerns (theme). Not as a global store.
- Components do not call `window.electronAPI` inside `useEffect` ad-hoc — all
  data-fetching calls are coordinated from `App.tsx`.
- No deep prop drilling beyond two levels — lift state or restructure.

## Database

- All SQL lives in `src/main/db/index.ts`. No inline SQL in services or handlers.
- Use `better-sqlite3` synchronous API throughout — do not wrap in Promises.
- FTS5 index updates happen in the same statement batch as the document record.
- Settings are always read fresh from DB per IPC call — never cached in memory.

## Services

- Service files (`aiService.ts`, `ocrService.ts`, etc.) export named async functions.
- No singleton classes unless state is strictly required (e.g., the chokidar watcher).
- Services catch all errors internally, log them, and return a result or `null`.
  They do not throw to callers.
- Services do not import from other services. Pass dependencies as function parameters.

## Styling

- Tailwind CSS 4 utility classes for all layout and spacing.
- Color tokens only — always use CSS custom properties (`var(--bg-app)`, `var(--accent)`).
  Never use hardcoded hex values in JSX.
- Dark mode is toggled by `class="dark"` on `<html>`. Token overrides live under `.dark {}`
  in `src/index.css`.
- Icons: Lucide React only. `w-4 h-4` for inline, `w-5 h-5` for standalone/toolbar.
  Stroke-based — never fill.
- No inline `style` props for spacing or color. Use Tailwind classes.
- Border radius uses Tailwind's `rounded-*` scale — no custom radius values.

## Error Handling

- Every error is logged via `logger.ts` before being returned or discarded.
- Never swallow errors silently.
- The renderer checks for `result?.error` before using any IPC result and shows an
  appropriate UI state (error badge, retry button).

## Logging

- Main-process logging only — never `console.log` in production code; use `logger.ts`.
- Levels: `info` for normal pipeline events, `warn` for recoverable anomalies,
  `error` for failures.
- Never log file contents or user data — log filenames, UUIDs, and status codes only.

## File Organization

- `src/main/` — main process: IPC handlers, window/tray management, app lifecycle
- `src/main/db/` — all SQLite access (schema, queries, FTS5)
- `src/main/services/` — one file per service concern
- `src/preload/` — contextBridge bridge only
- `src/renderer/components/` — React UI components
- `src/renderer/contexts/` — React context providers (theme, etc.)

## Commit Style

- Present tense, imperative: `add retry logic`, not `added` or `adds`.
- Type prefix required: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `ci:`.
- Subject line under 72 characters. Body only when the why is non-obvious.

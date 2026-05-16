# UI Context

## Theme

Light and dark mode both supported. The default is determined by the user's OS preference
and persisted in `localStorage` via `ThemeContext`. Dark mode is activated by adding
`class="dark"` to `<html>`. All color decisions use CSS custom property tokens — never
raw hex values in component JSX.

## Colors

Tokens are defined in `src/index.css`. All components must use these tokens.

### Light Mode

| Role              | CSS Variable      | Value     |
| ----------------- | ----------------- | --------- |
| App background    | `--bg-app`        | `#f8fafc` |
| Surface (cards)   | `--bg-surface`    | `#ffffff` |
| Elevated surface  | `--bg-elevated`   | `#f1f5f9` |
| Primary text      | `--text-main`     | `#0f172a` |
| Muted text        | `--text-subtle`   | `#64748b` |
| Primary accent    | `--accent`        | `#3b82f6` |
| Accent hover      | `--accent-hover`  | `#2563eb` |
| Border            | `--border-base`   | `#e2e8f0` |
| Error / danger    | `--state-error`   | `#ef4444` |
| Success           | `--state-success` | `#22c55e` |
| Warning           | `--state-warning` | `#f59e0b` |

### Dark Mode (`.dark` overrides)

| Role              | CSS Variable      | Value     |
| ----------------- | ----------------- | --------- |
| App background    | `--bg-app`        | `#020617` |
| Surface (cards)   | `--bg-surface`    | `#0f172a` |
| Elevated surface  | `--bg-elevated`   | `#1e293b` |
| Primary text      | `--text-main`     | `#f1f5f9` |
| Muted text        | `--text-subtle`   | `#94a3b8` |
| Primary accent    | `--accent`        | `#60a5fa` |
| Accent hover      | `--accent-hover`  | `#93c5fd` |
| Border            | `--border-base`   | `#1e293b` |

Error, success, and warning tokens remain the same in dark mode.

## Typography

| Role      | Font stack                                | Notes                       |
| --------- | ----------------------------------------- | --------------------------- |
| UI text   | `Inter, system-ui, sans-serif`            | All body and label text     |
| Mono      | `ui-monospace, SFMono-Regular, monospace` | Log output, paths, UUIDs    |

Font sizes follow Tailwind's default scale (`text-xs`, `text-sm`, `text-base`).
The majority of UI text is `text-sm`. Labels and metadata values use `text-xs`.

## Border Radius

| Context              | Tailwind class  |
| -------------------- | --------------- |
| Buttons, badges      | `rounded`       |
| Input fields         | `rounded-md`    |
| Cards / panels       | `rounded-lg`    |
| Modals / overlays    | `rounded-xl`    |
| Pill tags            | `rounded-full`  |

## Layout

The main window uses a three-panel layout:

```
┌─────────────┬─────────────────────────────┬───────────────┐
│ NavSidebar  │     FileDashboard           │   Sidebar     │
│ (left)      │     (center / document list)│   (right)     │
│ fixed width │     flex-1                  │   fixed width │
└─────────────┴─────────────────────────────┴───────────────┘
```

- **NavSidebar (left)**: Fixed width, contains tab navigation (Inbox / Sortieren / Archiv),
  Ollama status indicator, crawler control, theme toggle, settings button.
- **FileDashboard (center)**: Scrollable document table. Expands to fill remaining space.
  Below it, the ArchiveTree is shown when the Archiv tab is active.
- **Sidebar (right)**: Fixed width, shows metadata editor for the selected document.
  Hidden when no document is selected.
- **Modals**: Centered overlay on the main window with a semi-transparent backdrop.
  `PdfViewerModal` is full-viewport. `SettingsModal` is centered card.
- **Search window**: Frameless `420×480` window, always-on-top, appears at a fixed
  screen position. No titlebar, no resize.

## Component Patterns

- **Document table rows**: clickable, highlighted with `--accent` background on selection.
- **Status badges**: small `rounded-full` pills with colored dot indicators.
  Colors map to status: new=yellow, error=red, ocr=orange, ai=blue, processed=green.
- **Sidebar fields**: label above value, `text-xs` label in `--text-subtle`,
  `text-sm` editable input or display value.
- **Action buttons**: primary action (Archive) uses `--accent` background with white text.
  Secondary/destructive actions use border-only style.
- **Tree nodes** (ArchiveTree): indented with `pl-*` per depth level, folder icon on left,
  drag-handle affordance on hover.

## Icons

- **Library**: Lucide React exclusively.
- **Style**: Stroke-based only. Never use `fill` variants.
- **Sizes**:
  - `w-4 h-4` — inline icons (next to text, inside badges).
  - `w-5 h-5` — standalone toolbar/button icons.
- **Color**: inherits from parent text color (`currentColor`) unless explicitly overridden
  with a token class.

## Interaction States

- Hover: `bg-[var(--bg-elevated)]` on interactive rows and buttons.
- Focus: default Tailwind focus ring using `--accent` color.
- Disabled: `opacity-50 cursor-not-allowed`.
- Loading/processing: spinner or pulsing badge; never block the UI thread.

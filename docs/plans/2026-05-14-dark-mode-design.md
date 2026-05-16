# Design: Dark/Light Mode Implementation

## Goal
Implement a robust, premium-looking dark and light mode system using semantic CSS variables and Tailwind CSS v4. The system will be persisted in localStorage and feature a toggle in the navigation sidebar.

## Architecture

### 1. Theme Variables (`src/index.css`)
Define semantic variables that map to specific colors for each theme.

| Variable | Light Mode | Dark Mode |
| :--- | :--- | :--- |
| `--bg-app` | `#f8fafc` | `#020617` |
| `--bg-surface` | `#ffffff` | `#0f172a` |
| `--text-main` | `#0f172a` | `#f1f5f9` |
| `--text-subtle` | `#64748b` | `#94a3b8` |
| `--border-base` | `#e2e8f0` | `#1e293b` |
| `--accent` | `#3b82f6` | `#60a5fa` |

### 2. State Management (`src/renderer/contexts/ThemeContext.tsx`)
A React Context to manage the `theme` state (`light` | `dark`).
- Persists choice to `localStorage`.
- Applies the `.dark` class to the `document.documentElement`.
- Provides a `toggleTheme` function.

### 3. Components
- **NavSidebar**: Add a `ThemeToggle` component at the bottom.
- **Global Styles**: Replace hardcoded Tailwind colors with semantic variables in components.

## Implementation Steps
1. Define CSS variables and Tailwind theme extensions in `index.css`.
2. Create `ThemeContext` and `ThemeProvider`.
3. Wrap `App` with `ThemeProvider`.
4. Update `NavSidebar` with the toggle.
5. Systematic refactoring of components to use the new semantic classes.

## Testing
- Verify theme persistence after reload.
- Check all modals (Settings, PDF Viewer) for correct dark mode rendering.
- Ensure transitions between themes are smooth.

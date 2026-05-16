# Dark Mode Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement a premium dark/light mode system using semantic CSS variables and Tailwind CSS v4, with state persistence and a toggle in the sidebar.

**Architecture:** Use CSS custom properties (variables) defined in `index.css` for both light and dark themes. Manage the active theme via a React Context and apply a `.dark` class to the root element.

**Tech Stack:** React, Tailwind CSS v4, Lucide React, LocalStorage.

---

### Task 1: Foundation - CSS Variables & Tailwind Theme

**Files:**
- Modify: `src/index.css`

**Step 1: Define variables and extend Tailwind theme**
Modify `src/index.css` to include the semantic variables and map them in the `@theme` block.

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", system-ui, sans-serif;
  
  /* Map CSS variables to Tailwind classes */
  --color-bg-app: var(--bg-app);
  --color-bg-surface: var(--bg-surface);
  --color-text-main: var(--text-main);
  --color-text-subtle: var(--text-subtle);
  --color-border-base: var(--border-base);
  --color-accent-primary: var(--accent);
}

:root {
  --bg-app: #f8fafc;
  --bg-surface: #ffffff;
  --text-main: #0f172a;
  --text-subtle: #64748b;
  --border-base: #e2e8f0;
  --accent: #3b82f6;
}

.dark {
  --bg-app: #020617;
  --bg-surface: #0f172a;
  --text-main: #f1f5f9;
  --text-subtle: #94a3b8;
  --border-base: #1e293b;
  --accent: #60a5fa;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-app);
  color: var(--text-main);
  transition: background-color 0.3s, color 0.3s;
}
```

**Step 2: Commit**
```bash
git add src/index.css
git commit -m "style: define theme variables and tailwind mapping"
```

---

### Task 2: State Management - ThemeContext

**Files:**
- Create: `src/renderer/contexts/ThemeContext.tsx`

**Step 1: Implement ThemeContext**
Create a new file `src/renderer/contexts/ThemeContext.tsx` to handle theme switching and persistence.

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
```

**Step 2: Commit**
```bash
git add src/renderer/contexts/ThemeContext.tsx
git commit -m "feat: add ThemeContext for state management"
```

---

### Task 3: Application Setup - Wrap App

**Files:**
- Modify: `src/main.tsx`

**Step 1: Wrap App with ThemeProvider**
Update `src/main.tsx` to include the `ThemeProvider`.

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { ThemeProvider } from './renderer/contexts/ThemeContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
```

**Step 2: Commit**
```bash
git add src/main.tsx
git commit -m "feat: wrap app with ThemeProvider"
```

---

### Task 4: UI Components - Theme Toggle

**Files:**
- Modify: `src/renderer/components/NavSidebar.tsx`

**Step 1: Add ThemeToggle to NavSidebar**
Add the Sun/Moon toggle to the bottom of the navigation sidebar.

```tsx
import { Sun, Moon, ... } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

// Inside NavSidebar component:
const { theme, toggleTheme } = useTheme();

// At the bottom of the sidebar:
<button 
  onClick={toggleTheme}
  className="mt-auto p-3 flex items-center gap-3 rounded-xl hover:bg-surface transition-colors text-subtle hover:text-main"
>
  {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
  <span className="font-medium">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
</button>
```

**Step 2: Commit**
```bash
git add src/renderer/components/NavSidebar.tsx
git commit -m "feat: add theme toggle to NavSidebar"
```

---

### Task 5: Systematic Refactoring - App Shell

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update App.tsx classes**
Replace hardcoded classes like `bg-gray-50`, `bg-white`, `text-gray-900`, `text-gray-800` with `bg-app`, `bg-surface`, `text-main`.

**Step 2: Commit**
```bash
git add src/App.tsx
git commit -m "style: update App shell with theme variables"
```

---

### Task 6: Systematic Refactoring - Sidebar & Dashboard

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/components/FileDashboard.tsx`
- Modify: `src/renderer/components/ArchiveTree.tsx`

**Step 1: Update components classes**
Iterate through remaining components and update their styling to use semantic variables.

**Step 2: Commit**
```bash
git add src/renderer/components/*.tsx
git commit -m "style: refactor remaining components for dark mode"
```

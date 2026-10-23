import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
const COOKIE = 'rinda-theme';
const system = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function chosen(): Theme | null {
  const match = /(?:^|;\s*)rinda-theme=(light|dark)/.exec(document.cookie);
  return match?.[1] === 'light' || match?.[1] === 'dark' ? match[1] : null;
}

function apply() {
  const theme = chosen() ?? (system.matches ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', theme === 'dark');
  listeners.forEach((l) => l());
}

export function initTheme() {
  apply();
  system.addEventListener('change', apply);
}

export function toggleTheme() {
  const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  apply();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  );
}

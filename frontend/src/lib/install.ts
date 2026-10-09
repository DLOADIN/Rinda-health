// "Install app" (NFR-04, docs/OFFLINE.md "iPhones and Safari"). Chromium fires beforeinstallprompt once, early,
// so the listener is registered when this module loads (imported from main.tsx). Safari has no prompt, so we show
// the Share > Add to Home Screen steps there instead.
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => `${Boolean(deferred)}:${Boolean(installed)}`;

export function useInstallPrompt() {
  const [canInstall, isInstalled] = useSyncExternalStore(subscribe, snapshot, snapshot).split(':');
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return {
    canInstall: canInstall === 'true',
    installed: isInstalled === 'true',
    isIos,
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      notify();
    },
  };
}

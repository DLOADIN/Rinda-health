// Offline is a normal state, shown with a neutral Badge, never an error (DESIGN_SYSTEM.md principle 5).
import { CloudOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

const subscribe = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBadge() {
  const { t } = useTranslation();
  if (useOnline()) return null;
  return (
    <Badge variant="outline" className="h-auto gap-1.5 py-1 text-sm whitespace-normal" role="status">
      <CloudOff aria-hidden="true" />
      {t('status.offline')}
    </Badge>
  );
}

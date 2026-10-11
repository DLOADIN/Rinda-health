import { i18n } from '@/lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (i18n.language === 'rw' && Intl.DateTimeFormat.supportedLocalesOf('rw').length === 0) {
    const months = i18n.t('format.months').split(',');
    const day = `${d.getDate()} ${months[d.getMonth()] ?? ''} ${d.getFullYear()}`;
    return withTime ? `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
  }
  return new Intl.DateTimeFormat(i18n.language === 'rw' ? 'rw-RW' : 'en-GB', {
    dateStyle: 'long',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(d);
}

export const formatNumber = (n: number) =>
  new Intl.NumberFormat(i18n.language === 'rw' ? 'rw-RW' : 'en-GB').format(n);

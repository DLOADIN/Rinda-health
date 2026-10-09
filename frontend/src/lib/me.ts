import type { Me } from '@rinda/schemas';

/** The name to greet someone by: their chosen name, else the part of the email before the @. */
export const displayNameOf = (me: Me): string | null => me.displayName ?? me.email?.split('@')[0] ?? null;

export const initialsOf = (me: Me): string =>
  (displayNameOf(me) ?? me.phone ?? '?')
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

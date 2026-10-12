// Adapted from Magic UI (MIT): a soft dotted background, faded out towards the edges.
import { useId } from 'react';
import { cn } from '@/lib/utils';

export function DotPattern({
  className,
  gap = 22,
  radius = 1.2,
}: {
  className?: string;
  gap?: number;
  radius?: number;
}) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full fill-foreground/15',
        '[mask-image:radial-gradient(ellipse_at_center,white,transparent_70%)]',
        className,
      )}
    >
      <defs>
        <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse">
          <circle cx={gap / 2} cy={gap / 2} r={radius} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

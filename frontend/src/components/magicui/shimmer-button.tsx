// Adapted from Magic UI (MIT): a pill button with a slow light sweeping around its edge. Use with asChild for links.
import { Slot } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

export function ShimmerButton({
  className,
  children,
  asChild = false,
  ...props
}: ComponentPropsWithoutRef<'button'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      {...props}
      className={cn(
        'group relative z-0 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full',
        'bg-primary px-6 font-semibold whitespace-nowrap text-primary-foreground shadow-lg shadow-primary/25',
        'transition-transform duration-300 [--speed:3s] [--spread:90deg] active:translate-y-px',
        'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-30 overflow-visible [container-type:size] blur-[2px]"
      >
        <span className="absolute inset-0 h-[100cqh] animate-shimmer-slide [aspect-ratio:1] [border-radius:0] [mask:none]">
          <span className="absolute -inset-full w-auto rotate-0 animate-spin-around [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--brand-blush)_var(--spread),transparent_var(--spread))]" />
        </span>
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-[2px] -z-20 rounded-full bg-primary transition-colors group-hover:bg-brand-ember-strong"
      />
      {asChild ? (
        <Slot.Slottable>{children}</Slot.Slottable>
      ) : (
        <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      )}
    </Comp>
  );
}

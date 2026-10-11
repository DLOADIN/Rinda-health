import type { Severity } from '@rinda/rules';
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  HeartHandshake,
  Hospital,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STYLE: Record<Severity, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: 'bg-band-ok text-band-ok-foreground' },
  attention: { icon: CircleAlert, className: 'bg-band-attention text-band-attention-foreground' },
  confirm: { icon: Stethoscope, className: 'bg-band-confirm text-band-confirm-foreground' },
  urgent: { icon: Hospital, className: 'bg-band-urgent text-band-urgent-foreground' },
  wellness: { icon: HeartHandshake, className: 'bg-band-wellness text-band-wellness-foreground' },
  unknown: { icon: CircleHelp, className: 'border-dashed border-input bg-transparent text-foreground' },
};

export function BandBadge({
  severity,
  label,
  className,
}: {
  severity: Severity;
  label: string;
  className?: string;
}) {
  const { icon: Icon, className: style } = STYLE[severity];
  return (
    <Badge
      data-severity={severity}
      className={cn('h-auto gap-1.5 px-2.5 py-1 text-sm whitespace-normal', style, className)}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}

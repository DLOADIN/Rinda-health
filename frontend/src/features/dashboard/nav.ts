import type { Role } from '@rinda/schemas';
import {
  Calculator,
  CalendarClock,
  ChartNoAxesColumn,
  ClipboardList,
  FileCheck,
  FileText,
  House,
  LifeBuoy,
  MessageSquareHeart,
  ScrollText,
  ShieldCheck,
  ToggleRight,
  Trash2,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const home: NavItem = { to: '/app', labelKey: 'nav.home', icon: House };
const profile: NavItem = { to: '/app/profile', labelKey: 'nav.profile', icon: UserRound };

export const NAV: Record<Role, NavItem[]> = {
  participant: [
    home,
    { to: '/app/checkup', labelKey: 'nav.checkup', icon: ClipboardList },
    { to: '/app/results', labelKey: 'nav.results', icon: ChartNoAxesColumn },
    { to: '/app/how-results-work', labelKey: 'nav.howResults', icon: Calculator },
    { to: '/app/feedback', labelKey: 'nav.feedback', icon: MessageSquareHeart },
    { to: '/app/help', labelKey: 'nav.help', icon: LifeBuoy },
    profile,
  ],
  facilitator: [
    home,
    { to: '/app/participants', labelKey: 'nav.participants', icon: Users },
    { to: '/app/sessions', labelKey: 'nav.sessions', icon: CalendarClock },
    { to: '/app/safety', labelKey: 'nav.safety', icon: ShieldCheck },
    profile,
  ],
  researcher_admin: [
    home,
    { to: '/app/users', labelKey: 'nav.users', icon: UserCog },
    { to: '/app/content', labelKey: 'nav.content', icon: FileText },
    { to: '/app/participants', labelKey: 'nav.participants', icon: Users },
    { to: '/app/safety', labelKey: 'nav.safety', icon: ShieldCheck },
    { to: '/app/deletions', labelKey: 'nav.deletions', icon: Trash2 },
    { to: '/app/audit', labelKey: 'nav.audit', icon: ScrollText },
    { to: '/app/flags', labelKey: 'nav.flags', icon: ToggleRight },
    profile,
  ],
  reviewer: [home, { to: '/app/content', labelKey: 'nav.reviews', icon: FileCheck }, profile],
};

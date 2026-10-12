import { LifeBuoy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReferralList } from '@/components/referral-list';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useContent } from '@/lib/content';
import { reportStep } from '@/lib/session-progress';
import { cn } from '@/lib/utils';

export function GetHelp({
  variant = 'bar',
  className,
}: {
  variant?: 'bar' | 'floating';
  className?: string;
}) {
  const { t } = useTranslation();
  const { text } = useContent();

  return (
    <Drawer onOpenChange={(open) => (open ? reportStep('get_help') : undefined)}>
      <DrawerTrigger asChild>
        <Button
          variant="secondary"
          className={cn(variant === 'bar' ? 'w-full' : 'rounded-full shadow-lg', className)}
        >
          <LifeBuoy aria-hidden="true" data-icon="inline-start" />
          {t('shell.getHelp')}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-screen-sm">
          <DrawerHeader>
            <DrawerTitle>{text('safety.gethelp.title')}</DrawerTitle>
            <DrawerDescription>{text('safety.gethelp.intro')}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">
            <ReferralList />
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">{t('shell.close')}</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

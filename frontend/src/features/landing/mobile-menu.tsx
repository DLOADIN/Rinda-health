import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export default function MobileMenu({
  open,
  onOpenChange,
  sections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: readonly string[];
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>{t('app.name')}</SheetTitle>
        </SheetHeader>
        <ul className="flex flex-col gap-1 px-4">
          {sections.map((s) => (
            <li key={s}>
              <SheetClose asChild>
                <Button asChild variant="ghost" className="w-full justify-start">
                  <a href={`/#${s}`}>{t(`landing.nav.${s}`)}</a>
                </Button>
              </SheetClose>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2 px-4">
          <SheetClose asChild>
            <Button asChild variant="outline">
              <Link to="/login">{t('landing.login')}</Link>
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button asChild>
              <Link to="/signup">{t('landing.nav.getStarted')}</Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}

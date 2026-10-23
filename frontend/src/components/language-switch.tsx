import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { languageChanged } from '@/app/store';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitch({
  className,
  onChange,
}: {
  className?: string;
  onChange?: (lang: Language) => void;
}) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const change = (value: string) => {
    if (!(LANGUAGES as readonly string[]).includes(value)) return;
    void i18n.changeLanguage(value);
    dispatch(languageChanged(value as Language));
    onChange?.(value as Language);
  };
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={i18n.language}
      onValueChange={change}
      aria-label={t('language.label')}
      className={cn(className)}
    >
      {LANGUAGES.map((lang) => (
        <ToggleGroupItem
          key={lang}
          value={lang}
          lang={lang}
          className="border border-color-border/500 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
          aria-label={t(`language.${lang}`)}
        >
          {lang.toUpperCase()}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

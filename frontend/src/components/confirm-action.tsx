import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface Props {
  trigger: ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  variant?: 'destructive' | 'default';
  size?: 'touch' | 'sm' | 'icon-touch';
  disabled?: boolean;
  label?: string;
}

export function ConfirmAction({
  trigger,
  title,
  description,
  onConfirm,
  variant = 'destructive',
  size = 'touch',
  disabled,
  label,
}: Props) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant === 'destructive' ? 'outline' : 'default'}
          size={size}
          disabled={disabled}
          aria-label={label}
        >
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant={variant} onClick={onConfirm}>
            {t('common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

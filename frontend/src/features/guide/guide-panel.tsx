import { GUIDE_ANSWERS } from '@rinda/content/guide-answers';
import { composeGuideAnswer } from '@rinda/rules';
import { CircleAlert, House, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useOnline } from '@/components/offline-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useExplainMutation,
  useGuideFeedbackMutation,
  useMeQuery,
  type Assessment,
  type GuideResponse,
} from '@/lib/api';
import { useContent } from '@/lib/content';

const ChatPanel = lazy(() => import('@/features/guide/chat-panel'));

interface Props {
  assessment: Assessment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialChip?: string;
}

export default function GuidePanel({ assessment, open, onOpenChange, initialChip }: Props) {
  const { t } = useTranslation();
  const { text: appText, lang } = useContent();
  const text = useCallback(
    (id: string) => {
      const found = appText(id);
      return found !== id ? found : (GUIDE_ANSWERS[lang][id] ?? id);
    },
    [appText, lang],
  );
  const online = useOnline();
  const [chip, setChip] = useState<string | null>(initialChip ?? null);
  const [served, setServed] = useState<{ chip: string; answer: GuideResponse } | null>(null);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const [explain, { isLoading }] = useExplainMutation();
  const [feedback] = useGuideFeedbackMutation();

  const chipLabel = (id: string) =>
    id.startsWith('explain.')
      ? text('guide.chip.explain').replace('{area}', text(`guide.area.${id.slice(8)}`))
      : text(`guide.chip.${id}`);

  const template = useMemo(
    () => (assessment && chip ? composeGuideAnswer(chip, assessment.results, assessment.plan, text) : null),
    [assessment, chip, text],
  );

  const answer: GuideResponse | null =
    served && served.chip === chip ? served.answer : template ? { source: 'template', ...template } : null;
  const voted = votedFor !== null && votedFor === chip;

  useEffect(() => {
    if (!assessment || !chip || !online || assessment.provisional) return;
    let current = true;
    void explain({ assessmentId: assessment.id, chipId: chip, language: lang }).then((r) => {
      if (!current) return;
      if ('data' in r && r.data) setServed({ chip, answer: r.data });
      else setFailedFor(chip);
    });
    return () => {
      current = false;
    };
  }, [assessment, chip, online, lang, explain]);

  const vote = (helpful: boolean) => {
    if (answer?.requestId) void feedback({ requestId: answer.requestId, helpful });
    setVotedFor(chip);
  };

  const mainChips = ['overview', 'tips', 'first_step', 'plan_week'];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:h-[90dvh] data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
        <ScrollArea
          type="always"
          data-vaul-no-drag
          className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block! [&_[data-slot=scroll-area-scrollbar]]:w-3.5 [&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/60"
        >
          <div className="mx-auto grid w-full max-w-6xl items-start gap-6 px-4 pr-6 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <div className="flex min-w-0 flex-col gap-4">
              <DrawerHeader className="px-0">
                <DrawerTitle className="flex items-center gap-2 text-xl">
                  <span className="hero-orb flex size-9 items-center justify-center rounded-full text-primary-foreground">
                    <Sparkles aria-hidden="true" className="size-5" />
                  </span>
                  {t('guidePanel.title')}
                </DrawerTitle>
                <DrawerDescription>
                  {assessment
                    ? t('guidePanel.intro')
                    : me?.role === 'participant'
                      ? t('guidePanel.needCheckup')
                      : t('app.fullName')}
                </DrawerDescription>
              </DrawerHeader>

              {assessment ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('guidePanel.title')}>
                  {mainChips.map((c) => (
                    <Button
                      key={c}
                      variant={chip === c ? 'default' : 'outline'}
                      className="h-auto min-h-11 max-w-full rounded-full whitespace-normal"
                      onClick={() => setChip(c)}
                    >
                      {chipLabel(c)}
                    </Button>
                  ))}
                  {chip?.startsWith('explain.') ? (
                    <Button
                      variant="default"
                      className="h-auto min-h-11 max-w-full rounded-full whitespace-normal"
                    >
                      {chipLabel(chip)}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {failedFor !== null && failedFor === chip ? (
                <Alert>
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription className="flex flex-col gap-3">
                    <span>{t('guidePanel.unavailable')}</span>
                    <Button
                      className="self-start"
                      onClick={() => {
                        onOpenChange(false);
                        void navigate('/app');
                      }}
                    >
                      <House aria-hidden="true" data-icon="inline-start" />
                      {t('guidePanel.backToDashboard')}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {answer ? (
                <Card className="glass">
                  <CardContent className="flex flex-col gap-3">
                    <Badge variant="outline" className="h-auto self-start py-1 whitespace-normal">
                      {answer.source === 'generated'
                        ? text('guide.label.generated')
                        : text('guide.label.template')}
                    </Badge>
                    <div className="flex min-h-40 flex-col gap-3 rounded-xl border bg-card/60 p-4 text-base">
                      {answer.paragraphs.map((p, i) => (
                        <p key={i} className="leading-relaxed">
                          {p.text}
                        </p>
                      ))}
                      {isLoading && answer.source === 'template' ? <Skeleton className="h-4 w-2/3" /> : null}
                    </div>
                    {answer.source === 'generated' ? (
                      <p className="text-sm text-muted-foreground">{text('guide.label.disclaimer')}</p>
                    ) : null}
                    {!online ? (
                      <p className="text-sm text-muted-foreground">{t('guidePanel.offline')}</p>
                    ) : null}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="self-start">
                          {t('guidePanel.sources')}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground">
                          {[...new Set(answer.paragraphs.flatMap((p) => p.sourceIds))].map((id) => (
                            <li key={id}>
                              <code>{id}</code>
                            </li>
                          ))}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                    <div className="flex flex-wrap items-center gap-2">
                      {voted ? (
                        <span className="text-sm text-muted-foreground">{t('guidePanel.thanks')}</span>
                      ) : (
                        <>
                          <span className="text-sm">{t('guidePanel.helpful')}</span>
                          <Button variant="outline" size="sm" onClick={() => vote(true)}>
                            <ThumbsUp aria-hidden="true" data-icon="inline-start" />
                            {t('guidePanel.yes')}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => vote(false)}>
                            <ThumbsDown aria-hidden="true" data-icon="inline-start" />
                            {t('guidePanel.no')}
                          </Button>
                        </>
                      )}
                    </div>
                    {answer.followUpChipIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {answer.followUpChipIds.map((c) => (
                          <Button
                            key={c}
                            variant="secondary"
                            className="h-auto min-h-11 max-w-full rounded-full whitespace-normal"
                            onClick={() => setChip(c)}
                          >
                            {chipLabel(c)}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}
            </div>
            <div className="lg:sticky lg:top-4 lg:pt-6">
              <Suspense fallback={null}>
                <ChatPanel
                  assessmentId={assessment?.id ?? null}
                  staff={me?.role !== 'participant'}
                  language={lang}
                  chipLabel={chipLabel}
                  onClose={() => onOpenChange(false)}
                />
              </Suspense>
            </div>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

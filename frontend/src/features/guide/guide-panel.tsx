import { composeGuideAnswer } from '@rinda/rules';
import { Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '@/components/offline-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { useExplainMutation, useGuideFeedbackMutation, type Assessment, type GuideResponse } from '@/lib/api';
import { useContent } from '@/lib/content';

interface Props {
  assessment: Assessment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialChip?: string;
}

export default function GuidePanel({ assessment, open, onOpenChange, initialChip }: Props) {
  const { t } = useTranslation();
  const { text, lang } = useContent();
  const online = useOnline();
  const [chip, setChip] = useState<string | null>(initialChip ?? null);
  const [served, setServed] = useState<{ chip: string; answer: GuideResponse } | null>(null);
  const [votedFor, setVotedFor] = useState<string | null>(null);
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
      if (current && 'data' in r && r.data) setServed({ chip, answer: r.data });
    });
    return () => {
      current = false;
    };
  }, [assessment, chip, online, lang, explain]);

  const vote = (helpful: boolean) => {
    if (answer?.requestId) void feedback({ requestId: answer.requestId, helpful });
    setVotedFor(chip);
  };

  const mainChips = ['overview', 'first_step', 'plan_week'];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle className="flex items-center gap-2 text-xl">
              <span className="hero-orb flex size-9 items-center justify-center rounded-full text-primary-foreground">
                <Sparkles aria-hidden="true" className="size-5" />
              </span>
              {t('guidePanel.title')}
            </DrawerTitle>
            <DrawerDescription>
              {assessment ? t('guidePanel.intro') : t('guidePanel.needCheckup')}
            </DrawerDescription>
          </DrawerHeader>

          {assessment ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('guidePanel.title')}>
              {mainChips.map((c) => (
                <Button
                  key={c}
                  variant={chip === c ? 'default' : 'outline'}
                  className="h-auto min-h-11 rounded-full whitespace-normal"
                  onClick={() => setChip(c)}
                >
                  {chipLabel(c)}
                </Button>
              ))}
              {chip?.startsWith('explain.') ? (
                <Button variant="default" className="h-auto min-h-11 rounded-full whitespace-normal">
                  {chipLabel(chip)}
                </Button>
              ) : null}
            </div>
          ) : null}

          {answer ? (
            <Card className="glass">
              <CardContent className="flex flex-col gap-3">
                <Badge variant="outline" className="h-auto self-start py-1 whitespace-normal">
                  {answer.source === 'generated'
                    ? text('guide.label.generated')
                    : text('guide.label.template')}
                </Badge>
                {answer.paragraphs.map((p, i) => (
                  <p key={i} className="leading-relaxed">
                    {p.text}
                  </p>
                ))}
                {isLoading && answer.source === 'template' ? <Skeleton className="h-4 w-2/3" /> : null}
                {answer.source === 'generated' ? (
                  <p className="text-sm text-muted-foreground">{text('guide.label.disclaimer')}</p>
                ) : null}
                {!online ? <p className="text-sm text-muted-foreground">{t('guidePanel.offline')}</p> : null}
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
                        className="h-auto min-h-11 rounded-full whitespace-normal"
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
      </DrawerContent>
    </Drawer>
  );
}

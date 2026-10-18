import type { Plan, PlanTarget } from './plan.ts';
import { NCD_DOMAINS, type AssessmentResult, type DomainResult, type NcdDomain } from './types.ts';

export interface GuideParagraph {
  text: string;
  sourceIds: string[];
}
export interface GuideDraft {
  paragraphs: GuideParagraph[];
  followUpChipIds: string[];
}
export type TextLookup = (id: string) => string;

const VALUE_DOMAINS: readonly NcdDomain[] = ['activity', 'diet', 'bmi', 'waist', 'alcohol'];

export const GUIDE_CHIPS = [
  'overview',
  'first_step',
  'plan_week',
  'tips',
  ...NCD_DOMAINS.map((d) => `explain.${d}` as const),
];
export type GuideChip = (typeof GUIDE_CHIPS)[number];

export function fillSlots(template: string, slots: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in slots ? String(slots[key]) : match));
}

export function composeGuideAnswer(
  chipId: string,
  result: AssessmentResult,
  plan: Plan,
  text: TextLookup,
): GuideDraft {
  const t = (id: string, slots: Record<string, string | number> = {}) => fillSlots(text(id), slots);
  const bandId = (r: DomainResult) =>
    r.band === 'insufficient' ? 'band.insufficient' : `band.${r.domain}.${r.band}`;
  const area = (d: string) => t(`guide.area.${d}`);
  const step = (target: PlanTarget) => t(`guide.target.${target.kind}`, { ...target });
  const paragraphs: GuideParagraph[] = [];
  // The offline answer set: why this result matters and what helps. An area whose approved safety text is already
  // showing gets nothing more, and missing entries are left out, so the answer never shows a raw ID.
  const advice = (
    r: DomainResult,
    parts: ReadonlyArray<'why' | 'tips'> = ['why', 'tips'],
  ): GuideParagraph | null => {
    if (r.band === 'insufficient' || r.domain === plan.urgent?.domain) return null;
    const ids = parts.map((p) => `ga.${r.domain}.${r.band}.${p}`).filter((id) => text(id) !== id);
    return ids.length ? { text: ids.map((id) => t(id)).join(' '), sourceIds: ids } : null;
  };

  if (plan.urgent) paragraphs.push({ text: t(plan.urgent.contentId), sourceIds: [plan.urgent.contentId] });
  // "All is well" wording never follows the approved seek-care text.
  const allWell = !plan.urgent;
  const adviceFor = (results: readonly DomainResult[], parts?: ReadonlyArray<'why' | 'tips'>) => {
    const found = results.flatMap((r) => {
      const more = advice(r, parts);
      return more ? [{ text: `${area(r.domain)}: ${more.text}`, sourceIds: more.sourceIds }] : [];
    });
    return found.length
      ? { text: found.map((p) => p.text).join(' '), sourceIds: found.flatMap((p) => p.sourceIds) }
      : null;
  };

  const focusLine = (f: Plan['focus'][number]): GuideParagraph => {
    const name = f.domains.map(area).join(', ');
    return f.target
      ? {
          text: t('guide.tpl.plan.item', { area: name, step: step(f.target) }),
          sourceIds: ['guide.tpl.plan.item', `guide.target.${f.target.kind}`],
        }
      : { text: t('guide.tpl.plan.talk', { area: name }), sourceIds: ['guide.tpl.plan.talk'] };
  };

  const explainDomain = chipId.startsWith('explain.') ? chipId.slice('explain.'.length) : null;
  if (explainDomain) {
    const r = result.ncd.find((x) => x.domain === explainDomain);
    if (!r || r.band === 'insufficient') {
      paragraphs.push({
        text: `${area(explainDomain)}: ${t('guide.tpl.explain.missing')}`,
        sourceIds: ['guide.tpl.explain.missing'],
      });
    } else {
      const parts = [t('guide.tpl.explain', { area: area(r.domain), band: t(bandId(r)), source: r.source })];
      const sources = ['guide.tpl.explain', bandId(r)];
      if (r.value !== null && VALUE_DOMAINS.includes(r.domain as NcdDomain)) {
        parts.push(t('guide.tpl.explain.value', { value: t(`guide.value.${r.domain}`, { value: r.value }) }));
        sources.push('guide.tpl.explain.value', `guide.value.${r.domain}`);
      }
      paragraphs.push({ text: parts.join(' '), sourceIds: sources });
      const more = advice(r);
      if (more) paragraphs.push(more);
    }
    return { paragraphs, followUpChipIds: ['tips', 'first_step'] };
  }

  if (chipId === 'first_step') {
    const withTarget = plan.focus.find((f) => f.target);
    const first = plan.focus[0];
    if (withTarget?.target) {
      paragraphs.push({
        text: t('guide.tpl.first_step', { step: step(withTarget.target) }),
        sourceIds: ['guide.tpl.first_step', `guide.target.${withTarget.target.kind}`],
      });
    } else if (first) {
      paragraphs.push(focusLine(first));
    } else if (allWell) {
      paragraphs.push({ text: t('guide.tpl.first_step.none'), sourceIds: ['guide.tpl.first_step.none'] });
    }
    return { paragraphs, followUpChipIds: ['plan_week', 'overview'] };
  }

  if (chipId === 'tips') {
    // Areas follow the planner's order, so the most important one comes first.
    const chosen = plan.focus
      .flatMap((f) => f.domains)
      .flatMap((d) => result.ncd.filter((r) => r.domain === d));
    if (chosen.length > 0) {
      paragraphs.push({ text: t('guide.tpl.tips.intro'), sourceIds: ['guide.tpl.tips.intro'] });
      const more = adviceFor(chosen);
      if (more) paragraphs.push(more);
    } else if (allWell) {
      paragraphs.push({ text: t('guide.tpl.tips.none'), sourceIds: ['guide.tpl.tips.none'] });
      const more = adviceFor(result.ncd, ['tips']);
      if (more) paragraphs.push(more);
    }
    return { paragraphs, followUpChipIds: ['first_step', 'plan_week'] };
  }

  if (chipId === 'plan_week') {
    if (plan.focus.length === 0) {
      if (allWell)
        paragraphs.push({ text: t('guide.tpl.overview.ok'), sourceIds: ['guide.tpl.overview.ok'] });
    } else {
      const items = plan.focus.map(focusLine);
      paragraphs.push({
        text: [t('guide.tpl.plan.intro'), ...items.map((i) => i.text)].join(' '),
        sourceIds: ['guide.tpl.plan.intro', ...items.flatMap((i) => i.sourceIds)],
      });
    }
    return { paragraphs, followUpChipIds: ['first_step', 'overview'] };
  }

  // Each area gets a plain sentence that fits how it is doing ("this needs your attention"), with the band's own
  // name kept in brackets. Wording that is missing falls back to the short "Area: band." line.
  const lineId = (r: DomainResult) => {
    const id = `guide.tpl.area.${r.severity}`;
    return text(id) !== id ? id : 'guide.tpl.area';
  };
  const lines = result.ncd.map((r) => t(lineId(r), { area: area(r.domain), band: t(bandId(r)) }));
  paragraphs.push({
    text: [t('guide.tpl.overview.intro'), ...lines].join(' '),
    sourceIds: ['guide.tpl.overview.intro', ...new Set(result.ncd.map(lineId)), ...result.ncd.map(bandId)],
  });
  if (plan.focus.length > 0) {
    paragraphs.push({
      text: t('guide.tpl.overview.focus', {
        areas: plan.focus.map((f) => f.domains.map(area).join(', ')).join(', '),
      }),
      sourceIds: ['guide.tpl.overview.focus'],
    });
  } else if (allWell) {
    paragraphs.push({ text: t('guide.tpl.overview.ok'), sourceIds: ['guide.tpl.overview.ok'] });
  }
  return { paragraphs, followUpChipIds: ['first_step', 'plan_week'] };
}

export function allowedNumbers(
  result: AssessmentResult,
  plan: Plan,
  draft: GuideDraft,
  extra: readonly number[] = [],
): number[] {
  const set = new Set<number>(extra);
  for (const r of result.ncd) if (r.value !== null) set.add(r.value);
  for (const f of [...plan.focus, ...plan.other]) {
    if (f.target) for (const v of Object.values(f.target)) if (typeof v === 'number') set.add(v);
  }
  for (const p of draft.paragraphs)
    for (const m of p.text.matchAll(/\d+(?:[.,]\d+)?/g)) set.add(Number(m[0].replace(',', '.')));
  return [...set].sort((a, b) => a - b);
}

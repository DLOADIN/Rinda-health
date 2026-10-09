import { describe, expect, it } from 'vitest';
import {
  AssessmentSubmission,
  CHIP_IDS,
  FlagsResponse,
  GuideAnswer,
  ParticipantSignInRequest,
  SafetyEvent,
  StudyCode,
} from '../src/index.ts';

const safetyEvent = {
  id: '6f1c1f4e-8d3a-4b52-9c7e-2a4d5b6c7d8e',
  tier: 2,
  triggerType: 'item9',
  actions: ['safety_screen_shown', 'referral_list_shown'],
  occurredAt: '2026-10-04T10:00:00Z',
  recordedByRole: 'system',
};

describe('SafetyEvent (FR-13)', () => {
  it('accepts a tier, trigger and actions', () => {
    expect(SafetyEvent.safeParse(safetyEvent).success).toBe(true);
  });

  it.each([
    ['item9Answer', 2],
    ['score', 21],
    ['phq9Total', 15],
    ['band', 'severe'],
    ['note', 'free text'],
  ])('rejects an extra %s field', (key, value) => {
    expect(SafetyEvent.safeParse({ ...safetyEvent, [key]: value }).success).toBe(false);
  });

  it('rejects tier 0 and unknown actions', () => {
    expect(SafetyEvent.safeParse({ ...safetyEvent, tier: 0 }).success).toBe(false);
    expect(SafetyEvent.safeParse({ ...safetyEvent, actions: ['texted_someone'] }).success).toBe(false);
  });
});

describe('participant sign-in (FR-03, FR-26)', () => {
  it('accepts unambiguous codes and 4 to 6 digit PINs', () => {
    expect(ParticipantSignInRequest.safeParse({ studyCode: 'demo-7kq3xh9p', pin: '4829' }).success).toBe(
      true,
    );
    expect(StudyCode.parse('demo-7kq3xh9p')).toBe('DEMO-7KQ3XH9P');
  });

  it.each(['DEMO-7KQ3XH9O', 'DEMO-1KQ3XH9P', 'SHORT', ''])('rejects study code %s', (code) => {
    expect(StudyCode.safeParse(code).success).toBe(false);
  });

  it.each(['123', '1234567', '12a4'])('rejects PIN %s', (pin) => {
    expect(ParticipantSignInRequest.safeParse({ studyCode: 'DEMO-7KQ3XH9P', pin }).success).toBe(false);
  });

  it('has no name, phone or ID field (C-06)', () => {
    expect(
      ParticipantSignInRequest.safeParse({ studyCode: 'DEMO-7KQ3XH9P', pin: '4829', phone: '0788' }).success,
    ).toBe(false);
  });
});

describe('AssessmentSubmission', () => {
  const valid = {
    questionnaireVersionId: '6f1c1f4e-8d3a-4b52-9c7e-2a4d5b6c7d8e',
    rulesetVersionId: '7f1c1f4e-8d3a-4b52-9c7e-2a4d5b6c7d8e',
    language: 'en',
    startedAt: '2026-10-04T10:00:00Z',
    submittedAt: '2026-10-04T10:20:00Z',
    responses: [
      { questionCode: 'q.tobacco.current', value: false },
      { questionCode: 'q.phq9.9', missing: 'SKIPPED' },
    ],
    measurements: [
      {
        type: 'systolic',
        value: 128,
        unit: 'mmHg',
        source: 'in_session',
        measuredOn: '2026-10-04',
        rechecked: false,
      },
    ],
    clientResultHash: 'a'.repeat(64),
  };

  it('accepts codes, numbers and missingness', () => {
    expect(AssessmentSubmission.safeParse(valid).success).toBe(true);
  });

  it('rejects free text as an answer value (C-06)', () => {
    const freeText = {
      ...valid,
      responses: [{ questionCode: 'q.diet.notes', value: 'I eat a lot of beans' }],
    };
    expect(AssessmentSubmission.safeParse(freeText).success).toBe(false);
  });

  it('rejects a unit that does not match the measurement', () => {
    const wrong = { ...valid, measurements: [{ ...valid.measurements[0], unit: 'kg' }] };
    expect(AssessmentSubmission.safeParse(wrong).success).toBe(false);
  });

  it('rejects a question answered twice', () => {
    const twice = { ...valid, responses: [valid.responses[0], valid.responses[0]] };
    expect(AssessmentSubmission.safeParse(twice).success).toBe(false);
  });
});

describe('flags and guide', () => {
  it('flags are booleans only', () => {
    expect(FlagsResponse.safeParse({ guideGenerative: 'yes' }).success).toBe(false);
  });

  it('mental-wellness domains have no chips', () => {
    expect(CHIP_IDS.some((c) => /phq9|gad7/.test(c))).toBe(false);
  });

  it('guide answers are 1 to 4 paragraphs with sources', () => {
    expect(GuideAnswer.safeParse({ paragraphs: [], followUpChipIds: [] }).success).toBe(false);
    expect(
      GuideAnswer.safeParse({
        paragraphs: [{ text: 'x', sourceIds: ['rec.diet.below'] }],
        followUpChipIds: ['overview'],
      }).success,
    ).toBe(true);
  });
});

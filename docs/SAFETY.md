# Safety protocol in the software

Sources: proposal Section 3.2.7, the ethics application (B6, B7), [SRS.md](SRS.md) Section 5.2 and FR-11, FR-12, FR-13, FR-25, FR-41. The written facilitator script and the on-call arrangements live with the ethics documents; this file covers what the software must do.

## Non-negotiables

1. **Get help now is always one tap away** on every participant screen, online or offline, including the lock screen and the safety screen.
2. **The PHQ-9 item 9 check runs on the phone** the moment the answer is chosen, before any network call or navigation (FR-11). It must work in airplane mode.
3. **Safety and referral wording comes only from approved content.** Never generated, never paraphrased by code or by the AI guide, never hard-coded.
4. **Safety events never hold answers or scores** (FR-13). The schema is strict and rejects unknown fields.
5. **No alarm styling for mental wellness.** No red, no flashing, no countdowns, no "emergency" banners on mood results. Calm Bone background, rose call buttons, short sentences.
6. **The app never contacts anyone automatically.** People choose to call; facilitators act in person.
7. **Nothing in the app diagnoses.** Bands are educational, with the purpose statement on every result (FR-01).

## Tiers

| Tier | Trigger | What the app does | What the facilitator does | What is recorded |
| --- | --- | --- | --- | --- |
| 1 | PHQ-9 or GAD-7 total 10 or more, item 9 = 0 | Supportive message and referral list in the result (FR-25) | Verbal check-in at the end; participant decides whether to continue | `SafetyEvent` tier 1, trigger `score_threshold` |
| 2 | Item 9 above 0 (automatic); observed or disclosed distress (facilitator) | Safety screen at once, questionnaire paused | Follow the written script; offer same-day warm handover to the on-call professional | `SafetyEvent` tier 2, trigger `item9`, `observed` or `disclosed` |
| 3 | Facilitator only: stated plan or intent, or the person cannot keep safe | Safety screen | Stay with the person; call 912 or 112; contact the on-call professional; inform the supervisor within one hour | `SafetyEvent` tier 3 with action times |

## Item 9 flow

```
participant selects an item 9 answer
  └─ store the answer in the encrypted draft (local only)
  └─ checkItem9(answer)                       @rinda/rules, synchronous
       ├─ 'tier2'               → navigate to /safety immediately
       │                          queue SafetyEvent { tier: 2, triggerType: 'item9', actions: ['safety_screen_shown', 'referral_list_shown'] }
       ├─ 'prompt_facilitator'  → (item skipped) discreet facilitator prompt in the console; no screen change
       └─ null                  → continue
```

The safety screen offers: "Talk to the facilitator now" (sessions), the call buttons from the approved referral list, "Find a health centre", and "Continue later". Whether to continue the questionnaire afterwards is the participant's choice; the default is to stop the mental-wellness module.

## Safety event schema

```ts
// packages/schemas/src/safety.ts
export const SafetyEvent = z.strictObject({
  id: z.uuid(),                       // generated on the phone (idempotent sync)
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  triggerType: z.enum(['item9', 'score_threshold', 'observed', 'disclosed']),
  actions: z.array(z.enum([
    'safety_screen_shown', 'referral_list_shown', 'facilitator_checkin',
    'warm_handover_offered', 'warm_handover_done', 'called_912', 'called_112',
    'oncall_contacted', 'supervisor_informed',
  ])),
  occurredAt: z.iso.datetime(),
  recordedByRole: z.enum(['system', 'facilitator']),
  supervisorInformedAt: z.iso.datetime().optional(), // Tier 3
});
// No answer, score, band or free-text field exists, and strictObject rejects any extra key.
```

## Facilitator tools (console)

- **Record observed or disclosed distress** (FR-13): AlertDialog, choose tier 2 or 3, tick the actions taken.
- **Tier 3 checklist** (FR-41): call links for 912 and 112, the on-call professional's number from the session setup, and buttons that stamp "on-call contacted" and "supervisor informed" with the time. A Badge shows how long ago the event started. It is not a countdown; it simply makes the one-hour supervisor rule easy to keep.
- **Item 9 skipped prompt**: a quiet notice in the session view, never shown on the participant's phone.

## PHQ-8 fallback

If the ethics committee does not approve item 9, set `mentalWellness.phqVariant` to `"PHQ-8"` in the ruleset. Item 9 is then never asked, PHQ-8 uses the same cut-offs (total 0 to 24), and Tier 2 comes only from facilitator-recorded distress.

## Content the reviewers must approve

Safety screen text, Tier 1 message, referral list entries and their hours, the "Get help now" Drawer text, and all Kinyarwanda versions. The mental-health reviewer is required on every one (FR-46).

## Tests that must always pass

- Item 9 = 1, 2 and 3 show the safety screen in airplane mode on Chromium and WebKit; 0 does not.
- Get help now opens from every route offline, including the lock and safety screens.
- The safety-event schema rejects a payload containing any answer or score field.
- A queued safety event syncs exactly once after reconnecting.
- PHQ-8 configuration never renders item 9.
- Tier 1 boundaries at totals 9 and 10 for both instruments.

## Open questions (track in SRS Section 10)

- Behaviour when item 9 is skipped (proposed: facilitator prompt only).
- Confirm every referral number, its hours and scope, and the on-call professional for each session date.

// FR-15 sentinel values reach the API; `npm run test:logs` then searches test-results/logs for them.
// Milestone 1 replaces these calls with the real participant flow once sign-in and submission exist.
import { expect, test } from '@playwright/test';

const API = 'http://localhost:3000/api/v1';
const SENTINEL_BODY = {
  studyCode: 'DEMO-SENTNNEL',
  pin: '482915',
  systolic: 187,
  diastolic: 113,
  servings: 13,
};

test('sentinel values sent to the API do not appear in responses (FR-15)', async ({ request }) => {
  for (const path of ['/health', '/flags', '/assessments', '/auth/participant']) {
    const res = await request.post(`${API}${path}?pin=482915`, {
      data: SENTINEL_BODY,
      headers: { authorization: 'Bearer sentinel-token-482915' },
    });
    const text = await res.text();
    for (const value of ['482915', '187', '113', 'DEMO-SENTNNEL']) expect(text).not.toContain(value);
  }
});

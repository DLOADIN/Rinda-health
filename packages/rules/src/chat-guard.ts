export type ChatCheck = 'ok' | 'crisis' | 'personal' | 'wellness' | 'empty';

export const CHAT_MAX_CHARS = 200;
export const CHAT_TURNS_PER_DAY = 5;

const SELF = '(?:my\\s*self|myself)';

const CRISIS = [
  /\bsuicid\w*/,
  new RegExp(`\\bkill(?:ed|ing|s)?\\s+${SELF}\\b`),
  /\bkill\s+me\b/,
  /\bkms\b/,
  /\bunalive\w*/,
  /\bend(?:ed|ing|s)?\s+(?:it|it\s+all|my\s+(?:own\s+)?life|everything)\b/,
  /\btake\s+my\s+(?:own\s+)?life\b/,
  /(?<!(?:don't|do\s+not|dont|never)\s+)\b(?:want|wanna|wana|wants|wanted)\s+(?:to\s+)?die\b/,
  /\b(?:wish|want)\s+(?:i\s+)?(?:was|were|to\s+be)\s+dead\b/,
  /\b(?:rather|better\s+off)\s+(?:be\s+)?dead\b/,
  /\bbetter\s+off\s+without\s+me\b/,
  /\b(?:don't|do\s+not|dont)\s+want\s+to\s+(?:live|be\s+alive|be\s+here|exist)\b/,
  /\b(?:tired\s+of|not\s+worth)\s+living\b/,
  /\blife\s+(?:is\s*n[o']?t|is\s+not|isnt)\s+worth\b/,
  /\b(?:nothing|no\s+reason|no\s+point)\s+(?:to\s+|in\s+)?liv(?:e|ing)\b/,
  /\bcan(?:'t|not|t)\s+go\s+on\b/,
  /\bself[\s-]?harm\w*/,
  new RegExp(`\\b(?:hurt|harm|cut)(?:ing|ting|s)?\\s+${SELF}\\b`),
  new RegExp(`\\bhang(?:ing)?\\s+${SELF}\\b`),
  /\bjump(?:ing)?\s+off\b/,
  /\b(?:rat\s+poison|poison\s+myself|drink\s+poison)\b/,
  /\btake\s+all\s+(?:my|the)\s+(?:pills|tablets|medicine)\b/,
  /\b(?:took|take|taking)\s+an\s+overdose\b/,
  /\boverdos(?:e|ing)\s+on\s+(?:pills|tablets|medicine|drugs)\b/,
  /\brap(?:e|ed|ing)\b/,
  /\bsexual(?:ly)?\s+(?:abuse|assault)\w*/,
  /\bassault(?:ed|s)?\s+me\b/,
  /\b(?:abus(?:e|es|ed|ing)|beat(?:s|en)?|hit(?:s|ting)?|hurt(?:s|ing)?)\s+me\b/,
  /\b(?:abusive|violent)\s+(?:partner|husband|wife|boyfriend|girlfriend|parent|father|mother|home)\b/,
  /\b(?:my|our)\s+(?:partner|husband|wife|boyfriend|girlfriend|parent|father|mother)\s+(?:abuses|beats|hits)\b/,
  /\bforced\s+me\b/,
  /\bdomestic\s+violence\b/,
];

const WELLNESS = [
  /\bmood\w*/,
  /\bstress\w*/,
  /\banxi\w*/,
  /\bdepress\w*/,
  /\bmental\w*/,
  /\bpanic\w*/,
  /\blonel\w*/,
  /\bworr(?:y|ied|ies|ying)\b/,
  /\b(?:sad|unhappy|hopeless|empty)\b/,
  /\b(?:phq|gad)\b/,
];

const PERSONAL = [/[\w.+-]+@[\w-]+\.[\w.]+/, /(\+?\d[\d\s-]{7,}\d)/, /\b\d{16}\b/];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/(\p{L})\1{2,}/gu, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkChatQuestion(text: string): ChatCheck {
  const raw = text.trim();
  if (raw.length < 2) return 'empty';
  const plain = normalise(raw);
  const squeezed = plain.replace(/(\p{L})\1+/gu, '$1');
  if (CRISIS.some((r) => r.test(plain) || r.test(squeezed))) return 'crisis';
  if (PERSONAL.some((r) => r.test(raw))) return 'personal';
  if (WELLNESS.some((r) => r.test(plain))) return 'wellness';
  return 'ok';
}

export type ChatCheck = 'ok' | 'crisis' | 'personal' | 'empty';

export const CHAT_MAX_CHARS = 200;
export const CHAT_TURNS_PER_DAY = 5;

const CRISIS = [
  /\bsuicid\w*/i,
  /\bkill(ing)?\s+(my\s*self|myself|me)\b/i,
  /\bend(ing)?\s+(my|it)\s+(life|all)\b/i,
  /\b(want|wanna|going)\s+to\s+die\b/i,
  /\bself[\s-]?harm\w*/i,
  /\b(hurt|harm|cut)(ing|ting)?\s+(my\s*self|myself)\b/i,
  /\bover\s*dose\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\b(rape|raped|abuse[ds]?|beaten)\b/i,
];

const PERSONAL = [/[\w.+-]+@[\w-]+\.[\w.]+/, /(\+?\d[\d\s-]{7,}\d)/, /\b\d{16}\b/];

export function checkChatQuestion(text: string): ChatCheck {
  const trimmed = text.trim();
  if (trimmed.length < 2) return 'empty';
  if (CRISIS.some((r) => r.test(trimmed))) return 'crisis';
  if (PERSONAL.some((r) => r.test(trimmed))) return 'personal';
  return 'ok';
}

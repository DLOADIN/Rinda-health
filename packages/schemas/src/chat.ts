import { z } from 'zod';
import { Language } from './common.ts';
import { ChipId } from './guide.ts';

export const ChatTurn = z.strictObject({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(600),
});
export type ChatTurn = z.infer<typeof ChatTurn>;

export const ChatRequest = z
  .strictObject({
    assessmentId: z.uuid().optional(),
    language: Language,
    question: z.string().trim().min(2).max(200).optional(),
    chipId: ChipId.optional(),
    history: z.array(ChatTurn).max(8).default([]),
  })
  .refine((b) => Boolean(b.question) !== Boolean(b.chipId), {
    message: 'Send a question or a chip, not both',
  });
export type ChatRequest = z.infer<typeof ChatRequest>;

export type ChatStatus = 'answered' | 'off_topic' | 'unavailable';
export interface ChatResponse {
  status: ChatStatus;
  paragraphs: Array<{ text: string; sourceIds: string[] }>;
  turnsLeft: number;
}

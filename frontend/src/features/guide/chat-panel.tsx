import '@/features/guide/chat-strings';
import { CHAT_MAX_CHARS, CHAT_TURNS_PER_DAY, checkChatQuestion } from '@rinda/rules/chat-guard';
import type { ChatResponse, ChatTurn } from '@rinda/schemas';
import { Bot, CircleAlert, House, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { GetHelp } from '@/components/get-help';
import { useOnline } from '@/components/offline-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { SafetyScreen } from '@/features/participant/safety-screen';

type Notice = 'crisis' | 'personal' | 'limit' | 'unavailable' | 'off' | null;

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const CHIPS = ['overview', 'tips', 'first_step', 'plan_week'] as const;

export default function ChatPanel({
  assessmentId,
  staff,
  language,
  chipLabel,
  onClose,
}: {
  assessmentId: string | null;
  staff: boolean;
  language: 'en' | 'rw';
  chipLabel: (id: string) => string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [turnsLeft, setTurnsLeft] = useState(CHAT_TURNS_PER_DAY);
  const [available, setAvailable] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/v1/chat', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ available: boolean; turnsLeft: number }>) : null))
      .then((s) => {
        if (!active || !s) return;
        setAvailable(s.available);
        setTurnsLeft(s.turnsLeft);
        if (!s.available) setNotice('off');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, sending]);

  const send = async (payload: { question?: string; chipId?: string }, shown: string) => {
    if (payload.question) {
      const check = checkChatQuestion(payload.question);
      if (check === 'crisis') {
        setInput('');
        return setNotice('crisis');
      }
      if (check === 'personal') return setNotice('personal');
      if (check === 'empty') return;
      if (check === 'wellness') {
        setInput('');
        setNotice(null);
        setMessages((m) => [
          ...m,
          { role: 'user', text: shown },
          { role: 'assistant', text: t('chat.offTopic') },
        ]);
        return;
      }
    }
    if (sending || turnsLeft <= 0) return;
    setNotice(null);
    const history: ChatTurn[] = messages.slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 600) }));
    setMessages((m) => [...m, { role: 'user', text: shown }]);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language, history, ...(assessmentId ? { assessmentId } : {}), ...payload }),
      });
      if (res.status === 429) {
        setTurnsLeft(0);
        setNotice('limit');
      } else if (res.status === 422) {
        const code = ((await res.json()) as { error?: { code?: string } }).error?.code;
        setNotice(code === 'CHAT_SAFETY' ? 'crisis' : 'personal');
      } else if (res.ok) {
        const body = (await res.json()) as ChatResponse;
        setTurnsLeft(body.turnsLeft);
        if (body.status === 'answered')
          setMessages((m) => [
            ...m,
            { role: 'assistant', text: body.paragraphs.map((p) => p.text).join('\n\n') },
          ]);
        else if (body.status === 'off_topic')
          setMessages((m) => [...m, { role: 'assistant', text: t('chat.offTopic') }]);
        else setNotice('unavailable');
      } else setNotice('unavailable');
    } catch {
      setNotice('unavailable');
    } finally {
      setSending(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (q) void send({ question: q }, q);
  };

  if (notice === 'crisis') return <SafetyScreen onStop={onClose} onContinue={() => setNotice(null)} />;

  const blocked = !online || !available || turnsLeft <= 0 || language === 'rw';

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot aria-hidden="true" className="size-4" />
          </span>
          {t('chat.title')}
        </CardTitle>
        <Badge variant="outline" className="h-auto whitespace-normal" aria-live="polite">
          {t('chat.left', { count: turnsLeft })}
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div
          className="flex max-h-[26rem] min-h-56 flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/40 p-3"
          role="log"
          aria-live="polite"
          aria-label={t('chat.title')}
        >
          <p className="max-w-[85%] self-start rounded-lg bg-card px-3 py-2 text-sm">
            {staff ? t('chat.introStaff') : t('chat.intro')}
          </p>
          {messages.map((m, i) => (
            <p
              key={i}
              className={
                m.role === 'user'
                  ? 'max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-line text-primary-foreground'
                  : 'max-w-[85%] self-start rounded-lg bg-card px-3 py-2 text-sm whitespace-pre-line'
              }
            >
              <span className="sr-only">{m.role === 'user' ? t('chat.you') : t('chat.rinda')}: </span>
              {m.text}
            </p>
          ))}
          {sending ? (
            <p className="flex items-center gap-2 self-start text-sm text-muted-foreground">
              <Spinner />
              {t('chat.thinking')}
            </p>
          ) : null}
          <div ref={end} />
        </div>

        {notice && notice !== 'off' ? (
          <Alert role="alert">
            <CircleAlert aria-hidden="true" />
            <AlertDescription className="flex flex-col gap-2">
              <span>{t(`chat.${notice}`)}</span>
              {notice === 'unavailable' ? (
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    onClose();
                    void navigate('/app');
                  }}
                >
                  <House aria-hidden="true" data-icon="inline-start" />
                  {t('guidePanel.backToDashboard')}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {!online ? <p className="text-sm text-muted-foreground">{t('chat.offline')}</p> : null}
        {notice === 'off' ? <p className="text-sm text-muted-foreground">{t('chat.off')}</p> : null}
        {language === 'rw' ? <p className="text-sm text-muted-foreground">{t('chat.english')}</p> : null}

        {!staff && assessmentId ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('chat.suggestions')}>
            {CHIPS.map((c) => (
              <Button
                key={c}
                type="button"
                variant="secondary"
                size="sm"
                className="h-auto min-h-9 whitespace-normal"
                disabled={blocked || sending}
                onClick={() => void send({ chipId: c }, chipLabel(c))}
              >
                {chipLabel(c)}
              </Button>
            ))}
          </div>
        ) : null}

        <form onSubmit={submit} className="flex flex-col gap-1">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, CHAT_MAX_CHARS))}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.label')}
              maxLength={CHAT_MAX_CHARS}
              disabled={blocked || sending}
            />
            <Button
              type="submit"
              size="icon-touch"
              aria-label={t('chat.send')}
              disabled={blocked || sending || !input.trim()}
            >
              <SendHorizontal aria-hidden="true" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('chat.chars', { count: input.length })}</p>
        </form>
        <GetHelp />
      </CardContent>
    </Card>
  );
}

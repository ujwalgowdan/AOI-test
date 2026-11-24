import { Loader2, Maximize2, Mic, Minimize2, Plus, Send } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import {
  Answer,
  type ChatTurn,
  MAX_CHARS,
  UNAVAILABLE,
} from "@/components/ChatPanel";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";

type NewTurn = ChatTurn extends infer T ? (T extends ChatTurn ? Omit<T, "id"> : never) : never;

/** BuLLM Assistant, inline under the camera (same backend conversation as the
 *  chat sheet): smart tags above the ask bar, which is pinned to the bottom.
 *  The enlarge icon grows the chat to fill the mid pane while the camera
 *  shrinks to a slim bar (Dashboard swaps the feed out when `big` is set). */
export function AssistantPanel({ big, onToggleBig }: { big: boolean; onToggleBig: () => void }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<{ stop: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const sessionId = useSessionStore((s) => (s.session?.active ? s.session.id : null));
  const adminToken = useSessionStore((s) => s.adminToken);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new turns / busy changes
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns.length, busy]);

  const add = (t: NewTurn) => setTurns((prev) => [...prev, { ...t, id: nextId.current++ } as ChatTurn]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    add({ role: "user", text: q });
    setBusy(true);
    try {
      add({ role: "assistant", res: await api.chat(q, sessionId, adminToken) });
    } catch {
      add({ role: "error", text: UNAVAILABLE });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  // + button: attach text documents; their content joins the draft so the
  // question can refer to them (the chat endpoint is text-only).
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      if (f.size > 51200) {
        toast.error(`${f.name} is too large to attach (50 KB max)`);
        continue;
      }
      const text = (await f.text()).trim();
      if (!text) continue;
      setDraft((d) => `${d ? `${d.trimEnd()}\n\n` : ""}[${f.name}]\n${text}`.slice(0, 4000));
    }
    inputRef.current?.focus();
  };

  // Mic button: dictate into the draft through the browser speech recognizer
  // (shown only where the API exists).
  interface Recog {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
    onend: () => void;
    onerror: () => void;
    start: () => void;
    stop: () => void;
  }
  const SpeechRec =
    typeof window !== "undefined"
      ? (((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
          | (new () => Recog)
          | undefined)
      : undefined;
  const toggleDictation = () => {
    if (!SpeechRec) return;
    if (recogRef.current) {
      recogRef.current.stop();
      return;
    }
    const rec = new SpeechRec();
    rec.lang = "en-IN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from({ length: e.results.length }, (_, i) => e.results[i]?.[0]?.transcript)
        .filter(Boolean)
        .join(" ");
      if (said) setDraft((d) => (d ? `${d.trimEnd()} ${said}` : said));
    };
    const done = () => {
      recogRef.current = null;
      setListening(false);
      inputRef.current?.focus();
    };
    rec.onend = done;
    rec.onerror = done;
    recogRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <section
      aria-label="BuLLM Assistant"
      className="assistant flex min-h-0 flex-col border-t"
      // Normal mode: bottom section capped at ~35% of the camera card; only the
      // message log (min-h-0 + overflow-y-auto) gives up space, so the camera,
      // Zoom/CAPTURE row and status line above are never pushed or covered.
      style={
        big
          ? { borderColor: "var(--line)", flex: "1 1 0" }
          : { borderColor: "var(--line)", flex: "0 1 auto", maxHeight: "35%" }
      }
    >
      <div className="flex shrink-0 items-center gap-1.5 pt-2.5">
        <h3>
          <img src="/bull-head.png" alt="" className="bull" aria-hidden="true" />
          <b>BuLLM</b> <i>Assistant</i>
        </h3>
        <button
          type="button"
          onClick={onToggleBig}
          aria-expanded={big}
          aria-label={big ? "Shrink assistant" : "Enlarge assistant"}
          title={big ? "Shrink assistant" : "Enlarge assistant"}
          className="ml-auto grid h-[22px] w-[22px] place-items-center rounded-md border txf transition hover:bg-[var(--soft)]"
          style={{ borderColor: "var(--line)", background: "var(--soft2)" }}
        >
          {big ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>

      {
        <>
          {(turns.length > 0 || busy) && (
          <div
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            className="mt-2 flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto py-1"
          >
            {turns.map((t) =>
              t.role === "user" ? (
                <p
                  key={t.id}
                  className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-innotech px-3 py-2 text-sm"
                  style={{ color: "var(--blue-ink)" }}
                >
                  {t.text}
                </p>
              ) : t.role === "error" ? (
                <p
                  key={t.id}
                  role="alert"
                  className="max-w-[90%] rounded-2xl rounded-bl-sm border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                >
                  {t.text}
                </p>
              ) : (
                <Answer key={t.id} res={t.res} onAsk={ask} onClose={() => {}} disabled={busy} />
              ),
            )}
            {busy && (
              <p className="flex items-center gap-2 text-sm txf">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Thinking…
              </p>
            )}
            <div ref={endRef} />
          </div>
          )}

          <SmartTags onPick={ask} disabled={busy} />

          <form
            onSubmit={submit}
            className="mb-0.5 mt-auto flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: "var(--line)", background: "var(--soft2)" }}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json"
              className="hidden"
              aria-label="Document files"
              onChange={(e) => void onFiles(e)}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Add documents"
              title="Add documents"
              className="h-7 w-7 shrink-0 rounded-full p-0 txf"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_CHARS}
              placeholder="Ask BuLLM"
              aria-label="Question"
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--faint)]"
              style={{ color: "var(--ink)" }}
            />
            {SpeechRec && (
              <Button
                type="button"
                variant="ghost"
                onClick={toggleDictation}
                disabled={busy}
                aria-label={listening ? "Stop dictation" : "Dictate"}
                aria-pressed={listening}
                title={listening ? "Stop dictation" : "Dictate"}
                className="h-7 w-7 shrink-0 rounded-full p-0"
                style={listening ? { color: "var(--blue)" } : undefined}
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="h-7 w-7 shrink-0 rounded-full p-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </>
      }
    </section>
  );
}

/** Smart tags (RFQ_automation style): the five operator questions as short
 *  blue-tinted chips above the ask bar; hover pops solid BuLLM blue. */
const SMART_TAGS: { label: string; prompt: string }[] = [
  { label: "Today's tests", prompt: "How many cables have I tested today?" },
  { label: "Why capture failed", prompt: "Why did the last capture fail?" },
  { label: "Last failed capture", prompt: "Show me the last failed capture." },
  { label: "OK vs NOT OK", prompt: "How many OK vs NOT OK in this session?" },
  { label: "Export report", prompt: "Export today's report." },
];

function SmartTags({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="mb-2 mt-2 flex shrink-0 flex-wrap items-center gap-2" aria-label="Smart tags">
      {SMART_TAGS.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => onPick(t.prompt)}
          disabled={disabled}
          className="smart-tag-chip rounded-full border px-3 py-1 text-xs font-semibold transition hover:-translate-y-0.5 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-innotech disabled:opacity-50"
          style={{
            borderColor: "var(--blue)",
            background: "var(--blue-soft)",
            color: "var(--blue)",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

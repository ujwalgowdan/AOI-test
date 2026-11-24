import { ChevronDown, Loader2, Send } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import {
  Answer,
  type ChatTurn,
  MAX_CHARS,
  Starters,
  UNAVAILABLE,
} from "@/components/ChatPanel";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";

type NewTurn = ChatTurn extends infer T ? (T extends ChatTurn ? Omit<T, "id"> : never) : never;

/** BuLLM Assistant, inline under the camera (same backend conversation as the
 *  chat sheet): smart tags centred above, ask bar pinned to the bottom. The
 *  chevron collapses the panel so the camera takes the whole pane. */
export function AssistantPanel() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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

  return (
    <section
      aria-label="BuLLM Assistant"
      className="assistant flex min-h-0 flex-col border-t"
      style={{ borderColor: "var(--line)", flex: collapsed ? "none" : "3 1 0" }}
    >
      <div className="flex items-center gap-1.5 pt-2.5">
        <h3>
          <img src="/bull-head.png" alt="" className="bull" aria-hidden="true" />
          <b>BuLLM</b> <i>Assistant</i>
        </h3>
        {collapsed && <span className="text-[11px] txf">- collapsed, camera has the full pane</span>}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand assistant" : "Collapse assistant"}
          title={collapsed ? "Expand assistant" : "Collapse assistant"}
          className="ml-auto grid h-[22px] w-[22px] place-items-center rounded-md border txf transition hover:bg-[var(--soft)]"
          style={{ borderColor: "var(--line)", background: "var(--soft2)" }}
        >
          <ChevronDown
            className="h-3 w-3 transition-transform"
            style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
          />
        </button>
      </div>

      {!collapsed && (
        <>
          <div
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            className="mt-2 flex flex-1 flex-col space-y-3 overflow-y-auto py-1"
            style={{ minHeight: 90 }}
          >
            {turns.length === 0 && (
              <div className="my-auto flex flex-col items-center justify-center gap-2">
                <div className="flex flex-wrap justify-center gap-1.5">
                  <StartersRow onPick={ask} disabled={busy} />
                </div>
              </div>
            )}
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

          {turns.length > 0 && (
            <details
              className="mb-2 mt-1 rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: "var(--line)", background: "var(--soft2)" }}
            >
              <summary className="cursor-pointer select-none py-0.5 text-xs font-medium tx2">
                Example questions
              </summary>
              <div className="max-h-40 overflow-y-auto py-2">
                <Starters onPick={ask} disabled={busy} compact />
              </div>
            </details>
          )}

          <form
            onSubmit={submit}
            className="mb-0.5 mt-auto flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: "var(--line)", background: "var(--soft2)" }}
          >
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
      )}
    </section>
  );
}

/** Smart tags: the five operator questions, centred. */
function StartersRow({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  const questions = [
    "How many cables have I tested today?",
    "Why did the last capture fail?",
    "Show me the last failed capture.",
    "How many OK vs NOT OK in this session?",
    "Export today's report.",
  ];
  return (
    <>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          disabled={disabled}
          className="rounded-full border px-3 py-1 text-[11.5px] font-semibold transition hover:bg-[var(--blue-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-innotech disabled:opacity-50"
          style={{
            borderColor: "var(--line)",
            background: "var(--blue-soft)",
            color: "var(--blue)",
          }}
        >
          {q}
        </button>
      ))}
    </>
  );
}

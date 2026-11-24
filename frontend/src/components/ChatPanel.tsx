import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Bot,
  ExternalLink,
  FileDown,
  FolderArchive,
  Loader2,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { type ChatResponse, api, withStationToken } from "@/api/client";
import { Button } from "@/components/ui/button";
import { downloadRangePdf } from "@/lib/rangeReport";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session";

export const MAX_CHARS = 300;
export const UNAVAILABLE = "The assistant is unavailable right now. Try again in a moment.";

// The 16 questions the station asked for, grouped by who usually asks them.
export const STARTERS: { group: string; questions: string[] }[] = [
  {
    group: "Operator",
    questions: [
      "How many cables have I tested today?",
      "Why did the last capture fail?",
      "Show me the last failed capture.",
      "How many OK vs NOT OK in this session?",
      "Camera says not ready, what should I do?",
      "How do I start a new session?",
      "The app looks stuck on LIVE after a restart, is my data safe?",
      "Export today's report.",
    ],
  },
  {
    group: "Inspector",
    questions: [
      "Show all NOT OK captures for this shift.",
      "Which operator had the most failures today?",
      "Compare today's count with yesterday.",
      "Download captures for this date range as ZIP.",
    ],
  },
  {
    group: "Admin",
    questions: [
      "How do I add a new operator or inspector?",
      "Change the expected wire colour order.",
      "Why is the daily count different from what I see on the dashboard?",
      "How do I take a backup before shutting down?",
    ],
  },
];

export type ChatTurn =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; res: ChatResponse }
  | { id: number; role: "error"; text: string };

type NewTurn = ChatTurn extends infer T ? (T extends ChatTurn ? Omit<T, "id"> : never) : never;

interface Props {
  turns: ChatTurn[];
  setTurns: Dispatch<SetStateAction<ChatTurn[]>>;
  onClose: () => void;
}

/** Right-hand sheet (Radix Dialog). Shows only what the backend returns: template
 *  sentences with their facts, approved cards, fixed refusals and action buttons
 *  that run the app's existing export flows. */
export function ChatPanel({ turns, setTurns, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(turns.length);
  const sessionId = useSessionStore((s) => (s.session?.active ? s.session.id : null));
  const adminToken = useSessionStore((s) => s.adminToken);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new turns / busy changes
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns.length, busy]);

  const add = (t: NewTurn) =>
    setTurns((prev) => [...prev, { ...t, id: nextId.current++ } as ChatTurn]);

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
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
      <DialogPrimitive.Content
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[var(--line)] bg-[var(--card)] shadow-2xl outline-none sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <header className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-innotech/10 text-innotech">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-base font-semibold text-[var(--ink)]">
              Assistant
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-xs text-[var(--faint)]">
              Answers come only from inspection records and approved help cards. It can't change
              anything.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close
            className="rounded-md p-1.5 text-[var(--faint)] hover:bg-[var(--soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-innotech"
            aria-label="Close assistant"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </header>

        <div
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          {turns.length === 0 && <Starters onPick={ask} disabled={busy} />}
          {turns.map((t) =>
            t.role === "user" ? (
              <p
                key={t.id}
                className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-innotech px-3 py-2 text-sm text-white"
              >
                {t.text}
              </p>
            ) : t.role === "error" ? (
              <p
                key={t.id}
                role="alert"
                className="max-w-[90%] rounded-2xl rounded-bl-sm border border-fail/30 bg-[var(--red-fill)] px-3 py-2 text-sm text-fail"
              >
                {t.text}
              </p>
            ) : (
              <Answer key={t.id} res={t.res} onAsk={ask} onClose={onClose} disabled={busy} />
            ),
          )}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-[var(--faint)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Thinking…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="border-t border-[var(--line)] p-3">
          {turns.length > 0 && (
            <details className="mb-2 rounded-md border border-[var(--line)] bg-[var(--soft2)] px-2 py-1 text-sm">
              <summary className="cursor-pointer select-none py-0.5 text-xs font-medium text-[var(--ink2)]">
                Example questions
              </summary>
              <div className="max-h-48 overflow-y-auto py-2">
                <Starters onPick={ask} disabled={busy} compact />
              </div>
            </details>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_CHARS}
              placeholder="Ask about results, sessions or how to…"
              aria-label="Question"
              className="h-10 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-innotech"
            />
            <Button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="h-10 w-10 shrink-0 p-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-right text-[11px] tabular-nums text-[var(--faint)]">
            {draft.length}/{MAX_CHARS}
          </p>
        </form>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function Starters({
  onPick,
  disabled,
  compact = false,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      {!compact && <p className="text-sm text-[var(--ink2)]">Pick a question or type your own:</p>}
      {STARTERS.map((g) => (
        <section key={g.group} aria-label={`${g.group} questions`}>
          <h3 className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">
            {g.group}
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {g.questions.map((q) => (
              <li key={q}>
                <Chip text={q} onClick={() => onPick(q)} disabled={disabled} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Chip({
  text,
  onClick,
  disabled,
}: { text: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-[var(--line)] bg-[var(--soft2)] px-3 py-1 text-left text-xs text-[var(--ink2)] hover:border-innotech/40 hover:bg-innotech/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-innotech disabled:opacity-50"
    >
      {text}
    </button>
  );
}

export function Answer({
  res,
  onAsk,
  onClose,
  disabled,
}: {
  res: ChatResponse;
  onAsk: (q: string) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const refusal = res.kind === "refusal";
  return (
    <div className="w-full space-y-2" data-kind={res.kind}>
      {res.kind !== "card" && res.kind !== "action" && (
        <p
          className={cn(
            "flex gap-2 rounded-2xl rounded-bl-sm px-3 py-2 text-sm",
            refusal
              ? "border border-[var(--orange-line)] bg-[var(--orange-fill)] text-[var(--orange-ink-soft)]"
              : "border border-[var(--line)] bg-[var(--soft2)] text-[var(--ink)]",
          )}
        >
          {refusal && <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{res.text}</span>
        </p>
      )}
      {res.card && <CardAnswer title={res.card.title} answer={res.card.answer} />}
      {res.columns.length > 0 && <Facts columns={res.columns} rows={res.rows} />}
      {res.image_url && (
        <a
          href={withStationToken(res.image_url)}
          target="_blank"
          rel="noreferrer"
          className="group block w-48 overflow-hidden rounded-lg border border-[var(--line)]"
        >
          <img
            src={withStationToken(res.image_url)}
            alt="Last failed capture"
            className="aspect-video w-full object-cover"
          />
          <span className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--faint)] group-hover:text-innotech">
            <ExternalLink className="h-3 w-3" aria-hidden="true" /> Open full image
          </span>
        </a>
      )}
      {res.action && <ActionButton action={res.action} onClose={onClose} />}
      {res.source && <p className="text-[11px] text-[var(--faint)]">Source: {res.source}</p>}
      {res.suggestions.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
          {res.suggestions.map((q) => (
            <li key={q}>
              <Chip text={q} onClick={() => onAsk(q)} disabled={disabled} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Block = { kind: "text" | "item" | "code"; text: string };

/** Display-only reflow of an approved card (its words are unchanged): joins the
 *  YAML file's soft line wraps, keeps list items and indented commands on their
 *  own lines, and splits paragraphs at blank lines. */
export function reflow(answer: string): Block[][] {
  return answer
    .split(/\n\s*\n/)
    .map((para) => {
      const blocks: Block[] = [];
      for (const line of para.split("\n")) {
        const indent = line.length - line.trimStart().length;
        const t = line.trim();
        const last = blocks[blocks.length - 1];
        if (!t) continue;
        if (/^(- |\d+\. )/.test(t)) blocks.push({ kind: "item", text: t });
        else if (indent >= 5) blocks.push({ kind: "code", text: t });
        else if (last && last.kind !== "code") last.text += ` ${t}`;
        else blocks.push({ kind: "text", text: t });
      }
      return blocks;
    })
    .filter((p) => p.length > 0);
}

function CardAnswer({ title, answer }: { title: string; answer: string }) {
  return (
    <article className="space-y-2 rounded-2xl rounded-bl-sm border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--ink)] shadow-sm">
      <h3 className="font-semibold text-[var(--ink)]">{title}</h3>
      {reflow(answer).map((para, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static card text
        <div key={i} className="space-y-1 break-words">
          {para.map((b, j) =>
            b.kind === "code" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: static card text
              <code key={j} className="block rounded bg-[var(--soft)] px-2 py-1 font-mono text-xs">
                {b.text}
              </code>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: static card text
              <p key={j} className={cn(b.kind === "item" && "pl-1")}>
                {b.text}
              </p>
            ),
          )}
        </div>
      ))}
    </article>
  );
}

function Facts({ columns, rows }: { columns: string[]; rows: ChatResponse["rows"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
      <table className="w-full text-xs">
        <thead className="bg-[var(--soft2)] text-[var(--ink2)]">
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-2 py-1.5 text-left align-bottom font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are static per answer
            <tr key={i} className="border-t border-[var(--line)]">
              {r.map((v, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                <td key={j} className="px-2 py-1.5 align-top tabular-nums text-[var(--ink)]">
                  {v ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionButton({
  action,
  onClose,
}: {
  action: NonNullable<ChatResponse["action"]>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  if (action.name === "export_daily_report") {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={exporting}
        onClick={() => void downloadRangePdf(action.start ?? "", action.end ?? "", setExporting)}
      >
        <FileDown className="mr-1.5 h-4 w-4" />
        {exporting ? "Generating…" : action.label}
      </Button>
    );
  }
  const to =
    action.start && action.end
      ? `/reports?${new URLSearchParams({ start: action.start, end: action.end })}`
      : "/reports";
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onClose();
          navigate(to);
        }}
      >
        <FolderArchive className="mr-1.5 h-4 w-4" />
        {action.label}
      </Button>
      <p className="text-[11px] text-[var(--faint)]">
        {action.start && action.end
          ? `Opens Reports with ${action.start} to ${action.end} filled in.`
          : "Opens Reports; pick the dates there."}{" "}
        The ZIP download needs the admin sign-in.
      </p>
    </div>
  );
}

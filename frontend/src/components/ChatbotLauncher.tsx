import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bot } from "lucide-react";
import { useState } from "react";

import { ChatPanel, type ChatTurn } from "@/components/ChatPanel";

/** Assistant launcher under the capture controls. Opens the side sheet; the
 *  conversation lives in this component's state only (gone on page reload). */
export function ChatbotLauncher() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        aria-label="Open chatbot"
        title="Ask the assistant"
        className="grid h-9 w-9 place-items-center rounded-full border border-innotech/30 bg-innotech/10 text-innotech transition hover:bg-innotech/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-innotech"
      >
        <Bot className="h-5 w-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <ChatPanel turns={turns} setTurns={setTurns} onClose={() => setOpen(false)} />
    </DialogPrimitive.Root>
  );
}

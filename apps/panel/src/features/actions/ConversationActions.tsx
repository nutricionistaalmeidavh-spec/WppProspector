import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { handoffConversation, resumeConversation, sendManualMessage } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionAvailability } from "./useActionAvailability";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a ação.";
}

export function ConversationActions({ leadPhone, state }: { leadPhone: string; state: string }) {
  const { conversationActions } = useActionAvailability();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["conversations", "detail", leadPhone] });

  const handoff = useMutation({
    mutationFn: () => handoffConversation(leadPhone),
    onSuccess: invalidate,
  });
  const resume = useMutation({
    mutationFn: () => resumeConversation(leadPhone),
    onSuccess: invalidate,
  });
  const send = useMutation({
    mutationFn: (text: string) => sendManualMessage(leadPhone, text),
    onSuccess: () => {
      setMessage("");
      return invalidate();
    },
  });

  const disabled = !conversationActions;
  const busy = handoff.isPending || resume.isPending || send.isPending;
  const actionError = handoff.error ?? resume.error ?? send.error;

  function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim().length > 0) send.mutate(message.trim());
  }

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Ações</h2>
        {disabled ? (
          <span className="text-xs text-muted-foreground">indisponível neste servidor</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || busy || state === "awaitingHuman"}
          onClick={() => handoff.mutate()}
        >
          Assumir atendimento
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || busy || state === "active"}
          onClick={() => resume.mutate()}
        >
          Retomar o bot
        </Button>
      </div>

      <form onSubmit={onSend} className="space-y-2">
        <Label htmlFor="manual-message">Mensagem avulsa (janela de 24 h)</Label>
        <div className="flex gap-2">
          <Input
            id="manual-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={disabled || busy}
            placeholder="Escreva uma mensagem…"
          />
          <Button
            type="submit"
            size="sm"
            disabled={disabled || busy || message.trim().length === 0}
          >
            Enviar
          </Button>
        </div>
      </form>

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(actionError)}
        </p>
      ) : null}
    </section>
  );
}

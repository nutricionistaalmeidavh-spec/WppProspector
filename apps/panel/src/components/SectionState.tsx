import type { ReactNode } from "react";
import { AlertCircle, Inbox, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-subtle flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-3 rounded-full border bg-background p-3 text-muted-foreground">
        <Inbox className="h-5 w-5" />
      </span>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Não foi possível carregar",
  description = "O servidor não respondeu como esperado.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {onRetry ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
              Tentar novamente
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function IntegrationPendingState({ feature }: { feature: string }) {
  return (
    <div className="surface-panel p-8">
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <PlugZap className="h-5 w-5" />
        </span>
        <h2 className="text-base font-semibold">{feature} indisponível</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Este recurso não está disponível nesta instalação.
        </p>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Bot, CheckCircle2 } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { isApiError } from "@/api/client";
import { useSession } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RedirectState {
  from?: string;
}

export function LoginRoute() {
  const { status, login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") {
    const target = (location.state as RedirectState | null)?.from ?? "/overview";
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(secret);
      const target = (location.state as RedirectState | null)?.from ?? "/overview";
      navigate(target, { replace: true });
    } catch (err) {
      setError(isApiError(err, 401) ? "Segredo inválido." : "Não foi possível autenticar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-foreground p-10 text-background lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,hsl(var(--primary))_0,transparent_32%),radial-gradient(circle_at_80%_70%,hsl(var(--primary))_0,transparent_28%)]" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Bot className="h-5 w-5" /></span>
          <div><p className="font-semibold">WPP CRM</p><p className="text-xs text-background/60">Operação comercial</p></div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-medium text-primary">WhatsApp prospecting workspace</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">Leads, conversas e oportunidades no mesmo fluxo de trabalho.</h1>
          <div className="mt-8 grid gap-3 text-sm text-background/75 sm:grid-cols-2">
            {["Prioridades operacionais", "Inbox com contexto", "Pipeline preparado", "Analytics de consumo"].map((item) => (
              <div key={item} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />{item}</div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-background/45">Interface de gestão protegida por sessão administrativa.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <Card className="w-full max-w-md border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
          <CardContent className="p-0 sm:p-8">
            <div className="mb-8 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Bot className="h-5 w-5" /></span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Acesso administrativo</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Entrar no WPP CRM</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Informe o segredo de acesso configurado no servidor.</p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="secret">Segredo de acesso</Label>
                <Input id="secret" type="password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} autoFocus />
              </div>
              {error ? <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={submitting || secret.length === 0}>{submitting ? "Entrando…" : "Entrar"}</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

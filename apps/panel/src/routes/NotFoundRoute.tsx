import { Link } from "react-router-dom";

export function NotFoundRoute() {
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">Página não encontrada</h1>
      <Link to="/conversations" className="text-sm text-primary underline-offset-4 hover:underline">
        Voltar para as conversas
      </Link>
    </div>
  );
}

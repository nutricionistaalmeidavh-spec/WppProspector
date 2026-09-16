import { useEffect, useState } from "react";
import { onContractMismatch } from "@/api/query-client";
import { MANAGEMENT_CONTRACT_VERSION } from "@/api/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Aviso persistente exibido quando alguma resposta da API não valida contra o
 * contrato que esta build conhece. O dado divergente não é renderizado pelas
 * telas (a query fica em estado de erro); este banner explica o porquê.
 */
export function ContractMismatchBanner() {
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => onContractMismatch(() => setMismatch(true)), []);

  if (!mismatch) return null;

  return (
    <Alert variant="warning" role="alert" className="rounded-none border-x-0 border-t-0">
      <AlertTitle>Interface desatualizada em relação à API</AlertTitle>
      <AlertDescription>
        Uma resposta da API de gestão não bate com o contrato que esta interface conhece (esperado:{" "}
        <code>{MANAGEMENT_CONTRACT_VERSION}</code>). Atualize a interface. Alguns dados podem não
        aparecer até lá.
      </AlertDescription>
    </Alert>
  );
}

# Dependências e mitigação de vulnerabilidades — novembro de 2026

## Escopo de correção

O inventário inicial do `npm audit` da `main` revelou 21 pacotes com avisos (5 HIGH e 16 MODERATE).
A branch `fix/dependency-security-20261111` aplica as correções abaixo e exige no CI um relatório com **zero alertas `moderate` ou superiores**.

| Pacote | Antes | Após | Justificativa |
| --- | --- | --- | --- |
| SheetJS `xlsx` | 0.18.5 da npm | 0.20.3, tarball oficial com URL fixa | Corrige Prototype Pollution / ReDoS. Mantém APIs de leitura e escrita usadas na importação e nos testes XLSX. |
| `zod` | 4.4.3 | 4.6.7 | Corrige consumo excessivo de memória durante validação; versões consistentes entre servidor, painel e contratos. |
| `vite` | 6.4.3 | 6.4.6 | Patch estável sem troca de major do bundler. |
| `brace-expansion` | 5.0.9 | 5.0.13 | Corrige negação de serviço por recursão e expansão de chaves. |
| `source-map-js` | 1.2.1 | 1.2.2 | Corrige DoS com offsets de sourcemaps. |
| `minimatch` | 10.2.6 | 11.0.8 | Corrige amplificação de globparts do GHSA-g3hv-75wg-m249; atualiza também o conjunto de avisos MODERATE transitivos do ESLint. |

## Origem, compatibilidade e operação

A versão corrigida do SheetJS Community Edition é publicada pelo autor em
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, não no npm (onde a versão 0.18.5 permanece desatualizada).
A URL é versionada, com integridade gravada em `package-lock.json`.
Essa origem é uma **dependência de instalação/build**, não um serviço em nuvem necessário em runtime.
O CRM permanece **R$0, self-hosted e open source**; nenhuma chave paga é exigida ou criada.
Para ambientes de build offline, será necessário fornecer um cache de dependências npm ou vendorizar o tarball.

O override de `minimatch` é intencionalmente uma atualização major transitiva;
não deve ser alterado sem executar a suíte completa, pois ferramentas de lint dependem da biblioteca.
Regressões existentes de planilhas conferem reconhecimento da aba, deduplicação, validação de telefones, preview e importação.
A regressão `scripts/dependency-security.test.mjs` impõe floors de versão e a origem segura de XLSX.

## Critérios obrigatórios antes de merge

- `npm ci` com lockfile sincronizado;
- `npm audit --audit-level=moderate` (sem findings LOW/MODERATE/HIGH/CRITICAL); 
- `npm run check:contracts`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:smoke`;
- Construção Docker e validação Compose, com Baileys e regras locais sem credenciais comerciais.
- A `main` não é alterada até autorização explícita para merge.

Para atualizações posteriores, preferir `npm install`/atualizações específicas com regressão,
não `npm audit fix --force`, que pode mudar majors e comportamento inadvertidamente.

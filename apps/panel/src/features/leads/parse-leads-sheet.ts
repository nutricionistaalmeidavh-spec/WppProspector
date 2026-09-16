import * as XLSX from "xlsx";
import { normalizeBrazilPhone, REJECTION_LABEL } from "./normalize-brazil-phone";

/** Nome canônico da aba de leads na planilha de trabalho. */
const LEADS_SHEET_NAME = "03_Leads_CRM";

/** Um lead válido extraído da planilha, pronto para `POST /admin/api/leads/import`. */
export interface LeadDraft {
  phone: string;
  displayName?: string;
  company?: string;
  segment?: string;
  city?: string;
}

/** Uma linha da planilha que não pôde ser importada. */
export interface RejectedSheetRow {
  /** Número da linha na planilha (1-based, contando o cabeçalho). */
  row: number;
  /** Conteúdo bruto da célula de telefone. */
  raw: string;
  reason: string;
}

export interface ParsedLeadsSheet {
  valid: LeadDraft[];
  rejected: RejectedSheetRow[];
}

/** A aba/colunas de leads não puderam ser reconhecidas no arquivo. */
export class UnrecognizedSheetError extends Error {
  constructor(message = "Não foi possível reconhecer a aba de leads na planilha") {
    super(message);
    this.name = "UnrecognizedSheetError";
  }
}

/** Remove acentos e baixa a caixa para comparar cabeçalhos de forma tolerante. */
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const HEADER_PATTERNS = {
  phone: /(contato|telefone|whatsapp|fone|celular)/,
  name: /(empresa|lead|nome|razao)/,
  segment: /(segmento|ramo|setor)/,
  city: /(cidade|municipio|local)/,
} as const;

interface ColumnMap {
  phone: number;
  name: number;
  segment: number | null;
  city: number | null;
}

/** Acha os índices das colunas úteis na linha de cabeçalho, ou `null` se faltar phone/name. */
function mapColumns(headerRow: unknown[]): ColumnMap | null {
  const find = (pattern: RegExp): number =>
    headerRow.findIndex((cell) => pattern.test(normalizeHeader(cell)));

  const phone = find(HEADER_PATTERNS.phone);
  const name = find(HEADER_PATTERNS.name);
  if (phone === -1 || name === -1) return null;

  const segment = find(HEADER_PATTERNS.segment);
  const city = find(HEADER_PATTERNS.city);
  return {
    phone,
    name,
    segment: segment === -1 ? null : segment,
    city: city === -1 ? null : city,
  };
}

/** Localiza a aba de leads (por nome canônico, senão pela heurística de cabeçalho). */
function locateSheet(
  workbook: XLSX.WorkBook,
): { rows: unknown[][]; columns: ColumnMap } {
  const candidates = workbook.SheetNames.includes(LEADS_SHEET_NAME)
    ? [LEADS_SHEET_NAME, ...workbook.SheetNames.filter((n) => n !== LEADS_SHEET_NAME)]
    : workbook.SheetNames;

  for (const name of candidates) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    const headerIndex = rows.findIndex((row) => mapColumns(row) !== null);
    if (headerIndex === -1) continue;
    const columns = mapColumns(rows[headerIndex]!)!;
    return { rows: rows.slice(headerIndex + 1), columns };
  }

  throw new UnrecognizedSheetError();
}

function cell(row: unknown[], index: number | null): string {
  if (index === null) return "";
  return String(row[index] ?? "").trim();
}

/** Lê os bytes de um `Blob`/`File` de forma robusta no browser e no jsdom. */
function readBlob(input: Blob): Promise<ArrayBuffer> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo"));
      reader.readAsArrayBuffer(input);
    });
  }
  return input.arrayBuffer();
}

/**
 * Lê um `.xlsx` da máquina do operador, reconhece a aba de leads e extrai
 * empresa/nome, telefone, segmento e cidade. Normaliza cada telefone para E.164
 * brasileiro e separa linhas válidas de rejeitadas (sem telefone, malformado,
 * fixo). Não faz nenhuma chamada de rede.
 */
export async function parseLeadsSheet(input: File | ArrayBuffer): Promise<ParsedLeadsSheet> {
  // Testa por `Blob` (que `File` estende) em vez de `ArrayBuffer`: mais confiável
  // entre realms (jsdom/vitest) do que `input instanceof ArrayBuffer`.
  const buffer: ArrayBuffer =
    typeof Blob !== "undefined" && input instanceof Blob
      ? await readBlob(input)
      : (input as ArrayBuffer);
  // O build ESM do SheetJS falha silenciosamente ao ler um `ArrayBuffer` cru
  // (`type: "array"`) — devolve uma pasta vazia. Uma view `Uint8Array` funciona.
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });

  const { rows, columns } = locateSheet(workbook);

  const valid: LeadDraft[] = [];
  const rejected: RejectedSheetRow[] = [];
  /** telefone E.164 → índice em `valid` (última ocorrência vence). */
  const seen = new Map<string, number>();

  rows.forEach((row, offset) => {
    // +2: uma linha de cabeçalho + base 1.
    const rowNumber = offset + 2;
    const rawPhone = cell(row, columns.phone);
    const name = cell(row, columns.name);

    // Linha totalmente vazia (sem telefone e sem nome) é ignorada, não rejeitada.
    if (rawPhone === "" && name === "") return;

    const normalized = normalizeBrazilPhone(rawPhone);
    if ("rejected" in normalized) {
      rejected.push({ row: rowNumber, raw: rawPhone, reason: REJECTION_LABEL[normalized.rejected] });
      return;
    }

    const draft: LeadDraft = { phone: normalized.phone };
    if (name) draft.displayName = draft.company = name;
    const segment = cell(row, columns.segment);
    if (segment) draft.segment = segment;
    const city = cell(row, columns.city);
    if (city) draft.city = city;

    const existingIndex = seen.get(normalized.phone);
    if (existingIndex !== undefined) {
      valid[existingIndex] = draft;
    } else {
      seen.set(normalized.phone, valid.length);
      valid.push(draft);
    }
  });

  return { valid, rejected };
}

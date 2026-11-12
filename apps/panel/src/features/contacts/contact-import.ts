export interface ImportedContact { phone: string; displayName: string }
export interface ContactImportResult { contacts: ImportedContact[]; rejected: number }
const PHONE = /^\+[1-9]\d{7,14}$/;

function normalizePhone(value: string): string | null {
  const candidate = value.replace(/[()\s.\-]/g, "");
  return PHONE.test(candidate) ? candidate : null;
}
function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quote = false;
  const source = text.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === '"') {
      if (quote && source[i + 1] === '"') { value += '"'; i++; }
      else quote = !quote;
    } else if (ch === delimiter && !quote) { row.push(value); value = ""; }
    else if (ch === "\n" && !quote) {
      row.push(value); if (row.some(part => part.trim())) rows.push(row);
      row = []; value = "";
    } else { value += ch; }
  }
  row.push(value);
  if (row.some(part => part.trim())) rows.push(row);
  return rows;
}
function unique(items: ImportedContact[], rejected: number): ContactImportResult {
  const seen = new Map<string, ImportedContact>();
  for (const item of items) {
    if (!seen.has(item.phone)) seen.set(item.phone, item);
  }
  return { contacts: [...seen.values()].slice(0, 2000), rejected };
}
function parseVcard(text: string): ContactImportResult {
  const contacts: ImportedContact[] = [];
  let rejected = 0;
  for (const part of text.split(/BEGIN:VCARD/i).slice(1)) {
    const card = part.split(/END:VCARD/i)[0]?.replace(/\r?\n[ \t]/g, "") ?? "";
    const lines = card.split(/\r?\n/);
    const name = lines.find(line => /^FN(?:;[^:]*)?:/i.test(line))?.split(":").slice(1).join(":") ?? "";
    const numberLine = lines.find(line => /^TEL(?:;[^:]*)?:/i.test(line));
    const waid = numberLine?.match(/(?:^|;)waid=(\d+)/i)?.[1];
    const raw = waid ? "+" + waid : (numberLine?.split(":").slice(1).join(":") ?? "");
    const phone = normalizePhone(raw);
    if (!phone) { rejected++; continue; }
    contacts.push({ phone, displayName: name.replace(/\\([,;])/g, "$1").trim().slice(0, 160) });
  }
  return unique(contacts, rejected);
}
export function parseContactFile(text: string): ContactImportResult {
  if (/BEGIN:VCARD/i.test(text)) return parseVcard(text);
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = first.includes(";") ? ";" : ",";
  const rows = csvRows(text, delimiter);
  const header = (rows.shift() ?? []).map(h => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const phoneColumn = header.findIndex(h => ["telefone", "celular", "phone", "numero", "whatsapp", "mobile"].includes(h));
  const nameColumn = header.findIndex(h => ["nome", "name", "contato", "displayname"].includes(h));
  if (phoneColumn < 0) throw new Error("CSV precisa de coluna telefone, celular, phone ou whatsapp.");
  const contacts: ImportedContact[] = [];
  let rejected = 0;
  for (const row of rows) {
    const phone = normalizePhone((row[phoneColumn] ?? "").trim());
    if (!phone) { rejected++; continue; }
    contacts.push({ phone, displayName: (row[nameColumn] ?? "").trim().slice(0, 160) });
  }
  return unique(contacts, rejected);
}

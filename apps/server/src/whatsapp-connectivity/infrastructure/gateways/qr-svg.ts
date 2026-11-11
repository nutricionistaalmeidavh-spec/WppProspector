/** SVG gerado inteiramente no servidor; nenhuma API de QR externa é utilizada. */
export function qrTerminalToSvg(terminal: string): string {
  const lines = terminal.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 3) throw new Error("QR incompleto");
  const width = Array.from(lines[1] ?? "").length - 2;
  if (width < 1 || width > 177) throw new Error("Tamanho inválido do QR");
  const parts: string[] = [];
  let y = 0;
  for (const line of lines.slice(1)) {
    const chars = Array.from(line);
    if (chars.length !== width + 2) continue;
    for (const char of chars.slice(1, -1)) {
      if (!["█", "▀", "▄", " "].includes(char)) throw new Error("Matriz QR inválida");
    }
    for (let x = 0; x < width; x++) {
      const c = chars[x + 1]!;
      // qrcode-terminal usa o espaço como pixel preto; os blocos representam branco.
      for (const half of [0, 1]) {
        const row = y * 2 + half;
        if (row >= width) continue;
        const black = c === " " || (c === "▀" && half === 1) || (c === "▄" && half === 0);
        if (black) parts.push(`M${x + 4} ${row + 4}h1v1h-1z`);
      }
    }
    y++;
  }
  if (y * 2 < width - 1) throw new Error("Dados QR truncados");
  const side = width + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label="Código QR do WhatsApp"><rect width="${side}" height="${side}" fill="white"/><path fill="#101010" d="${parts.join(" ")}"/></svg>`;
}

export async function makeQrSvg(payload: string): Promise<string> {
  const packageName = "qrcode-terminal";
  const module = await import(packageName) as unknown as {
    default: { generate(value: string, options: { small: boolean }, cb: (out: string) => void): void }
  };
  let terminal = "";
  module.default.generate(payload, { small: true }, output => { terminal = output; });
  return qrTerminalToSvg(terminal);
}

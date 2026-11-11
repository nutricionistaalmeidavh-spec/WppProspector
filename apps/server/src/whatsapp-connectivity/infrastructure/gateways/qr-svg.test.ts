import { describe, expect, it } from "vitest";
import { qrTerminalToSvg } from "./qr-svg.ts";

describe("QR SVG do conector local", () => {
  it("converte metades de blocos sem incluir o segredo do pareamento", () => {
    const terminal = "▄▄▄▄\n█ ▄█\n█▀ █\n▀▀▀▀";
    const svg = qrTerminalToSvg(terminal);
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 10 10"');
    expect(svg).toContain("<path d=");
    expect(svg).not.toContain("script");
  });
  it("recusa a matriz vazia ou com caracteres inesperados", () => {
    expect(() => qrTerminalToSvg("")).toThrow();
    expect(() => qrTerminalToSvg("<script>")).toThrow();
  });
});

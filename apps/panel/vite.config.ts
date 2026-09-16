/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * A SPA é servida sob `/admin` (estático pelo próprio bot em produção; dev server
 * aqui em desenvolvimento). O proxy encaminha `/admin/api` para o processo do bot
 * para que as chamadas fiquem na mesma origem sob `/admin` e o cookie de sessão
 * (`Path=/admin`, `Secure`, `SameSite=Strict`) seja enviado.
 */
const BOT_ORIGIN = process.env.BOT_ORIGIN ?? `http://localhost:${process.env.PORT ?? "3000"}`;

export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // Um único zod/react entre a SPA e os schemas importados de
    // `wpp_prospector_bot_server/contracts` (dep `file:`), senão `instanceof`
    // ZodType quebra e há dois Reacts.
    dedupe: ["react", "react-dom", "zod"],
  },
  optimizeDeps: {
    // O subcaminho `./contracts` resolve para TS-fonte em dev (condição
    // `development` do `exports`); deixá-lo fora do pré-bundle do esbuild faz o
    // Vite transpilá-lo pelo pipeline normal.
    exclude: ["wpp_prospector_bot_server"],
  },
  server: {
    port: 5173,
    // Permite servir o TS-fonte do pacote irmão linkado via `file:`.
    fs: { allow: [".."] },
    proxy: {
      "/admin/api": {
        target: BOT_ORIGIN,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/admin/api": {
        target: BOT_ORIGIN,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
});

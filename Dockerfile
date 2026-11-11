# Ambiente local gratuito: Node, SQLite e conector não oficial Baileys.
# Nenhuma API comercial é exigida ou habilitada.
FROM node:24-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci \
 && cd apps/server \
 && npm install --no-save --package-lock=false --workspaces=false baileys@6.7.24 pino@9.14.0 qrcode-terminal@0.12.0 \
 && cd ../.. \
 && npm run build \
 && mkdir -p apps/server/data \
 && chown -R node:node apps/server/data
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node
CMD ["npm","start"]

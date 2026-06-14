FROM oven/bun:1.3.10-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --chown=bun:bun package.json bun.lock tsconfig.json ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun scripts ./scripts

RUN bun install --frozen-lockfile --production

USER bun

EXPOSE 8787

CMD ["bun", "run", "x:webhook"]

FROM node:22-alpine AS builder
WORKDIR /workspace
COPY sdk/ ./sdk/
COPY node/ ./node/
RUN cd sdk && npm install --no-audit --no-fund && npm run build
RUN cd node && npm install --no-audit --no-fund && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=builder /workspace/sdk/dist ./sdk/dist
COPY --from=builder /workspace/sdk/package.json ./sdk/package.json
COPY --from=builder /workspace/node/dist ./node/dist
COPY --from=builder /workspace/node/package.json ./node/package.json
COPY --from=builder /workspace/node/node_modules ./node/node_modules
WORKDIR /app/node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD sh -c 'wget -qO- "http://127.0.0.1:${PORT:-4000}/health" || exit 1'
CMD ["node", "dist/index.js"]

# syntax=docker/dockerfile:1
ARG NODE_VERSION=20.11-alpine

from --platform=linux/amd64 node:${NODE_VERSION} as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci && \
    # install and build
    npm run build

FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
USER nonroot
HEALTHCHECK --interval=30s --timeout=3s \
  CMD ["node", "-e", "process.exit(0)"]
CMD ["dist/index.js"]

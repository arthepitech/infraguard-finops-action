FROM node:20.11-alpine
WORKDIR /app
COPY . .
RUN addgroup -S app && adduser -S app -G app
USER app
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "process.exit(0)"
CMD ["node", "index.js"]

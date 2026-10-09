# API image. Build from the repository root:
#   docker build -f backend/Dockerfile -t rinda-api .
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY packages/rules/package.json packages/rules/
COPY packages/schemas/package.json packages/schemas/
COPY packages/content/package.json packages/content/
RUN npm ci --workspace @rinda/backend --include-workspace-root=false
COPY packages ./packages
COPY backend ./backend
ENV NODE_ENV=production
USER node
EXPOSE 3000
WORKDIR /app/backend
# Apply pending SQL migrations, then start. DATABASE_URL, DIRECT_URL and SESSION_SECRET come from the secret store.
CMD ["sh", "-c", "npx tsx server.ts migrate && npx tsx server.ts"]

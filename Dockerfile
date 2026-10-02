# ---- Build stage: install all workspaces and compile shared/server/client ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci
COPY . .
RUN npm run build

# ---- Run stage: production deps + compiled output only ----
# Persist snapshots with: docker run -v monopoly-data:/app/server/data ...
# Configure with: -e ALLOWED_ORIGIN=https://a.com,https://b.com -e REDIS_URL=... -e DEBUG_KEY=...
FROM node:24-alpine
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
RUN npm ci --omit=dev
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3001
CMD ["node", "server/dist/index.js"]

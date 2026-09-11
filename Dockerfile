# ---- Build stage: install all workspaces and compile shared/server/client ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install
COPY . .
RUN npm run build

# ---- Run stage: production deps + compiled output only ----
FROM node:24-alpine
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
RUN npm install --omit=dev
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3001
CMD ["node", "server/dist/index.js"]

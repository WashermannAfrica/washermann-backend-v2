FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ─── Development stage ───────────────────────────────────────────────────────
FROM base AS development
RUN npm install
COPY . .
CMD ["npm", "run", "start:dev"]

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]

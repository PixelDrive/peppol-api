FROM node:24-alpine AS base

RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS dependencies

RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm check-types
RUN pnpm build
RUN pnpm prune --prod

FROM node:24-alpine AS runner

ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat openssl
RUN adduser -D api
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

USER api
EXPOSE 3001
CMD ["node", "dist/index.mjs"]

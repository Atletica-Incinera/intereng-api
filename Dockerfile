FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
COPY schema.prisma ./schema.prisma
COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN npx prisma generate --schema schema.prisma
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/schema.prisma ./schema.prisma
COPY package*.json ./
EXPOSE 3000
CMD ["npm", "run", "start:prod"]

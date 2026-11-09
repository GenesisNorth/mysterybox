# Production image for any container host (Railway, Fly.io, a VPS, …). Render can use render.yaml instead.
# Build:  docker build -t gratitude-stories .
# Run:    docker run --env-file .env.production -p 3000:3000 gratitude-stories
# Migrate (once per deploy, before starting): docker run --env-file .env.production gratitude-stories npm run db:migrate:built

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY db ./db
COPY public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/src/server.js"]

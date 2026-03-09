# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /build

# Reproduce the monorepo layout so tsconfig extends paths resolve correctly
COPY tsconfig.json ./tsconfig.json
COPY packages/proxy/package.json ./packages/proxy/
COPY packages/proxy/tsconfig.json ./packages/proxy/
COPY packages/proxy/src/ ./packages/proxy/src/

WORKDIR /build/packages/proxy
RUN npm install
RUN npx tsc && cp -r src/config dist/

# Stage 2: Production
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app

COPY packages/proxy/package.json ./
RUN npm install --production && npm cache clean --force

COPY --from=build /build/packages/proxy/dist/ ./dist/

RUN mkdir -p /app/plugins && \
    addgroup -S proxy && adduser -S proxy -G proxy && \
    chown -R proxy:proxy /app
USER proxy

ENV CONFIG_PATH=/app/config/collections.yaml
ENV PLUGINS_DIR=/app/plugins

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]

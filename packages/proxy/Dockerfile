FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY dist/ ./dist/

# Default config (overridden by volume mount)
COPY src/config/ ./config/

# External plugins directory (populated by volume mount)
RUN mkdir -p /app/plugins

ENV CONFIG_PATH=/app/config/collections.yaml
ENV PLUGINS_DIR=/app/plugins

EXPOSE 3000
CMD ["node", "dist/index.js"]

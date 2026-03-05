FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY src/ src/
COPY tsconfig.json ./
EXPOSE 3000
ENV UPSTREAM_HOST=http://mock-api:3001
CMD ["npx", "tsx", "src/index.ts"]

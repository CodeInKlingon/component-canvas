FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY dist ./dist

ENV HOST=0.0.0.0 \
    PORT=7100

EXPOSE 7100

CMD ["node", "dist/index.js"]

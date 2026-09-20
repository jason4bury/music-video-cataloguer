FROM node:20-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY public ./public

ENV PORT=3211 \
    LIBRARY_PATH=/videos \
    DATA_DIR=/data \
    SCAN_ON_START=true \
    SCAN_INTERVAL_MINUTES=60

EXPOSE 3211

CMD ["node", "server/index.js"]

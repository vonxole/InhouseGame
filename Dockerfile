FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js words.json locations.json ./
COPY games ./games
COPY public ./public

EXPOSE 3001

CMD ["node", "server.js"]

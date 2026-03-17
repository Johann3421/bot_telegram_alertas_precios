FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bash", "docker/start-app.sh"]
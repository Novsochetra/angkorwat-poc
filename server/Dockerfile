# The live server (New Year's Eve online) for Railway: built from the repository's root folder, because the
# server imports the game's own message and name modules from src/ (server/README.md "Deploy on Railway").
# Railway: set the service variable RAILWAY_DOCKERFILE_PATH=server/Dockerfile (the game's website service
# never sets it, so it keeps building as before).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix server --omit=dev --no-audit --no-fund
COPY server server
COPY src src
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "server/main.ts"]

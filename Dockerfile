# Build a small production image for the existing Express application.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies and keep package manifests for reproducibility.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source and static assets.
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

# Run as the unprivileged node user.
USER node

EXPOSE 3000
CMD ["node", "src/app.js"]

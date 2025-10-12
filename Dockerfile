FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including dev dependencies for building)
RUN npm ci


COPY . .


RUN npm run build

# Remove dev dependencies but keep production ones
RUN npm prune --production

FROM node:22-alpine

WORKDIR /app

# Create logs directory
RUN mkdir -p /app/logs

# Copy built application from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# IMPORTANT: Copy Prisma files for runtime
COPY --from=builder /app/prisma ./prisma

# Copy custom entrypoint script
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh

# Create a non-root user for security
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

# Change ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Start the application
ENTRYPOINT ["./entrypoint.sh"]
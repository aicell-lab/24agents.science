FROM node:20-slim

# Install system dependencies required by @anthropic-ai/sandbox-runtime and general tool use
RUN apt-get update && apt-get install -y \
    bubblewrap \
    socat \
    ripgrep \
    python3 \
    python3-pip \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set up app directory
WORKDIR /app

# Copy package definition
COPY package.json tsconfig.json ./

# Install app dependencies
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript and create workspace directory with correct permissions
RUN npm run build && \
    mkdir -p /app/workspace && chmod 777 /app/workspace

# Environment variables
ENV WORKSPACE_DIR=/app/workspace
ENV IN_DOCKER=true

# Start the service
CMD ["npm", "start"]

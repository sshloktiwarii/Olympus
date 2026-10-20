# Multi-stage hermetic build for Apex Stack
# Stage 1: Rust Builder (Gateway & Enclave)
FROM rust:1.80-slim AS rust-builder
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Build apex-gateway
COPY apex-gateway ./apex-gateway
RUN cd apex-gateway && cargo build --release

# Build apex-enclave
COPY apex-enclave ./apex-enclave
RUN cd apex-enclave && cargo build --release

# Stage 2: Node Builder (Apex-Console)
FROM node:20-slim AS node-builder
WORKDIR /build/console
COPY apex-console/package*.json ./
RUN npm ci
COPY apex-console ./
RUN npm run build

# Stage 3: Minimal Production Runtime
FROM python:3.11-slim
WORKDIR /apex

# Install kernel sandboxing & process telemetry tools (Bubblewrap, procps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    bubblewrap \
    procps \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Rust compiled binaries
COPY --from=rust-builder /build/apex-gateway/target/release/apex-gateway /usr/local/bin/apex-gateway
COPY --from=rust-builder /build/apex-enclave/target/release/apex-enclave /usr/local/bin/apex-enclave

# Copy Node built frontend assets
COPY --from=node-builder /build/console/dist /apex/console-dist

# Copy Python engines
COPY apex-core /apex/apex-core
COPY apex-warden /apex/apex-warden
COPY bin /apex/bin

# Install Python requirements
RUN pip install --no-cache-dir fastapi uvicorn websockets httpx

ENV PYTHONUNBUFFERED=1
EXPOSE 8080 9000 5173

ENTRYPOINT ["python3", "/apex/bin/apex", "start", "--no-browser"]

# Build stage
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git make

WORKDIR /build

# First, copy the MPC module from the parent directory
COPY ./mpc /mpc

# Copy the mpc-service application
COPY ./app/mpc-service /build

# Download dependencies with vendor mode to handle local replace
RUN go mod download || true
RUN go mod vendor || true

# Build the binary
RUN go build -o mpc-server ./cmd/server

# Runtime stage
FROM alpine:latest

RUN apk add --no-cache ca-certificates curl

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /build/mpc-server /app/

# Create data directory
RUN mkdir -p /data/mpc

# Expose ports
EXPOSE 6000 9090

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:6000/health || exit 1

# Run the server
CMD ["/app/mpc-server"]
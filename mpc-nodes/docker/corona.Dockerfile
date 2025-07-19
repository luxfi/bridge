# Build stage for Corona
FROM golang:1.21-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

# Set working directory
WORKDIR /build

# Copy the Corona implementation
# Note: Adjust the path based on where you place the corona code
COPY corona/ ./corona/
COPY corona-service/ ./corona-service/

# Download dependencies
WORKDIR /build/corona
RUN go mod download

# Build the Corona library
RUN go build -a -installsuffix cgo -o /build/bin/corona ./main.go

# Build the service wrapper
WORKDIR /build/corona-service
RUN go mod init corona-service || true
RUN go mod edit -replace lattice-threshold-signature=../corona
RUN go mod tidy
RUN go build -a -installsuffix cgo -o /build/bin/corona-service ./main.go

# Runtime stage
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates

# Create non-root user
RUN addgroup -g 1000 corona && \
    adduser -D -u 1000 -G corona corona

# Set working directory
WORKDIR /app

# Copy binaries from builder
COPY --from=builder /build/bin/corona-service /app/
COPY --from=builder /build/bin/corona /app/

# Copy configuration files if any
# COPY config/ /app/config/

# Change ownership
RUN chown -R corona:corona /app

# Switch to non-root user
USER corona

# Expose service port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set environment defaults
ENV PARTY_ID=0 \
    THRESHOLD=2 \
    PARTIES=3 \
    PORT=8080

# Run the service
CMD ["./corona-service"]
# Build stage for Ringtail
FROM golang:1.21-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

# Set working directory
WORKDIR /build

# Copy the Ringtail implementation
# Note: Adjust the path based on where you place the ringtail code
COPY ringtail/ ./ringtail/
COPY ringtail-service/ ./ringtail-service/

# Download dependencies
WORKDIR /build/ringtail
RUN go mod download

# Build the Ringtail library
RUN go build -a -installsuffix cgo -o /build/bin/ringtail ./main.go

# Build the service wrapper
WORKDIR /build/ringtail-service
RUN go mod init ringtail-service || true
RUN go mod edit -replace lattice-threshold-signature=../ringtail
RUN go mod tidy
RUN go build -a -installsuffix cgo -o /build/bin/ringtail-service ./main.go

# Runtime stage
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates

# Create non-root user
RUN addgroup -g 1000 ringtail && \
    adduser -D -u 1000 -G ringtail ringtail

# Set working directory
WORKDIR /app

# Copy binaries from builder
COPY --from=builder /build/bin/ringtail-service /app/
COPY --from=builder /build/bin/ringtail /app/

# Copy configuration files if any
# COPY config/ /app/config/

# Change ownership
RUN chown -R ringtail:ringtail /app

# Switch to non-root user
USER ringtail

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
CMD ["./ringtail-service"]
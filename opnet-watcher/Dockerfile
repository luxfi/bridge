FROM golang:1.24-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /opnet-watcher .

FROM alpine:3.21
COPY --from=build /opnet-watcher /usr/local/bin/
ENTRYPOINT ["opnet-watcher"]

# Lux Bridge frontend — thin overlay on the bridge3 base image with the Lux
# brand pinned explicitly (symmetric to the Zoo shim at zoo/bridge/app/).

ARG UPSTREAM=ghcr.io/luxfi/bridge3:latest
FROM ${UPSTREAM}

COPY public/brand.json /app/build/client/brand.json

LABEL org.opencontainers.image.source=https://github.com/luxfi/bridge
LABEL org.opencontainers.image.description="Lux Bridge — brand-pinned image for bridge.lux.network"
LABEL org.opencontainers.image.licenses=MIT

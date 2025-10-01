FROM node:24-bookworm-slim AS fetch
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

FROM fetch AS build
COPY . ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile -r --offline

FROM gcr.io/distroless/nodejs24-debian12:nonroot
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV UV_THREADPOOL_SIZE=256
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /app .

CMD ["app/server.js"]

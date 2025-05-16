FROM nikolaik/python-nodejs:latest as builder

WORKDIR /workspace

COPY . .

ARG GITHUB_TOKEN
RUN set -e; \
    git config --global --add safe.directory /workspace; \
    git log -1; \
    export GITHUB_TOKEN="${GITHUB_TOKEN}"; \
    npm clean-install; \
    npm run all;

FROM nginxinc/nginx-unprivileged:alpine-slim
LABEL maintainer="MagicMirrorOrg"

COPY container/default.conf /etc/nginx/conf.d/
COPY container/nginx.conf /etc/nginx/

COPY --from=builder /workspace/docs /usr/share/nginx/docs/

EXPOSE 8080

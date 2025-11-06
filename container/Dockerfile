FROM node:lts AS builder

WORKDIR /workspace

COPY . .

ARG GITHUB_TOKEN WIKI_FILE
RUN <<EOF
set -e
git config --global --add safe.directory /workspace
git log -1
export GITHUB_TOKEN="${GITHUB_TOKEN}"
npm clean-install
node --run all
EOF

FROM nginxinc/nginx-unprivileged:alpine-slim
LABEL maintainer="MagicMirrorOrg"

COPY container/default.conf /etc/nginx/conf.d/
COPY container/nginx.conf /etc/nginx/

COPY --from=builder /workspace/website /usr/share/nginx/website/

EXPOSE 8080

HEALTHCHECK --timeout=10s --start-period=60s CMD wget -qO /dev/null http://0.0.0.0:8080

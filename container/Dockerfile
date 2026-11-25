FROM node:lts AS builder

WORKDIR /workspace

COPY . .

ARG GITHUB_TOKEN WIKI_FILE ASSET_VERSION CATALOGUE_REVISION

RUN <<EOF
set -e
export GITHUB_TOKEN="${GITHUB_TOKEN}"
export PIPELINE_CATALOGUE_REVISION="${CATALOGUE_REVISION}"
export SKIP_INSTALL_SIMPLE_GIT_HOOKS=1
npm clean-install
node --run all

# Replace cache-busting placeholder with the current commit SHA for deployed assets.
ASSET_VERSION="${ASSET_VERSION:-dev}"
find website -type f \( -name "*.html" -o -name "*.js" -o -name "*.css" \) \
	-exec sed -i "s/__ASSET_VERSION__/${ASSET_VERSION}/g" {} +
EOF

FROM nginx/nginx-unprivileged:alpine-slim
LABEL maintainer="MagicMirrorOrg"

COPY container/default.conf /etc/nginx/conf.d/
COPY container/nginx.conf /etc/nginx/

COPY --from=builder /workspace/website /usr/share/nginx/website/

EXPOSE 8080

HEALTHCHECK --timeout=10s --start-period=60s CMD wget -qO /dev/null http://0.0.0.0:8080

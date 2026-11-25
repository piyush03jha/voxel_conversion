FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install --no-audit --no-fund --omit=dev --save-exact @aws-sdk/client-s3@3.850.0 @aws-sdk/s3-request-presigner@3.850.0
COPY infra/storage-init/init.mjs ./init.mjs
USER node
CMD ["node", "init.mjs"]

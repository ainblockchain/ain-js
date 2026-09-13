ARG BASE_IMAGE
ARG CHAIN_IMAGE=${BASE_IMAGE}
FROM ${CHAIN_IMAGE} AS native
FROM ${BASE_IMAGE}
COPY --from=native /app/ain-blockchain /app/ain-blockchain
WORKDIR /opt/ain-js
RUN rm -rf ./src ./lib ./__tests__ ./patches ./tools/state-channel
COPY patches ./patches
COPY src ./src
COPY __tests__ ./__tests__
COPY tools/state-channel ./tools/state-channel
RUN ./node_modules/.bin/patch-package --error-on-fail && npm run build
ENTRYPOINT ["node"]

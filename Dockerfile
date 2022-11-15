FROM node:16.14
WORKDIR /app
COPY . /app/ain-js
RUN git clone https://github.com/ainblockchain/ain-blockchain.git
ENTRYPOINT ["bash", "/app/ain-js/test-pipeline.sh"]

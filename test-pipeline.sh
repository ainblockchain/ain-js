#!/bin/bash

cd /app/ain-blockchain
if [[ "$1" = 'dev' ]]; then
  git checkout develop
fi
yarn install
bash ./start_local_blockchain.sh
sleep 10s
cd /app/ain-js
yarn install
yarn test
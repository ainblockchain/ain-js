#!/bin/sh -l

cd ain-blockchain
if [[ "$1" = 'dev']]; then
  git checkout develop
fi
yarn install
bash ./start_local_blockchain.sh
sleep 10s
cd ../ain-js
yarn test
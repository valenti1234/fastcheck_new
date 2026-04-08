#!/bin/bash
npm i --verbose
npm run build
cd server
npm i --verbose
./external_providers/dequienes/setup_venv.sh
./external_providers/equifax/setup_venv.sh
./external_providers/sheriff_v2/setup_venv.sh

pm2 restart all


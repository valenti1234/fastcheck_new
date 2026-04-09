#!/bin/bash
npm i --verbose
npm run build
cd server
npm i --verbose
cd external_providers/dequienes
./setup_venv.sh
cd ..
cd equifax
./setup_venv.sh
cd ..
cd sheriff_v2
./setup_venv.sh
cd ..


pm2 restart all


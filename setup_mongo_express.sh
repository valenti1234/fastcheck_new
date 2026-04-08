#!/bin/bash
set -e

echo "=== 🌐 Installing Mongo Express Web UI ==="

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Docker not found! Run setup_docker_mongo_rabbit.sh first."
  exit 1
fi

# Credentials
MONGO_USER="admin"
MONGO_PASS="password123"
MONGO_HOST="mongodb"
MONGO_PORT="27017"

# Create Docker network if missing
if ! docker network inspect duxiter_network >/dev/null 2>&1; then
  echo "=== 🌐 Creating shared Docker network: duxiter_network"
  docker network create duxiter_network
fi

# Connect MongoDB to that network if not already
if docker ps -a --format '{{.Names}}' | grep -q '^mongodb$'; then
  docker network connect duxiter_network mongodb 2>/dev/null || true
fi

# Create Compose file for Mongo Express
cat <<EOF > docker-compose.mongo-express.yml
services:
  mongo-express:
    image: mongo-express:latest
    container_name: mongo-express
    restart: always
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_SERVER: ${MONGO_HOST}
      ME_CONFIG_MONGODB_PORT: ${MONGO_PORT}
      ME_CONFIG_MONGODB_ADMINUSERNAME: ${MONGO_USER}
      ME_CONFIG_MONGODB_ADMINPASSWORD: ${MONGO_PASS}
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: Secret3465#
    networks:
      - duxiter_network

networks:
  duxiter_network:
    external: true
EOF

echo "=== 🚀 Starting Mongo Express..."
docker compose -f docker-compose.mongo-express.yml up -d

echo "=== ✅ Mongo Express is running!"
echo "🔗 Visit: http://localhost:8081"
echo "   Login: admin / Secret3465#"
echo "   Connected to: mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}"


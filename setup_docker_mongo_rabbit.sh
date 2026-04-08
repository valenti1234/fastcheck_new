#!/bin/bash
set -e

echo "=== 🐧 Updating system packages..."
sudo apt update -y && sudo apt upgrade -y

echo "=== 🐳 Installing Docker and dependencies..."
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker’s official GPG key and repository
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "=== 📦 Installing Docker Engine and Compose..."
sudo apt update -y
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== 🔧 Enabling Docker service..."
sudo systemctl enable docker
sudo systemctl start docker

echo "=== 👤 Adding current user to docker group..."
sudo usermod -aG docker $USER
echo "⚠️  You may need to log out and back in for this to take effect."

# Create docker-compose.yml (MongoDB with authentication)
cat << 'EOF' > docker-compose.yml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    container_name: mongodb
    restart: always
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password123
    volumes:
	duxiter_mongodb_data:
		external: true
	
  rabbitmq:
    image: rabbitmq:3-management
    container_name: rabbitmq
    restart: always
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: admin123
    volumes:
      - ./rabbitmq_data:/var/lib/rabbitmq
EOF

echo "=== 🚀 Starting MongoDB and RabbitMQ containers..."
sudo docker compose up -d

echo "=== ✅ Installation complete!"
echo "MongoDB → mongodb://admin:password123@localhost:27017"
echo "RabbitMQ → http://localhost:15672 (user: admin / pass: admin123)"


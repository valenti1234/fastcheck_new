# Docker Services Setup

This project includes MongoDB and RabbitMQ running in Docker containers for development and production use.

## Services Overview

### MongoDB
- **Container Name**: `duxiter-mongodb`
- **Image**: `mongo:7.0`
- **Port**: `27017`
- **Username**: `admin`
- **Password**: `password123`
- **Database**: `duxiter`
- **Connection String**: `mongodb://admin:password123@localhost:27017/duxiter?authSource=admin`
 
### RabbitMQ
- **Container Name**: `duxiter-rabbitmq`
- **Image**: `rabbitmq:3.12-management`
- **AMQP Port**: `5672`
- **Management UI Port**: `15672`
- **Username**: `admin`
- **Password**: `password123`
- **Management UI**: http://localhost:15672
- **Connection URL**: `amqp://admin:password123@localhost:5672`

## Quick Start

### Prerequisites
- Docker installed and running
- Docker Compose installed

### Starting Services
```bash
# Start all services in detached mode
sudo docker-compose up -d

# Check if services are running
sudo docker ps
```

### Stopping Services
```bash
# Stop all services
sudo docker-compose down

# Stop and remove volumes (WARNING: This will delete all data)
sudo docker-compose down -v
```

## Management Commands

### General Docker Commands
```bash
# View running containers
sudo docker ps

# View all containers (including stopped)
sudo docker ps -a

# Restart all services
sudo docker-compose restart

# Restart specific service
sudo docker-compose restart mongodb
sudo docker-compose restart rabbitmq
```

### Viewing Logs
```bash
# View MongoDB logs
sudo docker logs duxiter-mongodb

# View RabbitMQ logs
sudo docker logs duxiter-rabbitmq

# Follow logs in real-time
sudo docker logs -f duxiter-mongodb
sudo docker logs -f duxiter-rabbitmq
```

### Service Health Checks
```bash
# Test MongoDB connection
sudo docker exec -it duxiter-mongodb mongosh --username admin --password password123 --authenticationDatabase admin --eval "db.adminCommand('ping')"

# Check RabbitMQ status
sudo docker exec -it duxiter-rabbitmq rabbitmqctl status

# List RabbitMQ users
sudo docker exec -it duxiter-rabbitmq rabbitmqctl list_users
```

## Data Persistence

Data is automatically persisted using Docker volumes:

- **`duxiter_mongodb_data`**: MongoDB database files
- **`duxiter_mongodb_config`**: MongoDB configuration files
- **`duxiter_rabbitmq_data`**: RabbitMQ data and configuration

### Volume Management
```bash
# List all volumes
sudo docker volume ls

# Inspect a specific volume
sudo docker volume inspect duxiter_mongodb_data

# Remove all volumes (WARNING: This will delete all data)
sudo docker volume prune
```

## Network Configuration

Both services are connected via the `duxiter-network` bridge network, allowing:
- Inter-service communication using container names
- Isolated network environment
- External access through exposed ports

## Application Integration

### MongoDB Connection Examples

**Node.js (using mongoose)**
```javascript
const mongoose = require('mongoose');

const connectionString = 'mongodb://admin:password123@localhost:27017/duxiter?authSource=admin';

mongoose.connect(connectionString, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
```

**Python (using pymongo)**
```python
from pymongo import MongoClient

client = MongoClient('mongodb://admin:password123@localhost:27017/duxiter?authSource=admin')
db = client.duxiter
```

### RabbitMQ Connection Examples

**Node.js (using amqplib)**
```javascript
const amqp = require('amqplib');

const connection = await amqp.connect('amqp://admin:password123@localhost:5672');
const channel = await connection.createChannel();
```

**Python (using pika)**
```python
import pika

credentials = pika.PlainCredentials('admin', 'password123')
connection = pika.BlockingConnection(
    pika.ConnectionParameters('localhost', 5672, '/', credentials)
)
channel = connection.channel()
```

## Security Considerations

⚠️ **Important**: The default credentials are for development only. For production:

1. Change default passwords
2. Use environment variables for credentials
3. Configure proper network security
4. Enable SSL/TLS encryption
5. Implement proper backup strategies

### Environment Variables
Create a `.env` file for production:
```env
MONGO_USERNAME=your_secure_username
MONGO_PASSWORD=your_secure_password
RABBITMQ_USERNAME=your_secure_username
RABBITMQ_PASSWORD=your_secure_password
```

## Troubleshooting

### Common Issues

**Port conflicts**
```bash
# Check if ports are in use
sudo netstat -tulpn | grep :27017
sudo netstat -tulpn | grep :5672
sudo netstat -tulpn | grep :15672
```

**Container won't start**
```bash
# Check container logs for errors
sudo docker logs duxiter-mongodb
sudo docker logs duxiter-rabbitmq

# Check Docker daemon status
sudo systemctl status docker
```

**Permission issues**
```bash
# Ensure user is in docker group
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

### Reset Everything
```bash
# Stop and remove containers, networks, and volumes
sudo docker-compose down -v

# Remove images (optional)
sudo docker rmi mongo:7.0 rabbitmq:3.12-management

# Start fresh
sudo docker-compose up -d
```

## Monitoring

### RabbitMQ Management Interface
Access the web interface at http://localhost:15672
- Username: `admin`
- Password: `password123`

Features:
- Queue monitoring
- Connection management
- Performance metrics
- User management

### MongoDB Monitoring
```bash
# Connect to MongoDB shell
sudo docker exec -it duxiter-mongodb mongosh --username admin --password password123 --authenticationDatabase admin

# Check database status
db.adminCommand("serverStatus")

# List databases
show dbs

# List collections
use duxiter
show collections
```

## Backup and Restore

### MongoDB Backup
```bash
# Create backup
sudo docker exec duxiter-mongodb mongodump --username admin --password password123 --authenticationDatabase admin --db duxiter --out /backup

# Copy backup from container
sudo docker cp duxiter-mongodb:/backup ./mongodb-backup
```

### MongoDB Restore
```bash
# Copy backup to container
sudo docker cp ./mongodb-backup duxiter-mongodb:/backup

# Restore database
sudo docker exec duxiter-mongodb mongorestore --username admin --password password123 --authenticationDatabase admin --db duxiter /backup/duxiter
```

## Performance Tuning

### MongoDB Optimization
- Adjust memory settings in docker-compose.yml
- Configure appropriate indexes
- Monitor slow queries

### RabbitMQ Optimization
- Adjust memory and disk limits
- Configure queue policies
- Monitor message rates

## Support

For issues related to:
- **Docker**: Check Docker documentation
- **MongoDB**: Check MongoDB documentation
- **RabbitMQ**: Check RabbitMQ documentation
- **This setup**: Check container logs and this documentation

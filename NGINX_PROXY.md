# Nginx Proxy Configuration for Duxiter

This document describes the nginx proxy setup for the Duxiter application.

## Overview

Nginx is configured as a reverse proxy to handle:
- Frontend requests (React/Vite development server)
- Backend API requests (Node.js/Express server)
- RabbitMQ Management Interface
- Static asset caching and compression
- Security headers and health checks

## Configuration Details

### Proxy Routes

| Route | Destination | Purpose |
|-------|-------------|----------|
| `/` | `http://localhost:5173` | Frontend (React/Vite) |
| `/api/` | `http://localhost:3000/` | Backend API |
| `/rabbitmq/` | `http://localhost:15672/` | RabbitMQ Management |
| `/health` | Built-in endpoint | Health check |

### Port Configuration

- **Nginx**: Port 80 (main entry point)
- **Frontend**: Port 5173 (Vite dev server)
- **Backend**: Port 3000 (Node.js/Express)
- **RabbitMQ Management**: Port 15672
- **MongoDB**: Port 27017 (direct access)

## Features

### Security Headers
- X-Frame-Options: SAMEORIGIN
- X-XSS-Protection: 1; mode=block
- X-Content-Type-Options: nosniff
- Referrer-Policy: no-referrer-when-downgrade
- Content-Security-Policy: default-src 'self' http: https: data: blob: 'unsafe-inline'

### Performance Optimizations
- **Gzip Compression**: Enabled for text-based content
- **Static Asset Caching**: 1-year cache for static files
- **WebSocket Support**: Enabled for real-time features
- **Long Timeout**: 86400 seconds for long-running requests

### Health Monitoring
- Health check endpoint: `http://localhost/health`
- Returns: `200 OK` with "healthy" response

## Management Commands

### Check Nginx Status
```bash
sudo systemctl status nginx
```

### Test Configuration
```bash
sudo nginx -t
```

### Reload Configuration
```bash
sudo systemctl reload nginx
```

### Restart Nginx
```bash
sudo systemctl restart nginx
```

### View Access Logs
```bash
sudo tail -f /var/log/nginx/access.log
```

### View Error Logs
```bash
sudo tail -f /var/log/nginx/error.log
```

## Configuration Files

- **Main Config**: `/etc/nginx/sites-available/duxiter`
- **Enabled Site**: `/etc/nginx/sites-enabled/duxiter` (symlink)
- **Main Nginx Config**: `/etc/nginx/nginx.conf`

## Usage Examples

### Access Frontend
```bash
curl http://localhost/
```

### Access Backend API
```bash
curl http://localhost/api/health
```

### Access RabbitMQ Management
```bash
curl http://localhost/rabbitmq/
# Or open in browser: http://localhost/rabbitmq/
```

### Health Check
```bash
curl http://localhost/health
```

## Development Workflow

1. **Start Docker Services** (MongoDB & RabbitMQ):
   ```bash
   sudo docker-compose up -d
   ```

2. **Start Backend Server** (Port 3000):
   ```bash
   cd server
   npm run dev
   ```

3. **Start Frontend Server** (Port 5173):
   ```bash
   npm run dev
   ```

4. **Access Application**:
   - Main App: `http://localhost/`
   - API: `http://localhost/api/`
   - RabbitMQ: `http://localhost/rabbitmq/`
   - Health: `http://localhost/health`

## Troubleshooting

### Common Issues

1. **502 Bad Gateway**:
   - Check if backend services are running
   - Verify port configurations
   - Check nginx error logs

2. **Configuration Errors**:
   ```bash
   sudo nginx -t
   ```

3. **Permission Issues**:
   ```bash
   sudo chown -R www-data:www-data /var/log/nginx/
   ```

4. **Port Conflicts**:
   ```bash
   sudo netstat -tlnp | grep :80
   ```

### Log Analysis

```bash
# Real-time access logs
sudo tail -f /var/log/nginx/access.log

# Real-time error logs
sudo tail -f /var/log/nginx/error.log

# Filter specific errors
sudo grep "error" /var/log/nginx/error.log
```

## Security Considerations

1. **HTTPS**: Consider adding SSL/TLS for production
2. **Rate Limiting**: Add rate limiting for API endpoints
3. **Access Control**: Implement IP whitelisting if needed
4. **Headers**: Security headers are already configured
5. **Logs**: Monitor access and error logs regularly

## Performance Tuning

1. **Worker Processes**: Adjust based on CPU cores
2. **Connection Limits**: Configure based on expected load
3. **Buffer Sizes**: Tune for your specific use case
4. **Cache Settings**: Optimize cache headers for static content

## Integration with Docker Services

The nginx proxy works seamlessly with the Docker services:
- **MongoDB**: Direct connection on port 27017
- **RabbitMQ**: Management UI proxied through `/rabbitmq/`
- **Application**: Frontend and backend proxied appropriately

For more information about Docker services, see `DOCKER_SERVICES.md`.
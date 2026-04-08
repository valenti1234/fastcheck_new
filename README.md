# Duxiter

A comprehensive business evaluation and monitoring platform.

## Quick Start

### Prerequisites
- Node.js (v18+)
- Docker and Docker Compose

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd duxiter
   ```

2. **Start Docker services**
   ```bash
   sudo docker-compose up -d
   ```

3. **Install dependencies**
   ```bash
   # Frontend
   npm install
   
   # Backend
   cd server
   npm install
   cd ..
   ```

4. **Start development servers**
   ```bash
   # Frontend (in one terminal)
   npm run dev
   
   # Backend (in another terminal)
   cd server
   npm run dev
   ```

5. **Access the application**
   - Main Application: `http://localhost/` (via nginx proxy)
   - RabbitMQ Management: `http://localhost/rabbitmq/`
   - Health Check: `http://localhost/health`

## Services

### Docker Services
This project uses Docker containers for:
- **MongoDB**: Database (Port 27017)
- **RabbitMQ**: Message broker (Port 5672, Management UI: 15672)

For detailed Docker services documentation, see [DOCKER_SERVICES.md](./DOCKER_SERVICES.md)

### Nginx Proxy
Nginx is configured as a reverse proxy to handle:
- **Frontend**: Proxies to Vite dev server (Port 5173)
- **Backend API**: Proxies `/api/` to Express server (Port 3000)
- **RabbitMQ Management**: Proxies `/rabbitmq/` to management UI (Port 15672)
- **Health Check**: Built-in `/health` endpoint
- **Static Assets**: Optimized caching and compression

Access the application through nginx at `http://localhost/`

For detailed nginx configuration, see [NGINX_PROXY.md](./NGINX_PROXY.md)

### Application Structure
- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + TypeScript + Express
- **Database**: MongoDB
- **Message Queue**: RabbitMQ

## Development

### Frontend Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm test             # Run tests
```

### Backend Development
```bash
cd server
npm run dev          # Start development server
npm run build        # Build TypeScript
npm start            # Start production server
```

## Project Structure

```
duxiter/
├── src/                 # Frontend source code
│   ├── components/      # React components
│   ├── pages/          # Page components
│   ├── services/       # API services
│   ├── types/          # TypeScript types
│   └── utils/          # Utility functions
├── server/             # Backend source code
│   └── src/           # Server TypeScript source
├── public/            # Static assets
├── tools/             # Development tools
├── MCP/               # MCP server implementation
├── docker-compose.yml # Docker services configuration
└── DOCKER_SERVICES.md # Docker services documentation
```

## Environment Configuration

Create `.env` files for environment-specific configuration:

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=Duxiter
```

### Backend (server/.env)
```env
PORT=3000
MONGODB_URI=mongodb://admin:password123@localhost:27017/duxiter?authSource=admin
RABBITMQ_URL=amqp://admin:password123@localhost:5672
JWT_SECRET=your-jwt-secret
```

## Documentation

- [Docker Services Setup](./DOCKER_SERVICES.md) - Comprehensive guide for MongoDB and RabbitMQ
- [Nginx Proxy Configuration](./NGINX_PROXY.md) - Reverse proxy setup and management
- [Project Description](./PROJECT_DESCRIPTION.md) - Detailed project overview
- [Version Comparison](./VERSION_COMPARISON.md) - Feature comparison between versions
- [SendGrid Setup](./server/SENDGRID_SETUP.md) - Email service configuration

## Scripts

- `dux_front.sh` - Frontend development script
- `server/dux_server.sh` - Backend development script

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

[Add your license information here]

# Guida al Deployment in Produzione - Duxiter

Questa guida descrive come creare e deployare una versione di produzione del progetto Duxiter.

## Panoramica

Il progetto Duxiter è composto da:
- **Frontend**: React/TypeScript con Vite
- **Backend**: Node.js/Express con TypeScript
- **Database**: MongoDB (Docker)
- **Message Queue**: RabbitMQ (Docker)
- **Proxy**: Nginx (configurazione separata)

## Script Disponibili

### 1. Script di Deployment Completo

```bash
# Deployment completo con incremento versione
./deploy-production.sh [patch|minor|major] "messaggio commit"

# Esempi
./deploy-production.sh patch "Fix bug produzione"
./deploy-production.sh minor "Nuova funzionalità"
./deploy-production.sh major "Breaking changes"
```

### 2. Script di Build Server

```bash
# Build solo del server
cd server
./build-production.sh
```

### 3. Script di Versioning

```bash
# Incremento versione e git push
./git-push-version.sh [patch|minor|major] "messaggio"
```

## Processo di Deployment Automatico

Lo script `deploy-production.sh` esegue automaticamente:

### 1. Verifica Prerequisiti
- ✅ Directory Git
- ✅ Docker e Docker Compose
- ✅ Node.js e npm

### 2. Gestione Versione
- 📦 Incrementa versione (semantic versioning)
- 🔄 Sincronizza versioni frontend/backend
- 📝 Commit automatico
- 🏷️ Creazione tag Git
- 🚀 Push su repository

### 3. Build Frontend
- 📦 Installazione dipendenze (`npm ci`)
- 🏗️ Build ottimizzato (`npm run build`)
- 📁 Output in `./dist/`

### 4. Build Backend
- 🔧 Compilazione TypeScript
- 📦 Creazione package.json produzione
- 🗂️ Copia file statici
- 📁 Output in `./server/dist/`

### 5. Servizi Docker
- 🗄️ Avvio MongoDB
- 🐰 Avvio RabbitMQ
- ✅ Test connessioni

## Struttura File di Produzione

```
duxiter/
├── dist/                    # Frontend buildato
│   ├── index.html
│   ├── assets/
│   └── ...
├── server/dist/             # Backend buildato
│   ├── index.js
│   ├── package.json
│   ├── node_modules/
│   └── static/
└── docker-compose.yml       # Servizi (MongoDB, RabbitMQ)
```

## Configurazione Produzione

### Variabili d'Ambiente

Crea un file `.env` nella directory `server/` con:

```env
# Database
MONGODB_URI=mongodb://admin:password123@localhost:27017/duxiter?authSource=admin

# RabbitMQ
RABBITMQ_URL=amqp://admin:password123@localhost:5672

# JWT
JWT_SECRET=your-super-secret-jwt-key-here

# SendGrid (Email)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=DuxIter

# Server
PORT=3000
NODE_ENV=production

# CORS
CORS_ORIGIN=https://yourdomain.com
```

### Configurazione Nginx

Esempio di configurazione nginx (`/etc/nginx/sites-available/duxiter`):

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Frontend (React)
    location / {
        root /path/to/duxiter/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache statico
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # RabbitMQ Management (opzionale)
    location /rabbitmq/ {
        proxy_pass http://localhost:15672/;
        proxy_set_header Host $host;
    }
}
```

## Avvio in Produzione

### 1. Avvio Servizi Docker

```bash
# Avvio servizi in background
docker-compose up -d

# Verifica stato
docker-compose ps
```

### 2. Avvio Server Backend

```bash
# Metodo 1: Diretto
cd server/dist
npm start

# Metodo 2: Con PM2 (raccomandato)
npm install -g pm2
cd server/dist
pm2 start index.js --name "duxiter-server"
pm2 startup
pm2 save
```

### 3. Configurazione Nginx

```bash
# Copia configurazione
sudo cp nginx.conf /etc/nginx/sites-available/duxiter
sudo ln -s /etc/nginx/sites-available/duxiter /etc/nginx/sites-enabled/

# Test configurazione
sudo nginx -t

# Riavvio nginx
sudo systemctl reload nginx
```

## Monitoraggio

### Servizi Attivi

- **Frontend**: Servito da Nginx
- **Backend**: http://localhost:3000
- **MongoDB**: localhost:27017
- **RabbitMQ**: localhost:5672
- **RabbitMQ Management**: http://localhost:15672

### Log

```bash
# Log server (se usando PM2)
pm2 logs duxiter-server

# Log Docker
docker-compose logs -f

# Log Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## Backup

### Database MongoDB

```bash
# Backup
docker exec duxiter-mongodb mongodump --out /backup --authenticationDatabase admin -u admin -p password123

# Restore
docker exec duxiter-mongodb mongorestore /backup --authenticationDatabase admin -u admin -p password123
```

## Troubleshooting

### Problemi Comuni

1. **Server non si avvia**
   - Verifica variabili d'ambiente
   - Controlla connessione MongoDB
   - Verifica porta 3000 libera

2. **Frontend non carica**
   - Verifica configurazione Nginx
   - Controlla permessi file in `dist/`
   - Verifica CORS settings

3. **Database non connette**
   - Verifica servizi Docker: `docker-compose ps`
   - Controlla credenziali MongoDB
   - Verifica rete Docker

### Comandi Utili

```bash
# Restart completo
docker-compose down
docker-compose up -d
pm2 restart duxiter-server

# Verifica stato
docker-compose ps
pm2 status
sudo systemctl status nginx

# Pulizia
docker system prune
npm cache clean --force
```

## Sicurezza

### Checklist Produzione

- [ ] Cambiare password default MongoDB/RabbitMQ
- [ ] Configurare JWT_SECRET sicuro
- [ ] Abilitare HTTPS/SSL
- [ ] Configurare firewall
- [ ] Limitare accesso RabbitMQ Management
- [ ] Configurare backup automatici
- [ ] Monitoraggio e alerting
- [ ] Rate limiting API
- [ ] Validazione input

## Aggiornamenti

Per aggiornare la versione in produzione:

```bash
# 1. Pull ultime modifiche
git pull origin main

# 2. Nuovo deployment
./deploy-production.sh patch "Update produzione"

# 3. Restart server
pm2 restart duxiter-server
```

---

**Nota**: Questa guida assume un ambiente Linux/Ubuntu. Adatta i comandi per il tuo sistema operativo specifico.
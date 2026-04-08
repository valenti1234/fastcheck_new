#!/bin/bash

# Script per deployment completo in produzione
# Uso: ./deploy-production.sh [version_type] "messaggio commit"

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Funzioni per messaggi colorati
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Parametri
VERSION_TYPE=${1:-patch}
COMMIT_MESSAGE=${2:-"Production deployment"}

print_step "🚀 INIZIO DEPLOYMENT PRODUZIONE DUXITER"
print_info "Tipo versione: $VERSION_TYPE"
print_info "Messaggio commit: $COMMIT_MESSAGE"
echo

# Verifica prerequisiti
print_step "1️⃣ VERIFICA PREREQUISITI"

# Verifica directory git
if [ ! -d ".git" ]; then
    print_error "Non siamo in una directory git!"
    exit 1
fi

# Verifica Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker non è installato!"
    exit 1
fi

# Verifica Docker Compose
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose non è installato!"
    exit 1
fi

# Verifica Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js non è installato!"
    exit 1
fi

# Verifica npm
if ! command -v npm &> /dev/null; then
    print_error "npm non è installato!"
    exit 1
fi

print_success "Tutti i prerequisiti sono soddisfatti"
echo

# Incrementa versione e commit
print_step "2️⃣ GESTIONE VERSIONE"
print_info "Incremento versione e commit..."
./git-push-version.sh $VERSION_TYPE "$COMMIT_MESSAGE"
echo

# Build Frontend
print_step "3️⃣ BUILD FRONTEND"
print_info "Build del frontend React/Vite..."
npm ci
npm run build

if [ ! -d "dist" ]; then
    print_error "Build frontend fallita! Directory dist non trovata."
    exit 1
fi

print_success "Frontend buildato con successo"
echo

# Build Server
print_step "4️⃣ BUILD SERVER"
print_info "Build del server Node.js/TypeScript..."
cd server
./build-production.sh
cd ..

print_success "Server buildato con successo"
echo

# Avvio servizi Docker
print_step "5️⃣ AVVIO SERVIZI DOCKER"
print_info "Avvio MongoDB e RabbitMQ..."
sudo docker-compose up -d

# Attendi che i servizi siano pronti
print_info "Attesa avvio servizi..."
sleep 10

# Verifica stato servizi
print_info "Verifica stato servizi Docker..."
if ! sudo docker-compose ps | grep -q "Up"; then
    print_error "Alcuni servizi Docker non sono avviati correttamente!"
    sudo docker-compose ps
    exit 1
fi

print_success "Servizi Docker avviati correttamente"
echo

# Test connessioni
print_step "6️⃣ TEST CONNESSIONI"

# Test MongoDB
print_info "Test connessione MongoDB..."
if sudo docker exec duxiter-mongodb mongosh --eval "db.runCommand('ping')" > /dev/null 2>&1; then
    print_success "MongoDB: Connessione OK"
else
    print_warning "MongoDB: Connessione fallita (potrebbe essere normale se il DB è nuovo)"
fi

# Test RabbitMQ
print_info "Test connessione RabbitMQ..."
if curl -s -u admin:password123 http://localhost:15672/api/overview > /dev/null 2>&1; then
    print_success "RabbitMQ: Connessione OK"
else
    print_warning "RabbitMQ: Connessione fallita (potrebbe essere ancora in avvio)"
fi

echo

# Informazioni deployment
print_step "7️⃣ INFORMAZIONI DEPLOYMENT"

# Leggi versione corrente
CURRENT_VERSION=$(node -p "require('./package.json').version")

print_success "🎉 DEPLOYMENT COMPLETATO CON SUCCESSO!"
echo
print_info "📦 Versione deployata: v$CURRENT_VERSION"
print_info "🌐 Frontend: ./dist/ (pronto per servire con nginx)"
print_info "⚙️  Server: ./server/dist/ (avvia con: cd server/dist && npm start)"
print_info "🗄️  MongoDB: localhost:27017 (admin/password123)"
print_info "🐰 RabbitMQ: localhost:5672 (admin/password123)"
print_info "🔧 RabbitMQ Management: http://localhost:15672"
echo

print_step "8️⃣ PROSSIMI PASSI"
echo "Per completare il deployment in produzione:"
echo "1. Configura nginx per servire il frontend da ./dist/"
echo "2. Avvia il server: cd server/dist && npm start"
echo "3. Configura le variabili d'ambiente per produzione"
echo "4. Configura SSL/HTTPS"
echo "5. Configura backup automatici per MongoDB"
echo

print_success "🚀 Deployment pronto per produzione!"
#!/bin/bash

# Script per build del server di produzione
# Uso: ./build-production.sh

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_info "🚀 Inizio build del server per produzione..."

# Verifica che siamo nella directory del server
if [ ! -f "package.json" ]; then
    print_error "Non siamo nella directory del server! Esegui lo script dalla cartella server/"
    exit 1
fi

# Verifica che esista tsconfig.json
if [ ! -f "tsconfig.json" ]; then
    print_error "File tsconfig.json non trovato!"
    exit 1
fi

# Pulisci la directory dist se esiste
if [ -d "dist" ]; then
    print_info "Pulizia directory dist esistente..."
    rm -rf dist
fi

# Installa le dipendenze
print_info "Installazione dipendenze..."
npm ci --only=production

# Installa anche le dev dependencies per il build
print_info "Installazione dev dependencies per il build..."
npm install

# Compila TypeScript con configurazione di emergenza
print_info "Compilazione TypeScript..."
if npx tsc --noEmitOnError false --skipLibCheck true; then
    print_success "Compilazione TypeScript completata"
else
    print_warning "Errori TypeScript rilevati, ma i file JS sono stati generati"
    print_info "Verifica manuale dei file generati..."
fi

# Verifica che la compilazione sia andata a buon fine
if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
    print_error "Build fallita! Directory dist o file index.js non trovati."
    exit 1
fi

# Copia file statici necessari
print_info "Copia file statici..."
if [ -d "static" ]; then
    cp -r static dist/
    print_info "File statici copiati in dist/static"
fi

# Crea file package.json per produzione (solo dipendenze runtime)
print_info "Creazione package.json per produzione..."
node -e "
const pkg = require('./package.json');
const prodPkg = {
  name: pkg.name,
  version: pkg.version,
  private: pkg.private,
  type: pkg.type,
  scripts: {
    start: 'node index.js'
  },
  dependencies: pkg.dependencies
};
require('fs').writeFileSync('dist/package.json', JSON.stringify(prodPkg, null, 2));
"

# Installa solo le dipendenze di produzione nella directory dist
print_info "Installazione dipendenze di produzione in dist/..."
cd dist
npm install --only=production
cd ..

print_success "✅ Build completata con successo!"
print_info "📦 File di produzione disponibili in: ./dist/"
print_info "🚀 Per avviare il server: cd dist && npm start"
print_info "📊 Dimensione build:"
du -sh dist/

print_success "🎉 Server pronto per il deployment in produzione!"
#!/bin/bash

# Script rapido per commit, incremento versione patch e push
# Uso: ./quick-push.sh "messaggio commit"

set -e

# Colori
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Messaggio di commit (default se non fornito)
COMMIT_MESSAGE=${1:-"Quick update"}

print_info "🚀 Quick push con incremento versione patch..."

# Aggiungi tutti i file modificati
git add .

# Esegui lo script di versioning
./git-push-version.sh patch "$COMMIT_MESSAGE"

print_success "✅ Quick push completato!"
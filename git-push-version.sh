#!/bin/bash

# Script per incrementare la versione e fare git push
# Uso: ./git-push-version.sh [patch|minor|major] "messaggio commit"

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funzione per stampare messaggi colorati
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

# Parametri
VERSION_TYPE=${1:-patch}  # default: patch
COMMIT_MESSAGE=${2:-"Bump version and update"}

# Validazione parametri
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    print_error "Tipo di versione non valido. Usa: patch, minor, o major"
    exit 1
fi

# Verifica che siamo in una directory git
if [ ! -d ".git" ]; then
    print_error "Non siamo in una directory git!"
    exit 1
fi

# Verifica che non ci siano modifiche non committate
if [ -n "$(git status --porcelain)" ]; then
    print_warning "Ci sono modifiche non committate. Vuoi continuare? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        print_info "Operazione annullata."
        exit 0
    fi
fi

print_info "Inizio processo di versioning e push..."

# Funzione per incrementare la versione
increment_version() {
    local current_version=$1
    local version_type=$2
    
    # Estrai i numeri di versione
    local major=$(echo $current_version | cut -d. -f1)
    local minor=$(echo $current_version | cut -d. -f2)
    local patch=$(echo $current_version | cut -d. -f3)
    
    case $version_type in
        "major")
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        "minor")
            minor=$((minor + 1))
            patch=0
            ;;
        "patch")
            patch=$((patch + 1))
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Leggi la versione corrente dal package.json principale
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_info "Versione corrente: $CURRENT_VERSION"

# Calcola la nuova versione
NEW_VERSION=$(increment_version $CURRENT_VERSION $VERSION_TYPE)
print_info "Nuova versione: $NEW_VERSION"

# Aggiorna package.json principale
print_info "Aggiornamento package.json principale..."
npm version $NEW_VERSION --no-git-tag-version

# Aggiorna package.json del server
if [ -f "server/package.json" ]; then
    print_info "Aggiornamento package.json del server..."
    cd server
    npm version $NEW_VERSION --no-git-tag-version
    cd ..
fi

# Aggiungi i file modificati
print_info "Aggiunta file modificati a git..."
git add package.json package-lock.json
if [ -f "server/package.json" ]; then
    git add server/package.json server/package-lock.json
fi

# Commit delle modifiche
print_info "Commit delle modifiche..."
git commit -m "$COMMIT_MESSAGE - v$NEW_VERSION"

# Crea tag
print_info "Creazione tag v$NEW_VERSION..."
git tag -a "v$NEW_VERSION" -m "Release version $NEW_VERSION"

# Push del codice e dei tag
print_info "Push del codice..."
git push origin $(git branch --show-current)

print_info "Push dei tag..."
git push origin --tags

print_success "✅ Processo completato!"
print_success "📦 Versione aggiornata a: $NEW_VERSION"
print_success "🚀 Codice e tag pushati su origin"

# Mostra il log degli ultimi commit
print_info "Ultimi commit:"
git log --oneline -5
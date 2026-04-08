# Script di Versioning e Git Push

Questi script automatizzano il processo di incremento della versione e push su git per il progetto Duxiter.

## Script Disponibili

### 1. `git-push-version.sh` - Script Completo

Script principale che gestisce l'incremento della versione e il push completo.

**Uso:**
```bash
./git-push-version.sh [patch|minor|major] "messaggio commit"
```

**Parametri:**
- `patch` (default): Incrementa l'ultima cifra (1.5.0 → 1.5.1)
- `minor`: Incrementa la cifra centrale (1.5.0 → 1.6.0)
- `major`: Incrementa la prima cifra (1.5.0 → 2.0.0)
- `messaggio commit`: Messaggio per il commit (opzionale)

**Esempi:**
```bash
# Incremento patch con messaggio default
./git-push-version.sh

# Incremento minor con messaggio personalizzato
./git-push-version.sh minor "Aggiunta nuova funzionalità"

# Incremento major per breaking changes
./git-push-version.sh major "Refactoring completo API"
```

### 2. `quick-push.sh` - Push Rapido

Script semplificato per un push rapido con incremento automatico patch.

**Uso:**
```bash
./quick-push.sh "messaggio commit"
```

**Esempi:**
```bash
# Push rapido con messaggio
./quick-push.sh "Fix bug minore"

# Push rapido con messaggio default
./quick-push.sh
```

## Cosa Fanno gli Script

### Processo Automatico:

1. **Verifica dello stato git**: Controlla che siamo in una repo git
2. **Controllo modifiche**: Avvisa se ci sono modifiche non committate
3. **Incremento versione**: Aggiorna automaticamente:
   - `package.json` (root)
   - `server/package.json`
4. **Commit automatico**: Crea un commit con il messaggio specificato
5. **Creazione tag**: Crea un tag git con la nuova versione
6. **Push completo**: Pusha sia il codice che i tag su origin
7. **Riepilogo**: Mostra la nuova versione e gli ultimi commit

### Output Colorato:

- 🔵 **INFO**: Informazioni sul processo
- 🟢 **SUCCESS**: Operazioni completate con successo
- 🟡 **WARNING**: Avvisi (es. modifiche non committate)
- 🔴 **ERROR**: Errori che bloccano l'esecuzione

## Versioning Semantico

Gli script seguono il [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.y.z): Breaking changes, incompatibilità
- **MINOR** (x.Y.z): Nuove funzionalità, backward compatible
- **PATCH** (x.y.Z): Bug fixes, backward compatible

## Sicurezza

- Gli script verificano lo stato git prima di procedere
- Chiedono conferma se ci sono modifiche non committate
- Usano `set -e` per fermarsi in caso di errori
- Non sovrascrivono tag esistenti

## Troubleshooting

### Errore: "Non siamo in una directory git"
- Assicurati di essere nella root del progetto
- Verifica che esista la cartella `.git`

### Errore: "Tipo di versione non valido"
- Usa solo: `patch`, `minor`, o `major`

### Push fallito
- Verifica la connessione internet
- Controlla i permessi sul repository
- Assicurati che il branch corrente esista su origin

## Note

- Gli script aggiornano automaticamente sia il package.json principale che quello del server
- I tag vengono creati automaticamente nel formato `vX.Y.Z`
- Il push include sia il codice che i tag
- Gli script sono compatibili con bash su sistemi Unix/Linux
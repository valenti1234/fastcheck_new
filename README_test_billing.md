# Test Script per l'Endpoint POST /api/admin/billing/generate-all

Questo script testa l'endpoint per la generazione di fatture per tutti i tenant attivi.

## Prerequisiti

- Server Duxiter in esecuzione su `http://localhost:3000`
- Credenziali di superadmin valide
- Node.js installato
- Dipendenza `axios` disponibile nel progetto

## Utilizzo

### Esecuzione Base
```bash
node test_generate_all_billing.mjs
```
Utilizza il mese e anno correnti.

### Esecuzione con Parametri Specifici
```bash
node test_generate_all_billing.mjs [mese] [anno]
```

**Esempi:**
```bash
# Genera fatture per agosto 2025
node test_generate_all_billing.mjs 8 2025

# Genera fatture per dicembre 2024
node test_generate_all_billing.mjs 12 2024
```

## Parametri

- **mese**: Numero da 1 a 12 (1 = gennaio, 12 = dicembre)
- **anno**: Anno (minimo 2020)

## Credenziali

Lo script utilizza le seguenti credenziali hardcoded:
- **Email**: `superadmin@gmail.com`
- **Password**: `SuperAdmin3465#`

## Possibili Risposte

### Successo (200)
```json
{
  "message": "Fatture generate con successo",
  "results": [...],
  "errors": [...]
}
```

### Nessun Tenant Attivo (404)
```json
{
  "error": "Nessun tenant attivo trovato"
}
```

### Errore di Autenticazione (401)
```json
{
  "error": "Token non valido"
}
```

### Errore di Autorizzazione (403)
```json
{
  "error": "Accesso negato"
}
```

### Errore di Validazione (400)
```json
{
  "error": "Parametri non validi"
}
```

## Note

- Lo script effettua prima il login per ottenere un token JWT
- Il token viene utilizzato nell'header Authorization per l'endpoint generate-all
- L'endpoint richiede privilegi di superuser
- Se non ci sono tenant attivi, l'endpoint restituisce 404 (comportamento normale)
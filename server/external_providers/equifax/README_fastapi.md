# Equifax Provider FastAPI

Un'applicazione FastAPI che fornisce endpoint REST per i servizi di transazione Equifax, basata sull'esempio funzionante in `main.py`.

## Caratteristiche

- **API REST completa** per le transazioni Equifax
- **Gestione automatica dei token OAuth** con cache
- **Due formati di richiesta**: completo e semplificato
- **Gestione degli errori** robusta
- **Logging dettagliato**
- **Documentazione automatica** con Swagger UI
- **Supporto CORS**

## Installazione

1. Installa le dipendenze:
```bash
pip install -r requirements_fastapi.txt
```

2. Configura le variabili d'ambiente (crea un file `.env`):
```env
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
SCOPE=https://api.latam.equifax.com/datos-comerciales/transaction
```

## Avvio dell'applicazione

```bash
python equifax_provider.py
```

L'applicazione sarà disponibile su `http://localhost:8000`

## Documentazione API

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## Endpoint disponibili

### Health Check
- `GET /` - Status dell'applicazione
- `GET /health` - Health check dettagliato
- `GET /config` - Visualizza configurazione corrente da .env

### Gestione Token
- `POST /token/{environment}` - Ottieni token OAuth per l'ambiente specificato
- `GET /cache` - Stato della cache dei token
- `DELETE /cache` - Pulisci la cache dei token

### Transazioni Equifax
- `POST /transaction/{environment}` - Esegui transazione con formato completo
- `POST /transaction/{environment}/simple` - Esegui transazione con formato semplificato
- `POST /transaction/{environment}/rut-only` - Transazione ultra-semplificata (solo RUT)

## Esempi di utilizzo

### Richiesta RUT-Only (Ultra Semplificata - Usa dati da .env)
```bash
curl -X POST "http://localhost:8000/transaction/uat/rut-only" \
  -H "Content-Type: application/json" \
  -d '{
    "chileanRut": "12345678-9"
  }'
```

### Richiesta semplificata
```bash
curl -X POST "http://localhost:8000/transaction/uat/simple" \
  -H "Content-Type: application/json" \
  -d '{
    "chileanRut": "12345678-9",
    "chileanSerialNumber": "0",
    "billTo": "test",
    "shipTo": "test",
    "productName": "test_product",
    "productOrch": "test_orch",
    "customer": "test_customer",
    "model": "test_model",
    "requestType": "personal"
  }'
```

### Richiesta completa
```bash
curl -X POST "http://localhost:8000/transaction/uat" \
  -H "Content-Type: application/json" \
  -d '{
    "applicants": {
      "primaryConsumer": {
        "personalInformation": {
          "chileanRut": "12345678-9",
          "chileanSerialNumber": "0"
        }
      }
    },
    "productData": {
      "billTo": "test",
      "shipTo": "test",
      "productName": "test_product",
      "productOrch": "test_orch",
      "configuration": "Config",
      "customer": "test_customer",
      "model": "test_model"
    },
    "requestType": "personal"
  }'
```

## Ambienti supportati

- `uat` - Ambiente di test
- `prod` - Ambiente di produzione

## Tipi di richiesta

- `personal` - Include chileanSerialNumber
- `empresarial` - Esclude chileanSerialNumber

## Gestione degli errori

L'API restituisce errori HTTP standard con dettagli in formato JSON:

```json
{
  "error": "Descrizione dell'errore",
  "detail": "Dettagli aggiuntivi",
  "timestamp": "2024-01-01T12:00:00"
}
```

## Cache dei token

I token OAuth vengono automaticamente memorizzati nella cache nel file `.token_cache.json` per evitare richieste non necessarie. La cache viene gestita automaticamente con un buffer di sicurezza di 60 secondi prima della scadenza.

## Logging

L'applicazione utilizza il logging standard di Python con livello INFO. I log includono:
- Richieste di token
- Esecuzione delle transazioni
- Gestione della cache
- Errori e eccezioni

## Sicurezza

- Le credenziali OAuth vengono lette dalle variabili d'ambiente
- I token vengono memorizzati localmente in cache
- CORS configurabile per ambienti di produzione
- Gestione sicura degli errori senza esposizione di informazioni sensibili

## company request
{
"applicants": {
"primaryConsumer": {
"personalInformation": {
"chileanRut": "123456789"
}
}
},
"productData": {
"billTo": "valor según ambiente",
"shipTo": "valor según ambiente",
"productName": "CLREPORTEEMPRESARIAL",
"productOrch": "REPORTEEMPRESARIALV1",
"configuration": "Config",
"customer": "CLREPROCSERV",
"model": "REPROCSERV"
}
}

## persona request
{
"applicants": {
"primaryConsumer": {
"personalInformation": {
"chileanRut": "123456789",
"chileanSerialNumber": "A000000002"
}
}
},
"productData": {
"billTo": "Valor según ambiente",
"shipTo": "Valor según ambiente",
"productName": "CLPLAT",
"productOrch": "PLATV1",
"configuration": "Config",
"customer": "CLPLATPROCSERV",
"model": "PLATPROCSERV"
}
}
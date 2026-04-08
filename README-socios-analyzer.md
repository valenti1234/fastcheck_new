# Script di Analisi Soci - Duxiter

## Descrizione

Questo script automatizza l'analisi dei soci di un'azienda utilizzando i dati disponibili nel sistema Duxiter. Lo script effettua il login, recupera i dati societari per un RUT specifico e analizza le informazioni sui soci utilizzando sia analisi manuale che AI.

## Funzionalità

### 🔐 Autenticazione
- Login automatico con credenziali configurate
- Gestione sicura del token JWT
- Supporto per diversi ruoli utente

### 🔍 Ricerca Dati
- Recupero dati societari completi per RUT
- Accesso a `mallaSocietariaData` e `officialDiaryData`
- Estrazione di `companyGeneralInfo`

### 📊 Analisi Manuale
- Identificazione automatica dei soci attuali
- Estrazione degli amministratori
- Determinazione della data di costituzione
- Tracciamento delle modifiche societarie

### 🤖 Analisi AI (Opzionale)
- Analisi avanzata tramite intelligenza artificiale
- Interpretazione contestuale dei dati
- Identificazione di pattern complessi

### 📄 Report Dettagliato
- Generazione di report JSON strutturati
- Riassunto leggibile in console
- Salvataggio automatico con timestamp

## Configurazione

### Credenziali di Login
```javascript
const LOGIN_CREDENTIALS = {
  email: 'edeik@azurian.com',
  password: 'Emilio3465#'
};
```

### RUT Target
```javascript
const TARGET_RUT = '89907300-2';
```

### URL del Server
```javascript
const BASE_URL = 'http://localhost:4040/api';
```

## Installazione

1. **Installa le dipendenze:**
   ```bash
   npm install axios
   ```

2. **Verifica che il server Duxiter sia in esecuzione:**
   ```bash
   ps aux | grep node | grep -v grep
   ```

## Utilizzo

### Esecuzione Base
```bash
node analyze-socios-script.js
```

### Come Modulo
```javascript
import SociosAnalyzer from './analyze-socios-script.js';

const analyzer = new SociosAnalyzer();
analyzer.run();
```

## Output

### Console Output
Lo script fornisce un output dettagliato in console con:
- 🚀 Stato di avvio
- 🔐 Conferma login
- 🔍 Progresso ricerca dati
- 📊 Risultati analisi
- 📄 Percorso file report

### Report JSON
Il report viene salvato come file JSON con la seguente struttura:

```json
{
  "timestamp": "2025-09-07T10:20:38.471Z",
  "rut": "89907300-2",
  "razonSocial": "KPMG AUDITORES CONSULTORES LIMITADA",
  "analisiManuale": {
    "socios": [
      {
        "nombre": "CLAUDIO DÍAZ ANDRADE",
        "rut": "10533271-8",
        "domicilio": "ROSARIO NORTE 660, PISO 24, LAS CONDES, REGIÓN METROPOLITANA"
      }
    ],
    "administradores": [],
    "fechaConstitucion": "1993-01-01",
    "modificacionesSocietarie": []
  },
  "analisiAI": null,
  "riassunto": {
    "numeroSoci": 1,
    "numeroAmministratori": 0,
    "dataCostituzione": "1993-01-01",
    "modificheSocietarie": 0
  }
}
```

## Esempio di Risultato

```
============================================================
📊 ANALISI SOCI - RIASSUNTO
============================================================
🏢 Azienda: KPMG AUDITORES CONSULTORES LIMITADA
🆔 RUT: 89907300-2
📅 Data Costituzione: 1993-01-01

👥 SOCI (1):
   1. CLAUDIO DÍAZ ANDRADE
      RUT: 10533271-8
      Domicilio: ROSARIO NORTE 660, PISO 24, LAS CONDES, REGIÓN METROPOLITANA

👨‍💼 AMMINISTRATORI (0):
   Nessun amministratore trovato nei dati disponibili.
============================================================
```

## Fonti Dati Analizzate

### 1. mallaSocietariaData
- `empresaEnUnDia`: Dati storici delle modifiche societarie
- `socios`: Lista dei soci attuali
- `administradores`: Lista degli amministratori
- `diarioOficial`: Pubblicazioni nel diario ufficiale

### 2. officialDiaryData
- `data`: Dati ufficiali pubblicati
- `socios`: Informazioni sui soci da fonti ufficiali

### 3. companyGeneralInfo
- `socios`: Soci consolidati
- `administradores`: Amministratori consolidati
- `fechaDeConstitucion`: Data di costituzione
- `rapresentanteLegal`: Rappresentante legale

## Gestione Errori

- **Errore di Login**: Verifica credenziali e connessione server
- **RUT Non Trovato**: Controlla che il RUT esista nel database
- **Analisi AI**: ✅ **FUNZIONANTE** - L'endpoint `/api/ai/analyze` è ora disponibile e utilizza OpenAI per insights approfonditi
- **Errori di Rete**: Retry automatico per operazioni critiche

## Personalizzazione

### Cambiare RUT Target
```javascript
const TARGET_RUT = 'NUOVO-RUT-QUI';
```

### Modificare Credenziali
```javascript
const LOGIN_CREDENTIALS = {
  email: 'nuovo@email.com',
  password: 'nuova-password'
};
```

### Aggiungere Nuove Analisi
Estendi la classe `SociosAnalyzer` con nuovi metodi di analisi:

```javascript
class ExtendedSociosAnalyzer extends SociosAnalyzer {
  customAnalysis(data) {
    // La tua analisi personalizzata
  }
}
```

## Sicurezza

- ⚠️ **Non committare credenziali**: Usa variabili d'ambiente per credenziali sensibili
- 🔒 **Token JWT**: Gestiti automaticamente e scadono dopo 7 giorni
- 🛡️ **Validazione Input**: Tutti gli input sono validati prima dell'uso

## Troubleshooting

### Server Non Raggiungibile
```bash
# Verifica che il server sia in esecuzione
ps aux | grep node

# Controlla le porte aperte
netstat -tlnp | grep node
```

### Credenziali Invalide
- Verifica email e password
- Controlla che l'utente sia attivo nel sistema
- Verifica i permessi dell'utente

### Dati Mancanti
- Alcuni RUT potrebbero non avere dati completi
- Verifica che il RUT sia stato processato dal sistema Sheriff

## Supporto

Per supporto tecnico o domande:
- Controlla i log del server in `/root/duxiter/server/logs/`
- Verifica la documentazione API in `http://localhost:4040/api/docs`
- Consulta il codice sorgente per dettagli implementativi

---

**Versione**: 1.0.0  
**Ultimo Aggiornamento**: Settembre 2025  
**Compatibilità**: Node.js 18+, Duxiter API v1
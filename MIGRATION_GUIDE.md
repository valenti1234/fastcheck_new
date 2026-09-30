# Guida d'uso: Script `simulate-migration.ts`

Percorso script: [`server/src/scripts/simulate-migration.ts`](file:///home/duxiter/duxiter_intermediate/server/src/scripts/simulate-migration.ts)

Data aggiornamento: 30.09.2026

---

## 🧠 Perché esiste questo script?

Il giorno **30.09.2026** abbiamo scoperto e corretto un **BUG CRITICO DI IMMUTABILITÀ**:

> Aprendo una valutazione già salvata in passato (menu *Consultas* → click sul RUT), i controller **`getResultById` e `getResultByRut`** ri-applicavano in tempo reale le **Liste Proprie Alto/Medio Impatto** (`lpaltos` / `lpmedios`) e **ricalcolavano il semaforo del rischio**, poi **salvavano questi nuovi valori SOPRASCRIVENDO il documento Result STORICO** con un `Result.updateOne(...)`.

### Conseguenza del bug
- Un documento Result creato in data **10 giugno**, se riaperto in data **20 luglio**, **cambiava in modo permanente** `lpaltosDetected`, `lpmediosDetected`, i records LP, e **il COLORE DEL SEMAFORO del rischio** (rosso → giallo o viceversa).
- Non c'era più traccia di quale fosse stato **il risultato VERO della valutazione al momento in cui era stata eseguita**.

### Cosa fa questo script
1. **Pulisce la traccia** del danno (il marcatore `updatedAt` spostato avanti nel tempo).
2. **NON TOCCA** i flag LP o il semaforo in automatico: non abbiamo lo storico Mongo dei subdocument, non sappiamo con certezza quali fossero i valori originali. Qualsiasi ripristino automatico sarebbe congetturale e potenzialmente peggiorativo.

---

## ⚠️ MODALITÀ DEFAULT — DRY RUN 100% SICURO

✅ **Allo stato attuale lo script NON SCRIVE NIENTE NEL DATABASE.**

Esegue solo una **simulazione** e scrive un report JSON con:
- Classificazione di ogni documento Result
- Stato attuale (`snapshotNow`)
- Stato proposto (`snapshotProposed`)
- Fix proposto in MongoDB (solo `$set: { updatedAt: createdAt }`)

---

## 🚀 Esecuzione base

Spostarsi nella cartella del server:
```bash
cd ~/duxiter/duxiter_intermediate/server
```

### 1) Simulazione completa — TUTTO il DB
```bash
npx tsx src/scripts/simulate-migration.ts --pretty
```

### 2) Analisi solo di un RUT specifico
```bash
npx tsx src/scripts/simulate-migration.ts \
  --rut 17752947-8 \
  --pretty \
  -o ./plan_rut_177529478.json
```

### 3) Analisi solo di un TENANT specifico + include anche archiviati
```bash
npx tsx src/scripts/simulate-migration.ts \
  --tenant 696ea94a6f8a3d52983bf9d5 \
  --include-archived \
  --pretty
```

### 4) Modificare la "soglia alterazione post-creazione"
Default = 5 secondi. Se vuoi solo doc alterati **dopo oltre 1 minuto**:
```bash
npx tsx src/scripts/simulate-migration.ts --min-age-ms 60000 --pretty
```

### 5) Aiuto completo
```bash
npx tsx src/scripts/simulate-migration.ts --help
```

---

## 🏷️ Categorie documento

Ogni `Result` viene classificato in una di queste categorie.

### ✅ `OK_PULITO`
Il documento non è mai stato toccato dopo la creazione.
- Condizione: `updatedAt - createdAt ≤ minAgeMs (5s di default)`
- Azione proposta: **Nessuna.**

### ✅ `OK_REFRESH_CHAIN`
Il documento è stato alterato post-creazione, **ma ha un successore** nella catena REFRESH (l'utente ha cliccato "Aggiorna" e il sistema ha creato un nuovo Result).
- L'utente finale vede l'ultimo; questo è "storico".
- Azione proposta: **Nessuna.** Non rompiamo la catena.

### ⚠️ `OK_SOLO_UPDATED_AT_IRRILEVANTE`
L'unica cosa cambiata è il timestamp `updatedAt` (non ci sono tracce di modifiche a `aiAnalysis`, `archived` o LP/Risk). Solitamente accade per trigger Mongoose `pre-save` o eventi secondari innocui.
- Azione proposta ✅: **`updatedAt = createdAt`** (reset timestamp, sicuro).

### 🚨 `CANDIDATO_RIPRISTINARE_ULTIMA_EVAL`
**Caso pericoloso:**
- È l'ULTIMO documento attivo della catena (quello che l'utente vede oggi aprendo la eval)
- È stato alterato post-creazione dal bug LP autosync
- LP, semaforo del rischio o altri flag sono probabilmente cambiati a posteriori

> 🚨 **NON RIPRISTINIAMO LP / Risk in automatico!** Non abbiamo lo storico versioning dei subdocumenti Mongo.

- Azione proposta (solo safe fix): **`updatedAt = createdAt`** (solo rimuovere la traccia di manomissione).
- Azione **consigliata dopo** (manuale):
  1. Aprire il report `audit-rut-mutations_*.json` (script gemello)
  2. Cercare il RUT nel report
  3. Confrontare le revisioni per capire quale snapshot della catena conteneva il valore "vero".
  4. Modificare a mano il documento se serve, o rieseguire la eval in modalità `isRefreshing = true` per ottenere un documento nuovo pulito.

### 🚨 `CANDIDATO_CASO_COMPLESSO`
Caso ambiguo:
- Stesso RUT condiviso su TENANT MULTIPLI (es: stesso cliente su due tenant diversi)
- `lpaltosDetected = undefined` o altri valori corrotti
- Valutazione `derived_socio_pep` o casi particolari

- **Azioni:** Nessuna in automatico. **Solo analisi manuale obbligatoria.**

---

## 📑 Report JSON generato

Percorso di default:
```
server/exports/migration_plan_YYYY-MM-DDTHH-MM-SS.json
```

### Struttura

```jsonc
{
  "meta": {
    "statisticheGlobali": {
      "documentiAnalizzati": 971,
      "candidatiMigration": 523,
      "richiesteAnalisiManuale": 17,
      "documentiOK": 308,
      "aggiornamentiApplicati": 0,   // 0 se dry-run
      "erroriAggiornamento": 0
    },
    "statistichePerCategoria": {
      "OK_PULITO": 308,
      "OK_REFRESH_CHAIN": 521,
      "OK_SOLO_UPDATED_AT_IRRILEVANTE": 135,
      "CANDIDATO_RIPRISTINARE_ULTIMA_EVAL": 58,
      "CANDIDATO_CASO_COMPLESSO": 17
    }
    // ... filtri, modalità, connessione, durata ms ...
  },
  "documenti": [
    {
      "_id": "6a2803e741...",
      "rut": "77.123.456-7",
      "canonicalRut": "77.123.456-7",
      "categoria": "CANDIDATO_RIPRISTINARE_ULTIMA_EVAL",
      "note": ["..." ],
      "snapshotNow":        { /* stato attuale DB  */ },
      "snapshotProposed":   { /* stato proposto    */ },
      "proposedUpdateMongoSet": { "updatedAt": "2026-06-09T12:15:35.478Z" }
    }
  ]
}
```

### Come leggere `snapshotNow vs snapshotProposed`

Campo per campo abbiamo:

| Label Watch Field | Significato |
|---|---|
| `riskAssessment.semaphore` | Semaforo del rischio: `green / yellow / red` |
| `riskAssessment.riskLevelDescription` | Testo: Riesgo Bajo / Medio / Crítico |
| `riskAssessment.totalDetected` | Totale segnalazioni |
| `riskAssessment.totalSevero / totalSignificativo / totalParameters` | Conteggi categorie gravità |
| `lpaltosDetected / lpmediosDetected` | Bandierina true/false Lista Propria Alto Medio |
| `lpaltosRecords (count) / lpmediosRecords (count)` | Quanti record LP sono stati attaccati al documento |
| `archived flag / archivedAt` | Stato archiviazione REFRESH |
| `aiAnalysis (presenza) / aiAnalysisDate` | AI post-analysis |
| `updatedAt (timestamp) / createdAt (timestamp)` | Timestamp creazione / ultima modifica |

---

## 🔴 COME APPLICARE VERAMENTE LE MODIFICHE NEL DB

> 🔥 **Prerequisito OBBLIGATORIO:** esegui prima la simulazione DRY-RUN e **leggi il report JSON**. Assicurati che la classificazione "Categoria" sia corretta per i CANDIDATI che ti interessano. Fai backup di `mongodump` se necessario.

### Passo 1 (fortemente consigliato): BACKUP
```bash
mongodump --uri="$MONGODB_URI" -c results -o ~/backup_mongo_results_$(date +%Y%m%d)/
```

### Passo 2: Esegui la migration in modalità WRITE

⚠️ **Servono ENTRAMBI** i flag `--apply` e `--apply-yes-i-confirm`. Se ne metti solo uno → DRY RUN comunque.

```bash
cd ~/duxiter/duxiter_intermediate/server

# 🚨 MOLTO IMPORTANTE: ENTRAMBI I FLAG
npx tsx src/scripts/simulate-migration.ts --pretty --apply --apply-yes-i-confirm
```

All'avvio apparirà un banner ROSSO e lo script attende **3 secondi** per permettere `CTRL+C` se ti sei sbagliato.

```
╔══════════════════════════════════════════════════════════════════════╗
║  🔴 [MODALITÀ APPLY ATTIVA]  SCRITTURA DB ABILITATA!                 ║
╠══════════════════════════════════════════════════════════════════════╣
║  Tutte le modifiche proposte saranno COMMITTATE su MongoDB.        ║
║  [Hai 3 secondi per CTRL+C se non sei sicuro.]                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

### Cosa fa realmente in apply?

```typescript
db.results.updateOne(
  { _id: ObjectId("<doc>") },
  { $set: { updatedAt: createdAt } }   // 👈 SOLO questo. Nient'altro.
)
```

- **NON** modifica `lpaltosDetected / lpmediosDetected / riskAssessment.semaphore / records LP`. Non sappiamo con certezza i valori originali.
- **NON** tocca i Result già OK o già in REFRESH chain.
- Scrive solo le entry in `CANDIDATO_RIPRISTINARE_ULTIMA_EVAL`, `OK_SOLO_UPDATED_AT_IRRILEVANTE`, e (se presenti) `CANDIDATO_CASO_COMPLESSO` (ma solo per updatedAt, non i flag).

---

## 🎯 Workflow consigliato (3 passaggi)

| Step | Cosa fare | Comando |
|---|---|---|
| 1️⃣ | Analizza lo storico dei cambiamenti | `npx tsx src/scripts/audit-rut-mutations.ts --min-changes 1 --pretty` |
| 2️⃣ | Simula la migrazione, leggi il report JSON, decidi caso per caso | `npx tsx src/scripts/simulate-migration.ts --pretty` |
| 3️⃣ | Fai backup, applica safe fix updatedAt | `mongodump ...` + `npx tsx src/scripts/simulate-migration.ts --apply --apply-yes-i-confirm` |

---

## 🔐 Garanzie di sicurezza

| Controllo | Dove |
|---|---|
| 🛡️ Di default DRY-RUN | Banners `[DRY RUN ATTIVO]` + controllo `args.apply && args.applyConfirm` entrambi richiesti |
| 🛡️ 3-secondi safety delay prima di iniziare a scrivere | Riga `setTimeout(r, 3000)` in apply |
| 🛡️ Report JSON sempre generato, anche se fallisce | Handler `main.catch` scrive `migration_plan_FAILED_<ts>.json` |
| 🛡️ IP Forzato a IPv4 + timeouts 5s (no blocchi 30s) | Connessione Mongo `family:4, serverSelectionTimeout:5000` |
| 🛡️ Modifiche solo su `updatedAt` (safe fix) | Logica `proposedUpdateMongoSet = {updatedAt: createdAt}` |
| 🛡️ Nessuna modifica ai flag LP / Sem / records | Blocco esplicito nella strategia (per assenza versioning subdoc) |
| 🛡️ Error handling per-doc: un solo documento che fallisce non blocca gli altri | `try/catch per ogni entry` + collezione `erroriRuntime[]` nel report |

---

## 📚 Riferimenti correlati

- Script audit mutazioni (analisi prima/dopo il bug): [`audit-rut-mutations.ts`](file:///home/duxiter/duxiter_intermediate/server/src/scripts/audit-rut-mutations.ts)
- Script export di tutte le eval per un RUT: [`export-rut-consultations.ts`](file:///home/duxiter/duxiter_intermediate/server/src/scripts/export-rut-consultations.ts)
- Fix codice backend che ha creato il bug (corretto 30.09.2026):
  - Controller [`rutController.ts → getResultById`](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L1913)
  - Controller [`rutController.ts → getResultByRut`](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L2115)
  - Helper [`syncTenantSpecificListaPropiaData()`](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L82)

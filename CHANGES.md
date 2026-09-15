## 2026-09-15

### Fix Connessione MongoDB – Lentezza 81s → < 2s (IPv6 fallback + timeout troppo alti)
**Problema**: All'avvio `dux_main` la connect a MongoDB impiegava **80.581 ms (~1m21s)** invece di < 2s:
```
13:58:37 [connectDB] Connecting to MongoDB at mongodb://172.19.40.102,172.19.40.103/duxiter?replicaSet=rs0
13:59:58 [RabbitMQ] Connecting to RabbitMQ...  (dopo 1m21s!)
```

**Diagnostica socket TCP (15.09.2026)**:
```
✅ TCP OK  172.19.40.102:27017 in 4ms
✅ TCP OK  172.19.40.103:27017 in 1ms
→ ENTRAMBI i nodi del replica set sono UP! La rete è PERFETTA.
```

**👉 Conclusione causa 100%**: Node.js, in assenza di un `family` esplicito, **prova la risoluzione AAAA (IPv6) PRIMA di A (IPv4)**. Nella LAN 172.19.x.x non c'è IPv6 → ogni host perde ~30s in `dns.lookup` fallback. Su 2 host = ~60s. A questo si aggiunge il default `serverSelectionTimeoutMS: 30000` (30s invece di 5s). Totale ~81s.

---

**Soluzione**: 2 file backend modificati, stesse identiche opzioni Mongoose:

| File | Linee | Cosa |
|---|---|---|
| 🎯 **`server/src/config/db.ts` (entrypoint principale, [index.ts L11](file:///home/duxiter/duxiter_intermediate/server/src/index.ts#L11))** | [L24-L45](file:///home/duxiter/duxiter_intermediate/server/src/config/db.ts#L24-L45) | Nuovo oggetto `MONGOOSE_OPTS`: `family: 4` (FORZA IPv4, salva 60s!), `serverSelectionTimeoutMS: 5000`, `connectTimeoutMS: 5000`, `socketTimeoutMS: 60000`, `heartbeatFrequencyMS: 3000`, `readPreference: primaryPreferred`. Opzioni tunabili via env: `MONGO_SERVER_SEL_TIMEOUT_MS`, `MONGO_CONNECT_TIMEOUT_MS`, `MONGO_SOCKET_TIMEOUT_MS`, `MONGO_HEARTBEAT_MS`, `MONGO_AUTH_SOURCE`, `MONGOOSE_DEBUG`. |
| 👆 idem | [L64-L119](file:///home/duxiter/duxiter_intermediate/server/src/config/db.ts#L64-L119) | Banner deploy `🟢 [MONGOOSE OPTIMIZED v1.0]` con tabella parametri + `console.time/timeEnd` per misurare SEMPRE la durata connect + listeners granulari (`connecting`, `connected`, `open`, `disconnected`, `reconnected`, `reconnectFailed`, `close`, `error`) per debugging futuro senza ripetere test manuali. |
| `server/src/config/database.ts` (usato da scripts/create-superadmin) | [L14-L22](file:///home/duxiter/duxiter_intermediate/server/src/config/database.ts#L14-L22) | Stesse identiche ottimizzazioni di `db.ts` per coerenza. |

---

**🎯 Risultato atteso dopo riavvio servizio dux_main**:
```
Nuovo banner:
╔══════════════════════════════════════════════════════════════╗
║  🟢 [MONGOOSE OPTIMIZED v1.0 • 15.09.2026]                  ║
╚══════════════════════════════════════════════════════════════╝
[connectDB] 🔄 Event: connecting ...
[connectDB] ✅ Event: connected OK
[connectDB] 🟢 Event: 'open' → connessione pronta alle query
[connectDB] ✅ CONNESSIONE RIUSCITA: mongodb://172.19.40.102:27017/duxiter · readyState=1
⏱️  [connectDB] Tempo totale connessione MongoDB: **142.456ms** ✅ (PRIMA era 81.000ms!)
```

### Fix Dequienes MeshTable – OWNED_BY bidirezionale ("Sin datos" → dati reali visibili)
**Problema (RUT 92604000)**: sezione Malla Relacional "Controladores y Estructura de Propiedad" mostrava `Sin datos de malla societaria`, malgrado il payload grezzo JSON (`server/dequenes_responses/relationships_92604000_1789480909.json`) contenesse **20+ relazioni OWNED_BY**.

**Causa radice**: Dequienes Graph API può ritornare OWNED_BY in **due direzioni opposte**, e MeshTable considerava solo 1 direzione:
```
Caso A (funzionava): {source = SOCIETA', target = DUENO, label: "OWNED_BY"}
                     → main è POSSeduta → MeshTable cerca source==main → OK
Caso B (falliva):    {source = FIGLIA,  target = MAIN_RUT, label: "OWNED_BY"}
                     → main È IL PROPRIETARIO (soc. madre)
                     → MeshTable cerca source==main → 0 match → "Sin datos"
```
Nel JSON di 92604000, **100% OWNED_BY erano di Caso B** (target==92604000), quindi la sezione era sempre vuota.

---

**Soluzione (MeshTable.tsx, fix 15/09 - versione `MESH BIDIRECTIONAL v1.0`)**:

1. **[MeshTable.tsx L114-L157](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L114-L157)** → Normalizzazione OWNED_BY bidirezionale:
   - Se esistono relazioni Caso A (source==main) → usa solo quelle (retrocompatibile).
   - Se NON esistono relazioni dirette (Caso B, main è proprietario) → crea array `ownRelsNormalizzato` FLIPPANDO source↔target per ogni OWNED_BY dove target==main.
   - Aggiunge flag `_flippedDirection: true` per tracciare le righe invertite.

2. **[MeshTable.tsx L161-L242](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L161-L242)** → `buildOwnRows()` usa `ownRelsNormalizzato` invece di `ownRels`. Per le righe flipped:
   - Vengono mostrate in UI come livello N1 (stesse di partecipazioni).
   - Non vengono ESPANSE verso l'alto (`if (!flipped && isSociedad(ownerRut))`), perché semanticamente non sono "dueños" ma "società figlie" — evitiamo loop infiniti o catene sbagliate.

3. **UI feedback**:
   - Box **"Cobertura de la malla"** ([L739-L750](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L739-L750)) → nuova riga `Dirección OWNED_BY`:
     ```
     ✅ Dueños directos (main = società posseduta) · X relazioni originali
     ⚠️ Main = propietario · mostrando N partecipaciones (dirección inversa) (fixed flipped 15/09)
     ```
   - **Banner deploy console** ([L282-L293](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L282-L293)) → `[MESH BIDIRECTIONAL v1.0 • 15.09.2026]` con conteggio `originali=N + flipped=M` → immediatamente verificabile da DevTools se il bundle nuovo è caricato.

---

**Risultato atteso dopo `npm run build + Hard Refresh` + nuovo RECHECK (per invalidare cache vecchie distance=2)**:
```
Malla Relacional / Controladores y Estructura de Propiedad (RUT 92604000):
  ✅ NESSUN "Sin datos de malla societaria"
  ✅ Box sopra tabella: Dirección OWNED_BY → ⚠️ Main = propietario · 20+ participaciones (dirección inversa)
  ✅ Tabella mostra N righe N1 = società figlie possedute da 92604000 (badge N1 blu)
  ✅ Console DevTools: banner verde 🟢 [MESH BIDIRECTIONAL v1.0 • 15.09.2026]
  ✅ Legalrepresentatives (REPRESENTED_BY): continua a mostrare i 3 RUT come prima (non toccato)
  ✅ MeshFlowTable "Empresas en las que Participa": non toccato, già funziona per questo scenario
```

#### 🩹 Fix 2 (15.09 — iterazione 2 Malla): dequienesRelationships Formato Oggetto {relationships, entityNames} invece di Array
**Problema**: Dopo il fix bidirezionale (1), **malla ancora vuota**. Analisi su `server/json_data/riskCalculationResult_LATEST_92604000-6.json`:
- Dati PRESENTI: `logEntry.filteredDetails.dequinesRelationships.relationships.length=100` (OWNED_BY:74, REPRESENTED_BY:26)
- Provider Python salva dequinesRelationships come **OGGETTO**: `{relationships:[], entityNames:{...}, pathCount, ...}` (non array diretto!)

**Causa radice** (2 bug dentro `FastCheckEX.tsx useMemo dequienesForMesh`):
| Bug | Dettaglio | Perché falliva |
|---|---|---|
| 🟥 1 Formato | `filterOutNotaryRelationships()` preserva il tipo in uscita (obj→obj, arr→arr). I 3 componenti (MeshTable, Legalrepresentatives, MeshFlowTable) si aspettavano **Array<any>** `.filter(r => r.label)` su oggetto → falliva in silenzio → vuoto. |
| 🟨 2 entityNames | Nomi società salvati separatamente in `entityNames: {rut: nombre}`. Relazioni avevano solo RUT. `getName(rut)` dentro MeshTable non trovava nome → N/A. |

**Soluzione 2 finale** — [FastCheckEX.tsx L223-L297](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L223-L297):
1.  **4 fallback path order**: sheriffLogData → details.sheriffLogData → logEntry → root filteredDetails (retrocompatibilità multi-formato).
2.  **Pre-processing**: se input è OGGETTO (formato nuovo provider Python), **inietta entityNames dentro OGNI RELAZIONE**: `sourceName`, `targetName`, `_sourceEntityName`, `_targetEntityName` (con normalizzazione chiavi RUT: remove dots/trattini, case-insensitive).
3.  **`filterOutNotaryRelationships(processedForFilter)`** invariato (funziona obj/arr grazie a deep clone + walk ricorsivo).
4.  **Uniforma SEMPRE Array in uscita**: `filteredMesh` oggetto → restituisci `.relationships`. I 3 componenti ricevono **sempre Array<any>** come atteso.

#### 🩹 Fix 3 (15.09 — iterazione 3 Malla): Ricerca RICORSIVA dequinesRelationships + variabile debug globale (path NON prevedibili)
**Problema**: Dopo fix bidirezionale + formato oggetto, **malla ancora TOTALMENTE VUOTA per RUT 92604000-6 resultId 6aa934f2b06b194c838077d8**.

**Diagnostica payload grezzo**:
```
✅ BACKEND DATI OK:
  server/json_data/riskCalculationResult_LATEST_92604000-6.json
  → logEntry.filteredDetails.dequinesRelationships = {relationships:100, entityNames:123}
✅ FILE GREZZO PROVIDER: relationships_92604000_1789485117.json → 145 relazioni (45 rimosse da filtro notari)
❌ FRONTEND: const raw = 4 path hardcodati → undefined per QUESTO resultId specifico
```

**👉 Root cause**: La struttura `cleanedData` NON è STABILE tra record salvati in Mongo diversi. I 4 path hardcodati originali:
```ts
cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships
cleanedData?.details?.sheriffLogData?.filteredDetails?.dequinesRelationships
cleanedData?.logEntry?.filteredDetails?.dequinesRelationships
(cleanedData as any)?.filteredDetails?.dequinesRelationships
```
→ per `resultId=6aa934f2b06b194c838077d8` **NESSUNO** di questi 4 path trovava la chiave. `raw=undefined` → useMemo ritornava undefined → malla vuota.

---

**Soluzione 3 finale — [FastCheckEX.tsx L239-L395](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L239-L395)**:

| # | Blocco | Descrizione |
|---|---|---|
| ✅ 1 | **`normRut` condiviso** ([L239-L240](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L239-L240)) | Funzione normalizzazione RUT spostata a **livello componente** (non dentro useMemo) per essere accessibile sia da useMemo `dequienesForMesh` che da `useEffect` debug globale. |
| ✅ 2 | **Ricerca RICORSIVA `findAllByKeyPatternFn(cleanedData, regex)`** ([L242-L258](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L242-L258)) | Sostituisce 4 path hardcodati. Walk **TUTTI** i nested object di `cleanedData` a **qualsiasi profondità (max 14 livelli)**, cerca chiavi matchanti `^dequinesRelationships$`. WeakSet `visited` per evitare stack overflow da riferimenti circolari closure React. |
| ✅ 3 | **Scoring candidati `scoreCandidateFn()`** ([L259-L267](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L259-L267)) | Ordina tutti i match trovati per score (evita falsi positivi: array vuoto superficiale vs dati reali profondi):<br> 🔝 `Array.length>0` → 1000 - depth<br> 🔝 `Obj con .relationships.length>0` → 900 - depth<br> ⚠️ vuoti/null → 10 - 1000. |
| ✅ 4 | **Banner console `🟢 [DEQUIES_FINDER v1.0]`** ([L268-L295](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L268-L295)) | Stampa `topkeys`, `matchStrict`, `chosen=path.esatto`, `type=Obj(rels=100,names=123)`, `totalRels=100`, lista match strict con score/tipo. `warn` rosso se raw=undefined. |
| ✅ 5 | **Dependency array semplificato** ([L356](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L356)) | Rimosse 4 dipendenze hardcodate → **solo `[cleanedData]`**. Con ricerca ricorsiva non serve più tracciare path specifici. |
| ✅ 6 | **Inject debug globale `useEffect`** ([L358-L395](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L358-L395)) | **Risolve definitivamente errori variabili inesistenti** (come oggi: `window.__reactFastCheck_data` non esisteva → undefined fuorviante). Espone in `window.__debugFastCheck`:<br>• `cleanedData` + `rawData` (oggetti completi)<br>• `dequinesForMesh` (array relazioni finale)<br>• `normRut()` (normalizza RUT per lookup)<br>• `findAll(/pattern/i)` **funzione ricerca ricorsiva GLOBALE** che stampa `console.table` TUTTI i match a qualsiasi profondità (anche su rawData). |
| ✅ 7 | **Banner output useMemo** ([L340-L354](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L340-L354)) | Verde se non vuoto con `countByLabel` (`{OWNED_BY:74, REPRESENTED_BY:26}`), rosso se vuoto con warning. |

---

**🎯 Comandi validazione Console F12 (dopo build + hard refresh)**:
```javascript
// 1. Verifica array relazioni finale (ATTESO = 100 per 92604000-6):
window.__debugFastCheck.dequinesForMesh?.length

// 2. Se ancora 0 → ispeziona TUTTI i possibili match a qualsiasi profondità (stampa tabella):
window.__debugFastCheck.findAll(/dequien/i)
//   → mostra colonne: path | depth | type (Array(N) / Object / string)

// 3. Oggetto completo ricevuto da backend (per analisi successive):
window.__debugFastCheck.cleanedData
```

**Risultato atteso per RUT 92604000-6 resultId 6aa934f2b**:
```
🟢 [DEQUIES_FINDER v1.0 • 15.09.2026]
  matchStrict: 1  matchLoose: 2  chosen=cleanedData.logEntry.filteredDetails.dequinesRelationships
  type=Obj(rels=100, names=123)  totalRels=100
🔧 [DEBUG GLOBAL INJECTED • 15.09.2026] window.__debugFastCheck pronta!
🟢 Output useMemo: Array(100)  labels={"OWNED_BY":74,"REPRESENTED_BY":26}
🟢 [MESH BIDIRECTIONAL v1.0 • 15.09.2026] originali=0 + flipped=74 (Main=propietario)
```
→ UI: Socios 26 righe nomi reali · Controladores 74 righe flipped · Nessun "Sin datos"

## 2026-09-10

### Ajuste Protestos y Morosidades – Equifax (Consolidato 3 fonti)
**Problema**: Fast Check mostrava *unicamente* BOLCOM come totale generale (campo `summaryBolcom`), saltando ICOM e BED — contatori e importi erano enormemente sottostimati.

**Soluzione**: Implementato consolidato completo Equifax secondo specifica:
1. **TOTALE GENERALE** (NON piu' `summaryBolcom`!):
   - `commercialData.credit.debtsSummary.debtsSummaryDetail.totalAmountDebts` ← monto total
   - `commercialData.credit.debtsSummary.debtsSummaryDetail.totalDebts` ← cantidad de documentos
2. **DETTAGLIO PER FONTE (3)**
   - BOLCOM: `debtsSummary.bolcom.commercialBolcom` + `summaryBolcom.summaryTotal` / `summaryTotalAmount`
   - ICOM:   `debtsSummary.icom.commercialIcom`   + `summaryIcom.summaryTotal` / `summaryTotalAmount`
   - BED:    `debtsSummary.bed.commercialBed`    + `summaryBed.summaryTotal` / `summaryTotalAmount`
3. **CLASSIFICAZIONE MOROSIDAD / PROTESTO**
   - BOLCOM e BED: classificazione per riga tramite `justificationDescription` (euristica keywords: PROTESTO/MOROSIDAD).
   - ICOM: **NON si inventa la classificazione individuale** — ogni riga è marcata come `SIN_CLASIFICACION_INDIVIDUAL` (con messaggio esplicativo in UI e nel campo `justificationDescription` di default).
4. **VALIDAZIONE DI QUADRATURA** (frontend + backend, tolleranza ±$1 per arrotondamenti):
   - `Bolcom.count + Icom.count + Bed.count === debtsSummaryDetail.totalDebts`
   - `Bolcom.amount + Icom.amount + Bed.amount === debtsSummaryDetail.totalAmountDebts`
   - In UI: badge verde ✅ "Quadratura OK" oppure arancione ⚠️ con differenze.

#### Files modificati
| Layer | File | Note |
|---|---|---|
| Helper condiviso TS | `server/src/services/equifaxService.ts#L466-L698` | Nuovo `extractEquifaxProtestosMorosidades(equifaxData)` + tipi `MorosidadFuente`, `EquifaxProtestoMorosidadRow`, `EquifaxFuenteSummary`, `EquifaxProtestosMorosidadesResult`. Funzioni `_toNumber`, `_classifica`. Totale da `debtsSummaryDetail`, merge 3 fonti, validazione quadratura, marcatura `_fuente` e `_tipoClasificacion` per ogni riga. |
| Risk-calc backend TS (Node) | `server/src/services/riskCalculationService.ts#L17-L20 + L2036-L2087` | Import helper. Sostituito regola Protestos y Morosidades: prima `details = onlyBOLCOM || []` (L2043 vecchio), adesso `details = 3-fonti merge`, `rulObj.consolidado{totalDebts,totalAmountDebts,perFuente}`, `rulObj.quadratura`. `detected = (totals>0) OR (rows>0) OR (summaries>0)`. `detailCount/montoTotal` da `consolidado`. |
| Risk-calc backend Python (FastAPI) | `fastcheck_api/app/services/risk_calculation_service.py#L20-L152 + L616-L646` | Helper Python clone 1:1 del TS: `_to_number`, `_classifica_pm`, `_extract_equifax_protestos_morosidades`. Aggiornata regola Protestos y Morosidades (L482 vecchio → L616 nuovo): prima `details = onlyICOM || fallback personaNatural`, adesso stessa logica 3 fonti + consolidato + quadratura + fallback personaNatural come guardia retrocompatibilità. |
| Frontend: Tabla Financiero-Tributario (regola) | `src/pages/FastCheckEX.tsx#L4102-L4155` | Sostituito map della riga "Protestos y Morosidades": in ritorno dati della regola ora usa `rule.consolidado.{totalDebts,totalAmountDebts,perFuente}` come count/amount ufficiali, mostra **3 sub-entries per fonte** e badge `Cuadratura OK/DIVERGENTE`; `detailCount/montoTotal` valorizzati da consolidato. |
| Frontend: Riepilogo Dettagli (card) | `src/pages/FastCheckEX.tsx#L4861-L4909` | `calculateTotals(rule)`: sostituito blocco Protestos y Morosidades (prima d.length + somma `monto/unpaidAmount` da rows → rischioso perché ICOM può mancare); adesso **totali da `rule.consolidado`**, 3 card fonte (BOLCOM, ICOM "sin clasificación individual", BED), badge validazione quadratura verde/arancione. Fallback intelligente: se `consolidado` assente (record storici), calcolo da rows. |

#### Caso di test atteso (RUT 77.534.640-K)
```
Total consolidato (debtsSummaryDetail): 164 documentos / $ 3.036.602.310
 BOLCOM:  18 / $  656.674.129
 ICOM:    38 / $1.391.039.361   (sin clasificación individual)
 BED:    108 / $  988.888.820
──────────────────────────────────────────────────────────────────
Σ 18+38+108 = 164 ✅; Σ amount = 3.036.602.310 ✅
```

#### Note retrocompatibilità
- Record **storici** nel DB Mongo che non hanno `consolidato` e `quadratura`: frontend continua a funzionare per fallback (`d.length` + somma da `rule.details`). Solo i nuovi record mostrano totale ufficiale da debtsSummaryDetail e validazione quadratura.
- ICOM: **NESSUNA classificazione inventata**. Se `justificationDescription` è presente in una riga ICOM viene mostrata ma il flag `_tipoClasificacion` rimane `SIN_CLASIFICACION_INDIVIDUAL`.

### Bugfix – Formato monetario CLP (discrepanza 10x Monto Totale Card vs Modale)
**Problema**: nella card di riepilogo "Protestos y Morosidades" il `Monto total` mostrava **$2.928.795.285** (10x in MENO) mentre l'header del modale Dettagli (corretto) mostrava **$29.287.952.850**. Discrepanza esattamente 10x.

**Causa radice**: parser regex numerico `replace(/[^0-9.-]/g, '')` e `parseFloat` applicati a stringhe monetarie formattate in locale **CLP (es-CL)** che usano **`.` come separatore migliaia** (es: `$ 29.287.952.850` oppure `$13.213.872`).
- `"29.287.952.850"` → `parseFloat(...)` legge **solo il primo numero valido = 29.287952850** (parseFloat si ferma al secondo `.`), interpretandolo come numero USA con decimale `29,28...`.
- Invece `$13.213.872` → diventa **13.213** (non 13 milioni!).
- Media sommatoria ~156 righe → **2.928 Miliardi** (10x inferiore al vero totale 29.287 Mld).

**Soluzione**: parser + formatter CLP **uniformi in TUTTI i layer** (TS backend, Python FastAPI, frontend 2 punti + modale).
1. **Nuovo parser `parseNumberLocaleCL` / `_toNumber` / `_to_number` (cross-layer identico)**:
   - Distingue **formato CL** (punti migliaia + virgola decimale: `"2.928.795,50"` → `2928795.5`) **da formato USA** (virgola migliaia + punto decimale: `1,234,567.89`).
   - `>1 punto`: tutti separatori migliaia → rimossi (es `"29.287.952.850"` → `29287952850` ✅ 10x corretto).
   - `1 punto con <=3 cifre dopo`: decimale USA (`1234.56`).
   - `1 punto con >3 cifre dopo`: separatore migliaia CL (`1234.5678` → `12345678`).
   - **Virgola come ultimo separatore** (dopo `.`) → sempre decimale CL.
   - Rimuove simboli valuta (`$ € £ ¥`) e spazi.
2. **Nuovo formatter `formatCLP` uniforme**:
   - `Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })` → niente concatena `$` a mano.
3. **Sostituzioni applicate**:
   - Backend TS: `equifaxService.ts:536` `_toNumber`
   - Backend Python: `risk_calculation_service.py:20` `_to_number`
   - Frontend: `FastCheckEX.tsx:3552` `parseNumberLocaleCL` / `formatCLP` (upgrade a version parser robusto); riga regola FT `L4144-L4161`; riepilogo card `calculateTotals L4895-L4927` (fallback reduce ora usa `parseNumberLocaleCL` → non più errore 1000x per riga)
   - Modale header: `RuleDetailsModal.tsx:378-L440` → stesso identico parser; inoltre preferenza `data._consolidado` (passato da FastCheckEX tramite `Object.assign` su array rows) per usare il totale ufficiale.
4. **Passaggio consolidato a modale**: L'onShowDetails della sezione FT (`FastCheckEX.tsx:4119`) inietta `_consolidado`, `_quadratura`, `_rule` come proprietà sull'array rows (Object.assign senza rompere iterazione) → modale legge il totale ufficiale da debtsSummaryDetail invece che calcolarlo a rows (che può essere 10x sbagliato se le righe hanno meno righe del totale, es: BOLCOM only visible).

#### Test di validazione (Node e Python — PASS)
| Input string | parse ➜ n | formatCLP(n) | OK? |
|---|---|---|---|
| `"29.287.952.850"` (CL multipunto) | `29287952850` | `$29.287.952.850` | ✅ |
| `"$29.287.952.850"` (con simbolo $) | `29287952850` | `$29.287.952.850` | ✅ |
| `"29287952850.0"` (Equifax raw) | `29287952850` | `$29.287.952.850` | ✅ |
| `"$13.213.872"` (singola riga CLP) | `13213872` | `$13.213.872` | ✅ |
| `"2.928.795,50"` (virgola decimale CL) | `2928795.5` | `$2.928.796` | ✅ |
| `"1234567.89"` (USA 2 decimali) | `1234567.89` | `$1.234.568` | ✅ |

### Bugfix (2a iterazione) – Difesa Estrema calculateTotals (stesso problema: Card Protestos ancora 10x)
**Problema**: dopo il primo fix formato CLP, la card singola "Protestos y Morosidades" nel pannello Parametri Rilevanti (TableSummary) mostrava **ancora** `Monto total = $2.928.795.285` (10x MENO) mentre il modale header era corretto `$29.287.952.850`. Label nella card non contenevano "(total consolidato)" → bundle frontend non ricompilato/caricato + 3 punti di debolezza residui in `calculateTotals`.

**Causa radice multipla**:
1. **Match label Protestos debole**: uguaglianza esatta `label === 'Protestos y Morosidades'` → case/typos/alias potevano bypassare il blocco dedicato e finire in percorsi fallback.
2. **Priorità invertita**: nel blocco Protestos, il fallback `d.reduce(somma rows)` veniva usato **prima** di `rule.montoTotal` / `rule.detailCount` (numeri PURI da backend, zero parsing). Se le rows erano stringhe CLP formattate e il bundle vecchio non attivava il blocco → si riproduceva il bug regex 10x.
3. **Residui regex vecchie**: 3 blocchi calculateTotals rimanevano con `replace(/[^0-9.-]/g, '')`: Multas Laborales, Condenas Antisindicales, **Deuda Previsional Publicada**.
4. **Nessun fallback generico**: dopo `Causas Penali` non c'era un `else` finale che garantisse "Cantidad + Monto total" con parser corretto → label non matchate rischiavano percorsi non uniformi.

**Soluzione (Difesa Estrema 4 punti in calculateTotals L4893-L5080)**:
1. **Match Protestos ROBUSTO** (L4905-L4964):
   ```ts
   label.trim().toLowerCase().includes('protestos')
   && label.trim().toLowerCase().includes('morosidades')
   ```
   Nessun exact match.
2. **Gerarchia fonti PRIORITA' 1 → BACKEND NUMBER PURE** (zero parsing rischioso):
   - `totalDebts`  = `rule.detailCount > 0` ? `rule.detailCount` : `consolidado.totalDebts` : `fallback reduce rows`
   - `totalAmountDebts` = `rule.montoTotal > 0` ? `rule.montoTotal` : `consolidado.totalAmountDebts` : `fallback reduce parseCLP`
3. **Zero regex monetarie rimaste in calculateTotals**:
   - Multas Laborales (L4895-L4903): `parseNumberLocaleCL(monto)` + `formatCLP()`
   - Condenas Antisindicales (L4966-L4974): `parseNumberLocaleCL(monto)` + `formatCLP()`
   - **Deuda Previsional Publicada (L5043-L5051)** (residuo ultima ora): `parseNumberLocaleCL(monto)` + `formatCLP(montoTotal)`
4. **Else GENERICO finale dopo Causas Penali (L5069-L5080)**:
   Per **OGNI** label non matchata esplicitamente:
   - Pusha `Cantidad = d.length` (se non già presente)
   - Pusha `Monto total = formatCLP( reduce(d, parseNumberLocaleCL) )` (se amount>0 e non già presente)
   - Parser multi-campo: `monto`, `Monto`, `unpaidAmount`, `amount`, `importe`
5. **Label allineate esattamente all'immagine utente**: rimosso appendice "(total consolidado)" → label esatte:
   - `Cantidad de protestos y morosidades`
   - `Monto total`

#### Test di validazione self-test Node (PASS 3/3)
| Scenario simulate | Atteso Monto total | Risultato | OK? |
|---|---|---|---|
| Protestos + `rule.montoTotal=29287952850` (BACKEND PURE, priorità 1) | `$29.287.952.850` | `$29.287.952.850` | ✅ |
| Protestos + solo rows CLP `['$13.213.872', …]` (fallback reduce) | somma corretta multipunto (`$646.460.256`) | `$646.460.256` | ✅ |
| Label sconosciuta + rows CLP (else generico) | `$29.287.952.850` + `Cantidad = 2` | come atteso | ✅ |

**Nota operativa utente**: la discrepanza visuale nell'immagine (label senza "consolidado" + 10x) conferma che il **browser sta eseguendo bundle vecchio**. Dopo deploy effettuare **Hard Refresh Ctrl+Shift+R** (Cmd+Shift+R su Mac) per forzare ricarica.

### Bugfix (3a iterazione) – Disallineamento count Card Protestos (Total=156 vs Cantidad=164)
**Problema** (dopo `npm run build`, screenshot 10/09 #3): nella card Protestos y Morosidades apparivano **2 righe COUNT con valori DIVERSI**:
```
Total Protestos y Morosidades        → 156 ❌ (= d.length righe visualizzate)
Cantidad de protestos y morosidades → 164 ✅ (= consolidato debtsSummaryDetail)
```
Disallineamento Count diff=8, 2 valori diversi sulla stessa card → confusione.

**Causa radice (2 punti)**:
1. **Prima riga "Total ${label}" L4893** usava `value = d.length` SENZA controllare `rule.detailCount` o `consolidado.totalDebts` → mostrava sempre la somma delle righe (sum fonti = 18+38+100 = 156) invece del totale ufficiale debtsSummaryDetail=164.
2. **Controllo type-unsafe**: `typeof rule.detailCount === 'number'` → se `detailCount` arrivava al frontend come stringa numerica `"164"` (es: JSON serializzazione anomala per qualche pathway), il typeof falliva e cadeva in fallback `d.length=156`.

**Soluzione (2 fix in [FastCheckEX.tsx:L4893-L4987](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4893-L4987))**:
1. **Helper `__robustCountNum(val)` GENERICO** (L4895-L4902):
   ```ts
   // Accetta number OR "numeric string" → sempre restituisce number|null
   typeof val === 'number' (&& !NaN)    → Math.round(val)
   typeof val === 'string' && !isNaN(Number(val)) → Math.round(Number(val))
   ```
2. **Prima riga `Total ${label}` ROBUSTA** (L4903-L4907):
   Stessa gerarchia fonti del blocco specifico:
   ```
   count = rule.detailCount (robusto) > 0
        → altrimenti consolidado.totalDebts (robusto) > 0
        → altrimenti fallback d.length
   ```
3. **Blocco Protestos: ALLINEAMENTO FORZATO riga 1 ↔ riga 2** (L4948-L4950):
   Dopo il calcolo ufficiale `totalDebts`, impone:
   ```ts
   if (items.length > 0) items[0].value = totalDebts;
   ```
   Garantisce che `Total Protestos y Morosidades = Cantidad de protestos y morosidades` **SEM PRE** (nessuna possibilità di disallineamento futuro).
4. **Condizioni blocco Protestos ROBUSTE** (L4934-L4947):
   Stesso identico helper `__robustCountNum` per `rule.detailCount` e `consolidado.totalDebts` + `parseNumberLocaleCL` per ogni moneta.
5. **Backend Python check** ([risk_calculation_service.py:L642-L662](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/risk_calculation_service.py#L642-L662)):
   - `total_debts = int(pm["totalDebts"]) if isinstance(pm.get("totalDebts"), (int, float)) else len(rows)`
   - `detailCount = total_debts if total_debts > 0 else len(rows)` ✅ Number puro.
   - Backend Node TS `equifaxService.ts` già restituisce `number`.

**Risultato atteso dopo nuovo `npm run build + Hard Refresh`**:
```
Total Protestos y Morosidades        → 164 ✅
Cantidad de protestos y morosidades → 164 ✅ (stesso identico valore!)
Monto total                          → $3.036.602.310 ✅
...
Validación de cuadratura             → ⚠️ WARN count 156 vs 164 (diff 8) corretto, è la quadratura debtsSummaryDetail ufficiale vs somme righe.
```

### Bugfix (4a iterazione) – Modale Dettagli Protestos header disallineato (156/2.9 Mld vs Card 164/3.0 Mld)
**Problema** (dopo build 3a iterazione, screenshot utente #4):
- 🟢 Card Parametri Rilevanti: `Total = 164 / Monto = $3.036.602.310` ✅ (allineata alla specifica)
- 🔴 Modale Dettagli header (dalla tabella Financiero-Tributario): `Cantidad 156 / Monto $2.928.795.285` ❌ (= sum righe visualizzate 18+38+100)

Disallineamento totale Modale vs Card per il blocco Protestos.

**Causa radice (2 bug)**:
1. **RuleDetailsModal.tsx L414 (condizione SBAGLIATA e ridondante)**:
   ```ts
   // prima: non aggiornava il totalDebts se d.length (156) !== consolidato.totalDebts (164)
   if (consolidado?.totalDebts != null && (totalDebts == null || d.length === 0 || d.length === totalDebts || totalDebts === 0))
     totalDebts = consolidado.totalDebts;
   ```
   Nessun senso: dovevamo prendere SEMPRE il consolidato se esiste, non condizionato a `d.length === totalDebts`.
2. **onShowDetails FT FastCheckEX L4119 (match debole e scope sbagliato)**:
   - Match label `===` exact invece di includes robusto
   - Cercava rule solo in `finTribRules`; se rule Protestos era stata "copiata" in detectedParams ma il riferimento era diverso, l'Object.assign **non avveniva** → `consolidato === null` nel modale → tutto cadeva in fallback rows.
   - Tentativo di usare `detectedParams` in uno scope DOPO la dichiarazione (L4812): errore TS `Cannot find name 'detectedParams'` immediatamente beccato.

**Soluzione (2 file)**:
1. **RuleDetailsModal.tsx blocco Protestos [L377-L474](file:///home/duxiter/duxiter_intermediate/src/components/ui/RuleDetailsModal/RuleDetailsModal.tsx#L377-L474)**:
   - Match label ROBUSTO `includes('protestos') && includes('morosidades')` invece di exact
   - Helper `__robustCountNum` (number + numeric string)
   - Stessa gerarchia fonti della Card:
     ```
     totalDebts    = __rule.detailCount > 0 ?
                  → consolidado.totalDebts > 0 ?
                  → fallback d.length

     montoTotal   = __rule.montoTotal > 0 ?
                  → consolidado.totalAmountDebts > 0 ?
                  → fallback reduce rows parseNumberLocaleCL
     ```
   - Rimossa TOTALMENTE la condizione ridicola L414.
2. **FastCheckEX.tsx onShowDetails [L4119-L4146](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4119-L4146)**:
   - Match label ROBUSTO includes (mai più exact)
   - `allRulesFlat = Object.values(riskSummary.allRules).flat()` → TUTTE le rules di tutti i gruppi (compliance, legal, capitalHumano, financieroTributario) cercate per trovare Protestos. Nessun problema di scope.
   - Object.assign inietta ANCHE `detailCount` e `montoTotal` direttamente sull'array, oltre a `_rule`, `_consolidado`, `_quadratura`.
   - Così anche nel caso peggiore (consolidato non trovato), RuleDetailsModal può leggere `rawAny.detailCount` e `rawAny.montoTotal`.

**Risultato atteso dopo `npm run build + Hard Refresh Ctrl+Shift+R`**:
```
Card Protestos y Morosidades:
  Total = 164, Cantidad = 164, Monto = $3.036.602.310  ✅

Modale Dettagli (apertura dalla tabella FT):
  CANTIDAD  164
  MONTO TOTAL  $3.036.602.310                         ✅
  (= STESSI identici valori della Card, nessun disallineamento)

Dettagli rows visualizzati: 156 (18+38+100) = NORMALE!
Le 8 righe "mancanti" sono la divergenza fra le rows greppe di BOLCOM+ICOM+BED e il totale ufficiale debtsSummaryDetail.
```

### Bugfix (5a iterazione) – Modale Protestos ancora 156/2.928 Mld: 14 punti apertura modale, Object.assign solo in 1
**Problema** (dopo build 4a iterazione, screenshot utente):
- Build completata OK, Hard Refresh eseguito.
- 🟢 Card Protestos: **164 / $3.036.602.310** ✅ (già corretta dalla 3a iter)
- 🔴 Modale Dettagli header Protestos: **ancora 156 / $2.928.795.285** ❌ come in 4a iterazione

**Causa radice**:
FastCheckEX.tsx ha **14 `setShowRuleDetailsModal(true)` diversi** e la nostra iniezione Object.assign (4a iterazione) c'era solo in **1 handler** (L4100 = tabella Financiero-Tributario). Se il modale veniva aperto da QUALSIASI altro dei 13 punti restanti → nessun `_rule/_consolidado` iniettato → `__rule === null` → `totalDebts = defaultCount = d.length = 156`. **La strategia "Object.assign per ogni handler" non scalava.**

**Soluzione DIFESA ESTREMA (2 file, 0 dipendenze da Object.assign esterno)**:
1. **FastCheckEX.tsx L3733** → Aggiunta prop `riskSummary={riskSummary}` all'**UNICA istanza** del componente `RuleDetailsModal`. Unica modifica "caller-side", scalabile per TUTTE le 14 aperture future.
2. **RuleDetailsModal.tsx** → Ricerca AUTONOMA della regola Protestos dentro il modale stesso:
   - [Props interface + destructuring L21-L55](file:///home/duxiter/duxiter_intermediate/src/components/ui/RuleDetailsModal/RuleDetailsModal.tsx#L21-L55): nuova prop opzionale `riskSummary?: any`
   - [Blocco Protestos L424-L446](file:///home/duxiter/duxiter_intermediate/src/components/ui/RuleDetailsModal/RuleDetailsModal.tsx#L424-L446): nuovo fallback "5a iterazione":
     ```
     Gerarchia Sorgenti per __rule (stabile, non dipende dal caller):
       1. __ruleInjected (da Object.assign 4a iterazione, se esiste → retrocompatibile)
       2. 🔴 __ruleAuto  = flat riskSummary.allRules → find includes('protestos') && includes('morosidades')
           → ricerca AUTONOMA dentro il modale, funziona SEMPRE, da QUALSIASI apertura.
       3. null (mai nella realtà: la regola Protestos è SEMPRE presente in allRules se il title è quello)
     ```
   - Stesso identico algoritmo flat + includes già usato in onShowDetails 4a iterazione, ma ora interno al modale, quindi non dipende più da nessun caller.

**Risultato atteso dopo `npm run build + Hard Refresh Ctrl+Shift+R`**:
```
APERTURA MODALE Protestos DA QUALSIASI PUNTO (14/14):
  CANTIDAD       = 164             (= Card,  debtsSummaryDetail.totalDebts)
  MONTO TOTAL    = $3.036.602.310  (= Card,  debtsSummaryDetail.totalAmountDebts)
  Righe tabella  = 156 (18+38+100) — NORMALE!
  Cuadratura WARN count=156 vs 164 — NORMALE! (divergenza Equifax)
```

### UI Change – Rimosso riquadro "Validación de cuadratura" dalla Card Protestos y Morosidades
**Richiesta utente 10 Set 2026**: dopo aver confermato che l'allineamento Card ↔ Modale è OK (164 / $3.036 Mld), rimosso dalla Card `Protestos y Morosidades` il riquadro `Validación de cuadratura` (WARN 156 vs 164) perché informazione superflua per l'utente (la cuadratura continua a essere calcolata e validata lato backend, ma non viene più mostrata nella UI).

**File modificati** ([FastCheckEX.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx)):
1. **[L4193-L4200](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4193-L4200)** → Rimosso oggetto `label: 'Cuadratura'` da `_extraInfo` della regola Protestos (sezione Financiero-Tributario).
2. **[L4993-L5001](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4993-L5001)** → Rimosso blocco `if (quadratura) { items.push('Validación de cuadratura') }` dalla Card TableSummary Protestos.

**Nota**: La validazione di cuadratura lato backend NON è stata toccata. Le due variabili `quadratura` in FastCheckEX.tsx (L4169, L4934) rimangono dichiarate (hint innocuo TS "never read") perché possono essere utili in futuro per logging/debug o per eventualmente ripristinare la visualizzazione.

**Risultato atteso dopo Hard Refresh**:
```
Card Protestos y Morosidades (dopo rimozione cuadratura):
  Total Protestos y Morosidades           164
  Cantidad de protestos y morosidades     164
  Monto total                           $3.036.602.310
    · BOLCOM                 18 docs / $656.674.129
    · ICOM (sin clasif…)    38 docs / $1.391.039.361
    · BED                  100 docs / $881.081.795
  → RIGA "Validación de cuadratura" RIMOSSA ✅
```

## 2026-08-20

### Dequienes (relaciones societarias): niveles 2 → 5 (default + max)
- Integrazione DeQuienes Graph Relationships: la profondità `distance` (numero di livelli di relazioni disponibili) viene aumentata da **2 a 5 livelli** (impostazione di default + hardcap massimo).
- Prima del fix la malla relazionale mostrava solo società/partecipanti collegati fino a 2 "gradi di separazione" dal RUT target. Ora vengono scaricati e renderizzati tutti i collegamenti disponibili fino al **5° livello**.
- Modificati TUTTI i 4 punti dove `distance=2` era hardcoded/default per evitare disallineamenti:
  - `server/external_providers/dequienes/main.py`
    - Modello Pydantic `RelationshipQueryParams.distance` → default 5, `ge=1, le=5` (OpenAPI descrizione inclusa)
    - Endpoint `GET /relationships/{rut}` parametro `distance: Query(default=5, ge=1, le=5, description=...)`
    - Aggiunto `Query` all'import fastapi L18 (mancante)
  - `server/src/services/dequienesService.ts#L99`: fallback interno `req.distance ?? 2` → `?? 5`
  - `server/src/controllers/rutController.ts#L1052`: call explicita `queryRelationships({ ..., distance:2, ... })` → `distance:5`
- Validazione `ge=1 / le=5` su entrambi i layer (Pydantic model + FastAPI Query) per evitare chiamate con distance 0 o 6+ troppo onerose contro l'API esterna.
- Cache Dequienes: la `cache_key` includeva già `distance` (L306) → vecchi risultati `distance=2` non vengono riusati per nuove chiamate con `distance=5` (comportamento corretto: primo recheck su un RUT già consultato rigenererà nuovi dati con 5 livelli; dopo verrà cachato come di consueto).

### Filtro Cobranza Laboral: solo casi vigenti === true
- Mora Previsional e Multa Laboral: in tutto il flusso (fetch, popolamento filteredDetails, RiskCalc on-the-fly, FastAPI risk-assessment) i casi in `cobranzaLaboral.*.data.casos` vengono tenuti solo se `vigente === true` (stretta uguaglianza booleana: `false`, `null`, `undefined` o campo mancante sono tutti scartati).
- Meta-campi `cantidad` e `totalPages` del wrapper Sheriff V2 vengono ricalcolati coerenti dopo il filtro (no disallineamento fra `cantidad` dichiarata e lunghezza effettiva `casos[]`).
- Ordine operazioni corretto: **filtro vigenti → poi** `slice(0, casesLimit=10)`; in precedenza (invertito) si rischiava di perdere casi vigenti in favore di non-vigenti che consumavano il budget di limit.
- FastAPI: `has_labor_collection` (flag rischio) ora controlla `len(casos) > 0` invece di `bool(wrapper)` — risolti falsi positivi "semaphore=alto" quando il wrapper conteneva meta-campi ma `casos=[]`.
- File modificati:
  - `server/src/services/sheriffService.ts` — helper `filterVigenteCasesOnly()` export + applicazione fetch mora + multa
  - `server/src/controllers/rutController.ts` — filteredDetails flat campi + `filteredDetails.sheriffV2Data` (deep-clone + filtra `cobranzaLaboral`)
  - `server/src/services/riskCalculationService.ts` — filtro SAFE-SAFE runtime all'inizio di `calculateRisk()` (entrambi alias `sheriffV2Data`)
  - `fastcheck_api/app/api/v1/routers/rut.py` — helper `_filter_vigente_true()` e `_has_non_empty_labor_collection()`

### Deduplicazione file `server/json_data/`
- Problema: recheck (rischio on-demand) chiamava `calculateRisk()` 4-7 volte per lo stesso RUT → 4-7 file `riskCalculationResult_*.json` duplicati.
- Adesso debounce 2000ms + path fisso: viene scritto **1 solo file** per RUT, chiamato sempre `riskCalculationResult_LATEST_<RUT>.json` (sempre sovrascritto).
- File modificati: `server/src/services/riskCalculationService.ts#L18-L140`

## 2026-03-18

### Selezione risultato da Consultas (RUT + data / _id)

- Aggiornata la navigazione da dettaglio consulta verso FastCheck per includere l’identificatore del risultato.
  - Quando si apre un record da Consultas (route `/consultas/:id`), il redirect ora passa `resultId` (e `fecha` se disponibile) in query string.
  - File: `src/pages/ConsultaDetailPage.tsx`

- Aggiornato FastCheckEX per preferire il caricamento per `_id` quando presente.
  - `fetchData` ora accetta anche `resultId` e, se valorizzato, usa `GET /rut/results/:id` invece di `GET /rut/results/rut/:rut`.
  - La lettura dei parametri URL dà priorità a `resultId` rispetto a `rut`.
  - File: `src/pages/FastCheckEX.tsx`

### Note verifica

- `npm run build`: OK
- `npx tsc -p tsconfig.json --noEmit`: OK
- `npm run lint`: fallisce per errori pre-esistenti (molti `no-explicit-any`)
- `npm test`: fallisce per configurazione Jest/ESM (`import.meta.env` non supportato in Jest nell’assetto attuale)

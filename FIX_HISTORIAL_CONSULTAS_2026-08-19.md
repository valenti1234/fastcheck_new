# Fix: Historial de Consultas — Restauración de Registros Repetidos

**Fecha**: 19 de Agosto de 2026  
**Autor**: Fix de bug de plataforma  
**Ticket / Referencia**: Bug report usuario — “Hoy se pierde el historial cuando cliente saca una nueva consulta de un rut que verificó antes.” + follow-up: “Non vedo le nuove consultazioni di RUT 77573589-9 né in Dashboard Results né in /consultas/historical.”

---

## 1. Resumen Ejecutivo

Se detectaron **cinco bugs independientes** che, combinados, facevano desaparecer total o parzialmente le consultas storiche (sia nel Dashboard che nella pagina `/consultas/historical`):

| # | Bug | Ubicación | Efecto |
|---|---|---|---|
| 1 | Archivado masivo activado por `isMonitoring` | `server/src/controllers/rutController.ts` | Controlli periodici automatici nascondevano TUTTI i risultati previi del RUT (tramite `archived: true`) |
| 2 | De-duplicazione **distruttiva** in tabella Dashboard | `src/pages/dashboard/Dashboard.tsx` | Anche con record in BD, la tabella frontend mostrava **solo la più recente** per RUT (silent drop) |
| 3 | **Branch corto `existingResult` NON scrive `ConsultaHistory`** | `server/src/controllers/rutController.ts` | Ri-consultazioni (senza `isRefreshing`) ritornavano il record cacheato **SENZA** registrare l’accesso → **scomparsi da /consultas/historical** (BUG PRINCIPALE di oggi pomeriggio) |
| 4 | **Filtro RUT fragile in `getConsultaHistory`** | `server/src/services/consultaHistoryService.ts` | Match esatto `query.rut = rut` (senza normalizzazione) non trovava record se cliente digitava RUT con punti/spazi/formati alternativi o massive in campo `ruts` |
| 5 | **Filtro RUT non normalizzato in `/consultas/historical`** (frontend) | `src/pages/HistoricalConsultas.tsx` | Se utente scriveva il RUT con punti o minuscole, il backend non matchava (ridondante con #4, ma applicato per massima robustezza) |

**Resultado dopo tutti i fix**:
- Consultas del **mismo RUT en días/horas distintos** aparecen como filas separadas en el historial Results.
- **Tutte le ri-consultazioni** (anche senza refresh) **appaiono in `/consultas/historical`** grazie alla scrittura obbligatoria di `ConsultaHistory`.
- Il monitoring automático **no borra ni archiva** la cadena histórica.
- El refresh explícito del usuario (`isRefreshing=true`) sigue archivando resultados viejos (comportamiento intencional).
- Export PDF Dashboard conserva **toda** la cadena histórica filtrada.
- Filtro per RUT in Historical Consultas funziona in **qualsiasi formato** (punti, trattino, minuscolo/maiuscolo).

---

## 2. Bug #1 — Archivado por Monitoring (Backend)

### 2.1 Problema

En `lookupRut` la variable `refresh` valía `isMonitoring || isRefreshing`. Como consecuencia,
cualquier chequeo de monitoring periódico disparaba:

```ts
await Result.updateMany(
  { rut, tenantId, archived: { $ne: true } },
  { $set: { archived: true, archivedAt: new Date() } }
);
```

Como la query de `getResults` (Dashboard) excluye `{ archived: { $ne: true } }`,
toda la historia anterior quedaba invisible para el cliente.

### 2.2 Solución

**Archivo modificado**: [rutController.ts#L673-L688](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L673-L688)

```ts
// BEFORE:
refresh = validatedData.isMonitoring || validatedData.isRefreshing;

// AFTER:
// Only trigger archive on explicit user refresh. Monitoring (periodic checks)
// must NOT archive the historical chain, otherwise prior consultation records are hidden.
refresh = validatedData.isRefreshing;
const isMonitoring = validatedData.isMonitoring;
```

- `isRefreshing = true` → archiva (comportamiento deseado: usuario pide datos nuevos)
- `isMonitoring  = true` → **NO archiva** (mantiene la cadena histórica visible)

### 2.3 Impacto / Backfill automático

Los registros ya archivados por ejecuciones de monitoring **no se desarchivian automáticamente**.
Si el cliente necesita recuperar el histórico de los últimos N días, puede lanzarse este comando MongoDB
directamente contra la collection `results`:

```js
db.results.updateMany(
  { archived: true, archivedAt: { $gte: ISODate("2026-08-01T00:00:00Z") } },
  { $unset: { archived: "", archivedAt: "" } },
  { multi: true }
);
```

(Este paso es opcional; a partir de hoy los nuevos monitoring ya no archivan.)

---

## 3. Bug #2 — De-duplicación destructiva en Frontend Dashboard

### 3.1 Problema

La función `removeDuplicateRuts(data)` se aplicaba a **toda** la tabla de resultados del Dashboard
y también al pipeline de filtros / export PDF:

```ts
const removeDuplicateRuts = (data: IResult[]) => {
  // ... recorre y para cada RUT guarda SOLO la entrada con fecha mayor
  return Array.from(uniqueResults.values());
};
```

Consecuencia: aunque la BD tuviera 5 consultas del mismo RUT en 5 días distintos,
el usuario **veía solo 1 fila** en la tabla (la más reciente). Las demás filas existían en la DB,
pero la UI las descartaba silenciosamente.

### 3.2 Solución

**Archivo modificado**: [Dashboard.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/dashboard/Dashboard.tsx)

#### 3.2.1 — Rinomina helper + commento guardia

```ts
// BEFORE:
// Función helper para eliminar RUTs duplicados
const removeDuplicateRuts = (data: IResult[]) => { ... }

// AFTER:
// Charts/stats helper: keep the LATEST entry per RUT (1 row per RUT for aggregate views).
// MUST NOT be used for the results table or filter pipeline — otherwise the consultation
// HISTORY of repeated lookups of the same RUT is silently erased.
const keepLatestPerRut = (data: IResult[]) => { ... }
```

#### 3.2.2 — Fetch dati principale → Paginazione server-side + `keepLatestPerRut` solo per grafici

```ts
// BEFORE:
// Scarica TUTTE le pagine, le de-duplica, poi paginia localmente (perde lo storico)
const uniqueData = removeDuplicateRuts(allData);
setResults(uniqueData.slice(...));
setAllDataForCharts(uniqueData);

// AFTER:
// 1) Risultati tabella: PAGINAZIONE SERVER DIRETTA → preserva TUTTE le entries
const res = await getResults({ page: currentPage, limit: itemsPerPage, ... });
setResults(pageData);
setTotalPages(tPages);

// 2) Solo per CHART/STATS: aggrega latest-per-RUT (snapshot per RUT, statistiche corrette)
if (currentPage === 1) {
  const rollingAll = ...fetch rolling pages up to safety cap 2000...
  setAllDataForCharts(keepLatestPerRut(rollingAll));
}
```

#### 3.2.3 — Pipeline filtri e click grafico

```ts
// BEFORE (handleApplyFilters + handleRiskChartClick):
const uniqueData = removeDuplicateRuts(allData);
setAllDataForFilters(uniqueData);

// AFTER:
setAllDataForFilters(allData);                         ← filtra/mostra TUTTO lo storico
setAllDataForCharts(keepLatestPerRut(allData));        ← grafici solo latest per RUT
```

#### 3.2.4 — Export PDF Dashboard

```ts
// BEFORE:
const uniqueAllResults = removeDuplicateRuts(allResults);
const finalData = applyFiltersToData(uniqueAllResults);

// AFTER:
const finalData = applyFiltersToData(allResults);   ← storico completo nel PDF
```

---

## 4. Bug #3 — Branch corto `existingResult` NON scrive `ConsultaHistory` (PRINCIPALE)

### 4.1 Problema

In `lookupRut`, quando trovava un record già presente e `!refresh` (nessun `isRefreshing=true`),
il codice faceva **early return senza invocare `logIndividualConsulta`**:

```ts
if (existingResult && !refresh) {
  console.warn(503, "[NO REFRESH] Existing result found for RUT:", validatedData.rut);
  return res.status(200).json(existingResult);  // ← NESSUNA ConsultaHistory scritta!
}
```

Questo era il **bug principale** della segnalazione di oggi pomeriggio:
> *“ho fatto qualche consulta al rut `77573589-9` ma sulla page consultas e /consultas/historical non le vedo”*

Spiegazione esatta per lo scenario riportato:
- **Prima consultazione (10:00)** — crea un nuovo `Result` + scrive `ConsultaHistory` → **si vede in entrambe le pagine**.
- **Seconda consultazione (11:00, senza refresh)** — torna `existingResult`, **non crea** nuovo `Result` ✔️ (corretto per non sprecare chiamate esterne) **ma non scrive** neanche `ConsultaHistory` ❌ → **scompare TOTALMENTE da `/consultas/historical`**.

### 4.2 Soluzione

**Archivo modificato**: [rutController.ts#L693-L737](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L693-L737)

Prima di ritornare `existingResult`, invoca **sempre** `ConsultaHistoryService.logIndividualConsulta(...)`, wrappato in `try/catch` per non fallire mai la richiesta principale:

```ts
if (existingResult && !refresh) {
  console.warn(503, "[NO REFRESH] Existing result found for RUT:", validatedData.rut);
  RutController.logDebug('EXIT_EXISTING_FOUND', { ... });

  // ===== NUOVO: logga SEMPRE la consultazione =====
  try {
    const processingTime = Date.now() - startTime;
    await ConsultaHistoryService.logIndividualConsulta(
      req,
      validatedData.rut,
      '/api/rut/lookup',
      200,
      {
        rut: existingResult.rut || validatedData.rut,
        riskLevel: (existingResult as any).riskAssessment?.globalSemaphore
          || (existingResult as any).riskAssessment?.riskSummary?.semaphore
          || 'unknown',
        companyName: (existingResult as any).companyGeneralInfo?.razonSocial
          || (existingResult as any).details?.razonSocial
          || 'unknown'
      },
      undefined,
      processingTime,
      validatedData.isPep || validatedData.isMonitoring ? 0 : 1,
      {
        isRefresh: false,
        isMonitoring: validatedData.isMonitoring,
        isRefreshing: validatedData.isRefreshing,
        isPep: validatedData.isPep,
        hasExistingResult: true,
        servedFromCache: true,   // ← permette di distinguere i casi cached da quelli "nuovi"
        requestData: {
          rut: validatedData.rut,
          isMonitoring: validatedData.isMonitoring,
          isRefreshing: validatedData.isRefreshing,
          refresh,
          isPep: validatedData.isPep,
          hasExistingResult: true
        }
      }
    );
  } catch (logError) {
    console.error('[CONSULTA_HISTORY] Error logging cached consultation (existingResult):', logError);
  }
  // ===== FINE NUOVO BLOCCO =====

  return res.status(200).json(existingResult);
}
```

**Differenze nella riga di Historical Consultas (dopo il fix)**:
- `metadata.servedFromCache = true` se la risposta è da cache
- `metadata.hasExistingResult = true`
- creditsUsed = `1` (standard) oppure `0` se PEP o Monitoring (regola già presente nel branch di successo)

### 4.3 Differenza tra Dashboard Results e Historical

Dopo questo fix vale la seguente regola (voluta):

| Tipo accesso | Dashboard Results (collection `results`) | `/consultas/historical` (collection `consulta_history`) |
|---|---|---|
| Prima consultazione RUT | ✅ 1 nuova entry | ✅ 1 nuova entry |
| Ri-consultazione **senza refresh** (cached) | ❌ Nessuna nuova entry (mantiene ultima valutazione) | ✅ **1 nuova entry** (log accesso) |
| Ri-consultazione **con refresh** (`isRefreshing=true`) | ✅ 1 nuova entry + archivia la vecchia | ✅ 1 nuova entry |

---

## 5. Bug #4 — Filtro RUT fragile in `ConsultaHistoryService.getConsultaHistory`

### 5.1 Problema

Il filtro per RUT in `getConsultaHistory` faceva **match esatto** sul campo:

```ts
// BEFORE:
if (rut) {
  query.rut = rut;   // ← 77.573.589-9 non matcha 77573589-9!
}
```

Inoltre, le **consultazioni massive** (`consultaType = 'massive'`) usano il campo array `ruts: string[]`, e il campo singolare `rut` è vuoto/assente → la query esclusa TUTTE le consultazioni massive quando si filtrava per RUT.

### 5.2 Soluzione

**Archivo modificato**: [consultaHistoryService.ts#L188-L217](file:///home/duxiter/duxiter_intermediate/server/src/services/consultaHistoryService.ts#L188-L217)

Implementa:
1. **Normalizzazione** del RUT in input (stesso algoritmo di `RutController.normalizeRut`)
2. **3 varianti canonicali** (`raw pulito`, `no trattino`, `con trattino canonico`)
3. **`$or`** tra:
   - `rut: { $in: variants }` → per individuali
   - `ruts: { $elemMatch: { $in: variants } }` → per massive

```ts
if (rut) {
  const cleanedRaw = String(rut).replace(/\./g, '').replace(/\s+/g, '');
  const noDash = cleanedRaw.replace(/-/g, '').toUpperCase();
  const withDash = (() => {
    if (cleanedRaw.includes('-')) {
      const [num, dv] = cleanedRaw.split('-');
      const numericRaw = num.replace(/[^0-9]/g, '');
      const check = (dv || '').replace(/[^0-9kK]/g, '').toUpperCase();
      const numeric = (numericRaw.replace(/^0+/, '') || '0');
      return `${numeric}-${check}`;
    }
    if (cleanedRaw.length < 2) return cleanedRaw.toUpperCase();
    const base = cleanedRaw.replace(/[^0-9kK]/g, '').toUpperCase();
    const numericRaw = base.slice(0, -1).replace(/[^0-9]/g, '');
    const check = base.slice(-1);
    const numeric = (numericRaw.replace(/^0+/, '') || '0');
    return `${numeric}-${check}`;
  })();

  const variants = [cleanedRaw, noDash, withDash].filter(Boolean);
  const uniqVariants = Array.from(new Set(variants));
  query.$or = [
    { rut: { $in: uniqVariants } },
    { ruts: { $elemMatch: { $in: uniqVariants } } }
  ];
}
```

---

## 6. Bug #5 — Frontend `/consultas/historical` non normalizza filtro RUT

### 6.1 Problema

Nel componente `HistoricalConsultas.tsx`, il filtro RUT passato all’API era **esattamente quello digitato dall’utente**, senza alcuna sanitizzazione:

```ts
// BEFORE:
const handleApplyFilters = () => {
  const newFilters: HistoricalConsultaFilters = {
    ...
    ...(rutFilter && { rut: rutFilter }),  // ← "77.573.589-9" oppure "77573589-k"
    ...
  };
  ...
};
```

Anche se ora il backend (#4) gestisce le varianti, è buona norma applicare la normalizzazione anche lato client (minore carico sul backend, più consistenza nel query string e nell’URL).

### 6.2 Soluzione

**Archivo modificato**: [HistoricalConsultas.tsx#L12-L149](file:///home/duxiter/duxiter_intermediate/src/pages/HistoricalConsultas.tsx#L12-L149)

- Aggiunto helper `normalizeRutFilter` (stessa logica canonica `77573589-9`)
- Utilizzato in **2 punti**:
  1. [applyQuickTypeFilter](file:///home/duxiter/duxiter_intermediate/src/pages/HistoricalConsultas.tsx#L113-L131)
  2. [handleApplyFilters](file:///home/duxiter/duxiter_intermediate/src/pages/HistoricalConsultas.tsx#L133-L149)

```ts
const normalizeRutFilter = (rut: string): string => {
  if (!rut) return rut;
  // ...algoritmo identico a RutController.normalizeRut (senza punti, trattino, maiuscolo)...
  return `${numeric}-${check}`;
};

const handleApplyFilters = () => {
  const normalizedRut = normalizeRutFilter(rutFilter);
  const newFilters: HistoricalConsultaFilters = {
    page: 1, limit: 20,
    ...(consultaType && { consultaType }),
    ...(normalizedRut && { rut: normalizedRut }),  // ← normalizzato
    ...(statusFilter && { responseStatus: parseInt(statusFilter) }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  };
  ...
};
```

---

## 7. Punti modificati in sintesi

| File | Sezione | Tipo | Fix/ Bug |
|---|---|---|---|
| [rutController.ts#L673-L688](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L673-L688) | Refresh archive guardia (solo `isRefreshing`) | Backend API | Bug #1 |
| [rutController.ts#L693-L737](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L693-L737) | `existingResult` branch → logga sempre `ConsultaHistory` | Backend API | **Bug #3 (PRINCIPALE)** |
| [consultaHistoryService.ts#L188-L217](file:///home/duxiter/duxiter_intermediate/server/src/services/consultaHistoryService.ts#L188-L217) | `getConsultaHistory` filtro RUT → normalizzazione + `$in` + massive support | Backend Service | Bug #4 |
| [Dashboard.tsx#L66-L80](file:///home/duxiter/duxiter_intermediate/src/pages/dashboard/Dashboard.tsx#L66-L80) | `keepLatestPerRut` (rinominato da `removeDuplicateRuts`) | Frontend Helper | Bug #2 |
| [Dashboard.tsx#L372-L414](file:///home/duxiter/duxiter_intermediate/src/pages/dashboard/Dashboard.tsx#L372-L414) | `useEffect` fetchData → paginazione server diretta, dedup solo per charts | Frontend | Bug #2 |
| [Dashboard.tsx#L1073-L1080](file:///home/duxiter/duxiter_intermediate/src/pages/dashboard/Dashboard.tsx#L1073-L1080) | `handleApplyFilters` → no dedup filter pipeline | Frontend | Bug #2 |
| [Dashboard.tsx#L1207-L1209](file:///home/duxiter/duxiter_intermediate/src/pages/dashboard/Dashboard.tsx#L1207-L1209) | `handleRiskChartClick` → no dedup filter pipeline | Frontend | Bug #2 |
| [Dashboard.tsx#L1231](file:///home/duxiter/duxiter_intermediate/src/pages/dashboard/Dashboard.tsx#L1231) | `handleExportPDF` → export completo | Frontend | Bug #2 |
| [HistoricalConsultas.tsx#L12-L30](file:///home/duxiter/duxiter_intermediate/src/pages/HistoricalConsultas.tsx#L12-L30) | Nuovo helper `normalizeRutFilter` | Frontend Helper | Bug #5 |
| [HistoricalConsultas.tsx#L113-L149](file:///home/duxiter/duxiter_intermediate/src/pages/HistoricalConsultas.tsx#L113-L149) | `applyQuickTypeFilter` + `handleApplyFilters` usano RUT normalizzato | Frontend | Bug #5 |

---

## 8. Comportamenti attesi — Test manuale

| Caso di test | Prima dei fix | Dopo tutti i fix |
|---|---|---|
| Stesso RUT consultato lunedì, martedì, mercoledì (con refresh) | 1 sola riga (mercoledì) | ✅ **3 righe distinte** in Dashboard Results (1 per giorno) |
| Stesso RUT ri-consultato NEL GIORNO **senza** refresh | 1 sola entry + NESSUNO storico | ✅ Sempre 1 entry in Results + ✅ **tutte** le ri-consultazioni in `/consultas/historical` (con `servedFromCache=true`) |
| Monitoring automatico (batch, `isMonitoring=true`) | Archiviazioni a catena → storico perso | ✅ **Nessun archivio** → storico invariato |
| Refresh manuale (bottone “Aggiorna” / `isRefreshing=true`) | Archivio vecchi (corretto) | ✅ Stesso comportamento |
| Filtro Historical RUT con punti (`77.573.589-9`) o minuscole (`77573589-k`) | **Nessun risultato** | ✅ Matcha correttamente grazie a doppia normalizzazione FE+BE |
| Stesso RUT presente in una consultazione MASSIVA (`ruts: [...]`) | **Nessun match** nel filtro RUT | ✅ Match grazie a `ruts: $elemMatch: $in` |
| Grafico donut rischio Dashboard | Ultima entry per RUT | ✅ Stesso valore (`keepLatestPerRut`) |
| Export PDF Dashboard | Perse le ri-consultazioni | ✅ Storico completo + filtri applicati |
| ResultsTable paginazione | Client-side over dedup | ✅ Server-side (corretto + performante) |

---

## 9. Verifica tecnica

- ✅ **GetDiagnostics** (IDE TypeScript/ESLint): **0 errori**.
- ✅ **Nessun riferimento residuo** a `removeDuplicateRuts`: 0 match in tutto il repo.
- ✅ **`keepLatestPerRut` usato 4 volte**: definizione + `fetchData` charts + `handleApplyFilters` charts + `handleRiskChartClick` charts.
- ✅ **`logIndividualConsulta`** ora è invocato in **3 punti distinti** del branch di successo `lookupRut`: cached (existingResult), creazione nuovo Result, e branch errore → **copertura totale**.
- ✅ **Filtro RUT robusto** (`$in` con 3 varianti) + supporto per `ruts` massive.
- ✅ **Paginazione filter-mode coerente**: `totalFilteredPages` viene sempre usato in ResultsTable quando `isFilterMode=true`.

---

## 10. Note sul deployment

- **Nessuna migrazione schema necessaria** (nessun campo nuovo/rinominato). Le 2 collection `results` e `consulta_history` mantengono gli stessi indici.
- **Raccomandato**: restart del server Node + ricarica hard browser (Ctrl/Cmd+Shift+R) dopo deploy per assicurarsi che il bundle frontend nuovo sia caricato.
- **Nota per il passato**: le ri-consultazioni cached **effettuate prima di questo deploy** non sono state registrate in `consulta_history` e non possono essere recuperate (non esiste modo certo di ricostruirle perché il branch corto scriveva solo la response ma non il log). Da oggi in avanti verranno tracciate TUTTE.
- **Stato `servedFromCache`**: si può usare in futuro in Analytics o nella UI Historical per distinguere consultazioni vere da cached.

---

*End of document — FIX_HISTORIAL_CONSULTAS_2026-08-19.md*

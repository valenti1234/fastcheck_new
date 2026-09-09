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

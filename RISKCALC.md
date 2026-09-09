# Riepilogo Regole di Calcolo Rischio

## Struttura complessiva
- Funzione principale: `server/src/services/riskCalculationService.ts:14` (`RiskCalculationService.calculateRisk`)
- Inizializzazione regole per dimensione: `server/src/services/riskCalculationService.ts:777–806` (`initializeRules`)
- Costruzione riepilogo semaforico: `server/src/services/riskCalculationService.ts:1575–1667` (`riskSummary`)
- Conteggi per semaforo generale: `server/src/services/riskCalculationService.ts:1839–1908` (`countRisks`), `server/src/services/riskCalculationService.ts:1910–1922` (`calculateGeneralSemaphore`)
- Documentazione markdown interna: `server/src/services/riskCalculationService.ts:2025–2143` (`buildDocMarkdown`)

## Dimensione: Compliance
1. Condenas Ley 21.121
   - Regola: `server/src/services/riskCalculationService.ts:817–861` (`evaluateComplianceRules`)
   - Condizione: `summaryData.data.ley21121Detected === true`
2. Condenas Ley 20.393
   - Regola: `server/src/services/riskCalculationService.ts:863–895` (`evaluateComplianceRules`)
   - Condizione: `summaryData.data.ley20393Detected === true`
3. Listas Internacionales
   - Regola: `server/src/services/riskCalculationService.ts:900–929` (`evaluateComplianceRules`)
   - Condizione: `compliance.summary[table=="Listas Internacionales"].countResults > 0`
4. Sanciones Medioambientales (SNIFA)
   - Regola: `server/src/services/riskCalculationService.ts:930–948` (`evaluateComplianceRules`)
   - Verifica DB: `server/src/services/riskCalculationService.ts:320–441` (`checkEnvironmentalSanctions`)
5. Listas Propias Alto Impacto (LP Altos)
   - Regola: `server/src/services/riskCalculationService.ts:967–999` (`evaluateComplianceRules`)
   - Condizione: `summaryData.data.lpaltosDetected === true`
6. Listas Propias Mediano Impacto (LP Medios)
   - Regola: `server/src/services/riskCalculationService.ts:1000–1033` (`evaluateComplianceRules`)
   - Condizione: `summaryData.data.lpmediosDetected === true`
7. PEP Chile
   - Regola: `server/src/services/riskCalculationService.ts:1034–1062` (`evaluateComplianceRules`)
   - Condizione: `compliance.summary[table=="PEP Chile"].countResults > 0`
8. Familiares PEP
   - Regola: `server/src/services/riskCalculationService.ts:1063–1091` (`evaluateComplianceRules`)
   - Condizione: `compliance.summary[table=="Familiares PEP"].countResults > 0`

## Dimensione: Legal
1. Quiebra Judicial
   - Regola: `server/src/services/riskCalculationService.ts:1376–1406` (`evaluateLegalRules`)
   - Condizione: `summaryData.data.creditScoring.judicialBankruptcy === true`
2. Boletín Concursal
   - Regola: `server/src/services/riskCalculationService.ts:1408–1434` (`evaluateLegalRules`)
   - Condizione: `summaryData.data.boletinConcursalSummary === true`
3. Causas Civiles
   - Regola: `server/src/services/riskCalculationService.ts:1436–1469` (`evaluateLegalRules`)
   - Condizione: `civilCasesData.length > 0`
   - Dettaglio: riepilogo civile `server/src/services/riskCalculationService.ts:1556–1573` (`getCivilJudicialSummary`)
4. Causas Laborales
   - Regola: `server/src/services/riskCalculationService.ts:1471–1504` (`evaluateLegalRules`)
   - Condizione: `laboralCasesData.length > 0`
5. Causas de Cobranza Laboral
   - Regola: `server/src/services/riskCalculationService.ts:1505–1536` (`evaluateLegalRules`)
   - Condizione: `cobranzaCasesData.length > 0`

## Dimensione: Capital Humano
1. Condenas por Prácticas Antisindicales
   - Regola: `server/src/services/riskCalculationService.ts:1173–1231` (`evaluateCapitalHumanoRules`)
   - Origine dati: Mongo `AntiunionCase` via RUT, memorizzato in `logEntry.antiunionCases` (`server/src/services/riskCalculationService.ts:134–157`)
2. Deuda Previsional Publicada
   - Regola: `server/src/services/riskCalculationService.ts:1233–1274` (`evaluateCapitalHumanoRules`)
   - Condizione: `filteredDetails.deudaPrevisionalPublicadaPersona{Juridica|Natural} > 0`
3. Multas Laborales
   - Regola: `server/src/services/riskCalculationService.ts:1283–1329` (`evaluateCapitalHumanoRules`)
   - Condizione: `summaryData.data.multaLaboralSummary.totalFines > 0` oppure voci BOLAB con `injuryType === 'M'`
   - Lista dettagli: `server/src/services/riskCalculationService.ts:1539–1554` (`detectMultasLaboralesFromBolab`)
4. Deuda Previsional Presunta
   - Regola: `server/src/services/riskCalculationService.ts:1331–1364` (`evaluateCapitalHumanoRules`)
   - Condizione: `parseInt(summaryData.data.moraPrevisionalSummary.totalCases) > 0`

## Dimensione: Financiero Tributario
1. Término de Giro
   - Regola: `server/src/services/riskCalculationService.ts:1677–1707` (`evaluateFinancioeroTributarioRules`)
   - Condizione: `sii.observaciones` contiene "término de giro"
2. Protestos y Morosidades
   - Regola: `server/src/services/riskCalculationService.ts:1709–1763` (`evaluateFinancioeroTributarioRules`)
   - Condizione: `filteredDetails.protestosMorosidadesPersonaJuridica + filteredDetails.protestosMorosidadesPersonaNatural > 0`
3. Inicio de Actividades
   - Regola: `server/src/services/riskCalculationService.ts:1765–1797` (`evaluateFinancioeroTributarioRules`)
   - Condizione: `sii.presentaActividades !== "SI"` oppure `sii.inicioActividades` mancante
4. Contribuyente de difícil fiscalización
   - Regola: `server/src/services/riskCalculationService.ts:1799–1836` (`evaluateFinancioeroTributarioRules`)
   - Condizione: `sii.situacionActual` non contiene "no se encuentra en la nómina de difícil fiscalización"

## Altre funzioni di supporto
- Riepilogo civile: `server/src/services/riskCalculationService.ts:1556–1573` (`getCivilJudicialSummary`)
- Multas Laborales da BOLAB: `server/src/services/riskCalculationService.ts:1539–1554` (`detectMultasLaboralesFromBolab`)
- Sanzioni ambientali (dettaglio): `server/src/services/riskCalculationService.ts:444–548` (`getEnvironmentalSanctions`)
- Procesos sancionatorios (dettaglio): `server/src/services/riskCalculationService.ts:675–775` (`getProcesosSancionatoriosMedioambientales`)

---

## [2026-08-20] GLOBAL VIGENTE FILTER — Cobranza Laboral (Mora Previsional + Multa Laboral)

### Premessa
Il campo `vigente` (boolean) presente in ogni `caso[]` di `cobranzaLaboral.moraPrevisional.data.casos` e `multaLaboral.data.casos` distingue i debiti ancora **attivi/aperti** da quelli **chiusi/cancellati/mancanti**. Ora nel sistema vengono **considerati SOLAMENTE i casi dove `vigente === true`** (stretto, non truthiness).

### Helper condiviso
- **TS** — `server/src/services/sheriffService.ts#L16-L76`: `filterVigenteCasesOnly(payload)` polimorfico (array HELPER S1 o wrapper Sheriff V2 `{cantidad, totalPages, casos[]}`). Ricalcola automaticamente meta-campi `cantidad = len(casos filtrati)` e `totalPages = ceil(len / per_page)`.
- **Python** — `fastcheck_api/app/api/v1/routers/rut.py#L73-L109`: `_filter_vigente_true(payload)` (clone logico 1:1).

### 3 livelli applicativi
| Strato | File | Note |
|---|---|---|
| 1) Entry-level fetch/popola | `sheriffService.ts#L445-L515` + `rutController.ts#L867-L916` | Filtra mora + multa **prima** di `slice(0, casesLimit)` (ordine corretto!) e, crucially, filtra `filteredDetails.sheriffV2Data.cobranzaLaboral.*.data` PRIMA di assegnare al logEntry (questo è il path usato realmente dalle legal rules L1489). |
| 2) Risk-calc SAFE-SAFE runtime | `riskCalculationService.ts#L102-L148` | All'inizio di `calculateRisk()` pulisce sia `logEntry.filteredDetails.sheriffV2Data` che `(logEntry as any).sheriffV2Data` (alias top-level usato L1759). Valido anche per record storici già salvati in Mongo con casi non-vigenti. |
| 3) FastAPI risk veloce | `rut.py#L112-L137` | `has_labor_collection` non usa piu' `bool(obj)` ma controlla `len(casos)` — no falsi positivi di semaforo "alto". |

### Coerenza metadati wrapper
Il wrapper Sheriff V2 dopo filtro ha:
```
casos.length === cantidad === (numero casi vigenti === true)
totalPages === ceil(cantidad / per_page_dedotto)
```

---

## [2026-08-20] Deduplicazione scrittura `server/json_data/`

### Problema
Nel flusso `?risk=true` (recheck / rehachado) `rutController` invoca `RiskCalculationService.calculateRisk()` **4-7 volte** nella stessa richiesta (caller: `unknown`, `lpflags`, `autosync`, `fallback`, `onDemand`, `getAIAnalysis`...). Ogni chiamata scriveva un file timestamped separato → 4-7 file per RUT.

### Soluzione
`server/src/services/riskCalculationService.ts#L18-L140`:
- **Debounce 2000ms** (finestra 2s): chiamate multiple consecutive sovrascrivono il pending payload e resettano il timer. Solo l'ultima vince.
- **Path FISSO sempre sovrascritto**: `riskCalculationResult_LATEST_<normalizedRut>.json` (zero file timestamped storici; niente duplicati per recheck).
- Logs: override del caller + write OK con size/timestamp.

## Origine dati e arricchimento
- Popolamento `filteredDetails` e Equifax: `server/src/controllers/rutController.ts:553–613`, `server/src/controllers/rutController.ts:628–681` (assegnazioni dei campi, BOLAB, contatori)
- Caricamento Sheriff summary: `server/src/services/sheriffService.ts:229–239` e serializzazione nel response: `server/src/controllers/rutController.ts:790–799`
- Invocazione calcolo rischio dal controller: `server/src/controllers/rutController.ts:739–747`
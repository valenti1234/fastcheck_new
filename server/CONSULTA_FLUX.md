Dove parte una “nuova consulta” (Fast-Check / lookup RUT)

- L’app Express monta tutte le API sotto /api in app.ts .
- Il router “RUT” è montato sotto /api/rut in routes/index.ts .
- La “nuova consulta” (lookup) è la POST /api/rut/lookup definita in rutRoutes.ts , che invoca RutController.lookupRut .
Pipeline comune: autenticazione, tenant, permessi

- JWT Auth : il middleware estrae Authorization: Bearer <token> , verifica JWT, carica l’utente e verifica che user.isActive e (se non superuser) che tenant.isActive . Poi popola req.user = {id, email, role, tenant} ( auth.middleware.ts ).
- Tenant isolation : imposta req.tenantId e, per le GET, aggiunge _tenantId in query; i superuser bypassano l’enforcement ( tenant.middleware.ts ).
- Permesso funzionale : sulla lookup serve Permission.RUT_LOOKUP ( permissions.middleware.ts ) applicato in rutRoutes.ts .
## Procedura dettagliata: POST /api/rut/lookup (RutController.lookupRut)
1) Ingresso + validazione input

- Inizia timer e logga l’ENTRY (mascherando parzialmente il RUT) ( rutController.ts ).
- Valida req.body con Zod: { rut, isMonitoring, isRefreshing, isPep, type } e normalizza il RUT ( rutController.ts ).
- Calcola refresh = isMonitoring || isRefreshing ( rutController.ts ).
2) Cache/riuso risultato (short-circuit)

- Se refresh è true: elimina risultati precedenti per quel rut e tenantId (pulizia “forzata”) ( rutController.ts ).
- Cerca l’ultimo Result per (rut, tenantId) . Se esiste e non è refresh, ritorna subito il documento già salvato (HTTP 200) senza rifare chiamate esterne né ricalcoli ( rutController.ts ).
3) Controlli auth “hard” (tenant + userId)

- Se manca tenantId → 401 ( rutController.ts ).
- Se manca userId → 401 (il controller lo richiede anche se poi non scala crediti) ( rutController.ts ).
4) Sistema crediti: precheck (non scala ancora)

- Decide se deve scalare crediti con: shouldDeductCredits = !isPep && (isRefreshing || !refresh) ( rutController.ts ). In pratica:
  - lookup “normale” (non monitoring, non pep) → scala 1 credito
  - refresh “utente” ( isRefreshing=true ) → scala 1 credito
  - monitoring ( isMonitoring=true ⇒ refresh=true) → non scala
  - pep-only ( isPep=true ) → non scala
- Se deve scalare: carica Tenant , verifica availableCredits >= 1 , altrimenti 402 “crediti insufficienti”. Se ok, marca creditPrecheckPassed=true e rimanda la sottrazione a fine flusso “a successo” ( rutController.ts ).
5) Chiamata principale a Sheriff V2 (raccolta dati)

- Costruisce strutture “container” logEntry , companyGeneralInfo e chiama sheriffV2Service.queryRut(...) ( rutController.ts ).
- Da newSheriff estrae resumen.data e costruisce filteredDetails con tantissimi sotto-blocchi (SII, compliance, beni, giudiziale, credit score, ecc.) e flag allCallsSucceeded ( rutController.ts ).
- Mappa “person type” (juridical/natural) e popola liste compliance (pep, penal, liste internazionali, ecc.) in filteredDetails ( rutController.ts ).
6) Arricchimenti esterni (solo se NON pep-only)

- Equifax : decide requestType = personal|empresarial in base al personType , invoca EquifaxService.queryRut , salva la risposta in logEntry.equifaxData e in filteredDetails.equifaxData , estrae i “socios” e metriche (bolab, protesti, debiti previsionali, …) ( rutController.ts ).
- Dequienes : chiama queryRelationships e queryLegalEvents , salvando i risultati in filteredDetails e provando a derivare una fechaDeConstitucion normalizzata ( rutController.ts ).
- Se non trova socios da Equifax, fa fallback su (logEntry as any).empresaEnUnDiaSocios ( rutController.ts ).
7) Persistenza “raw log” (TTL 24h)

- Salva logEntry anche in logSherifData (collezione separata con TTL 24 ore) ( rutController.ts , modello: LogSherifData.ts ).
8) Check su leggi e “liste proprie” (solo company / non pep-only)

- Esegue checkLey21121AndFlag , checkLey20393AndFlag , checkLpaltosAndFlag , checkLpmediosAndFlag .
- Ripete i check “liste proprie” anche sui socios (loop) ( rutController.ts ).
9) Calcolo rischio (RiskCalculationService)

- Inserisce companyGeneralInfo e filteredDetails dentro logEntry , poi invoca RiskCalculationService.calculateRisk(logEntry) se non pep-only ( rutController.ts ).
- Esempio di cosa fa il risk engine: costruisce regole per categorie (compliance/legal/capital humano/finanziario), usando come datasource sia campi filteredDetails (es. news coincidencias, pepChile…) sia lookup su DB per segnali “socios” e liste ( riskCalculationService.ts ).
- Post-processing: completa date e campi anagrafici (rappresentante legale, fecha constitución da più fonti, normalizzazione date) ( rutController.ts ).
10) Determinazione PEP effettivo

- Calcola computedIsPep cercando regole “PEP Chile” / “Familiares PEP” dentro riskData .
- Calcola anche isPepFromCompliance guardando le liste in newSheriff.compliance.data.* ( rutController.ts ).
11) Preparazione risposta + sanitizzazione dimensioni

- Crea dataResponse con: sheriffLogData , details , riskAssessment , companyGeneralInfo , flag isPep , info timing, e creditsConsumed ( rutController.ts ).
- Prima di salvare/rispondere fa:
  - sanitizeData(..., maxSize) per limitare payload molto grandi
  - truncateArraysRecursively(..., 100) per tagliare array enormi ( rutController.ts ).
- Nota: anche lo schema Result applica limiti di size (es. 15MB su details / sheriffLogData ) ( Result.ts ).
12) Salvataggio del risultato consultazione

- Salva new Result(dataResponse) (se queryType === "primary" forza isPep=false ) ( rutController.ts ).
- Se esiste riskData.riskSummary e non pep-only, salva anche un record in CompanyRisks con snapshot rischio + liste regole + puntamenti ( resultId , ecc.) ( rutController.ts , modello: CompanyRisks.ts ).
- C’è codice per creare/aggiornare un Summary “evaluation-result” ma è disattivato da mustSaveSummary=false ( rutController.ts ).
13) Sistema crediti: deduzione finale (solo a successo)

- Se shouldDeductCredits && creditPrecheckPassed : rilegge Tenant , decrementa availableCredits di 1 e incrementa totalCreditsUsed , poi crea un record CreditOperation con operationType = rut_lookup | user_refresh e metadata ( rut , …) ( rutController.ts , modello: creditOperation.model.ts , tenant creditBalance: tenant.model.ts ).
14) Audit: scrittura “ConsultaHistory” (success e failure)

- A successo: ConsultaHistoryService.logIndividualConsulta(...) registra tenant/user, IP/UA/session, endpoint, status 200, processingTime, crediti usati, metadata (refresh/monitoring/isPep/hasExistingResult) ( rutController.ts ).
- A errore: fa logging analogo con responseStatus calcolato (400 Zod, 413 buffer overflow, 500 altro) e errorMessage / errorDetails ( rutController.ts ).
- La struttura dell’audit log sta in ConsultaHistory.ts e viene popolata da ConsultaHistoryService .
15) Risposta HTTP al client

- Se tutto ok: 200 con dataResponse (che include i campi salvati) ( rutController.ts ).
- Se validation error: 400 . Se ERR_OUT_OF_RANGE : 413 . Altrimenti 500 ( rutController.ts ).
## Varianti importanti
A) “PEP-only evaluation” ( isPep=true )

- Non scala crediti ( shouldDeductCredits=false ) e salta Equifax/Dequienes/calcolo rischio (riskAssessment=null) ( rutController.ts , rutController.ts ).
- In risposta companyGeneralInfo viene messo a null , queryType diventa derived_socio_pep ( rutController.ts ).
B) Monitoring (consultazioni schedulate)

- MonitoringService crea schedule e, quando esegue, costruisce una mock request e chiama RutController.lookupRut con isMonitoring=true ( monitoringService.ts ).
- lookupRut in modalità monitoring forza refresh=true ⇒ cancella vecchi Result e produce un nuovo snapshot; poi il monitoring confronta previousRisk vs newRisk e può generare notifiche di cambio rischio.
C) Consultazione massiva (bulk evaluations)

- L’endpoint POST /api/evaluations/bulk crea un job bulk e scala crediti pari al numero di suppliers ( evaluation.routes.ts , service: evaluationService.ts ).
- Qui l’audit viene loggato come consultaType: 'massive' via ConsultaHistoryService.logMassiveConsulta(...) con endpoint /api/evaluations/bulk e creditsUsed = suppliers.length ( evaluationService.ts ).
# Lista de Pruebas QA y Criterios de Aceptación

> Versión: 1.0 · Fecha: 30.09.2026 · Ámbito: Módulo Consultas + FastCheckEX + Export Scripts
> Idioma: Español · Responsable: QA / Product Owner

---

## Convenciones

| Estado | Significado |
|--------|-------------|
| 🟢 PENDIENTE | Caso de prueba por ejecutar |
| 🟡 EN CURSO | Ejecución en progreso |
| ✅ APROBADO | Cumple los criterios de aceptación |
| ❌ RECHAZADO | No cumple; abrir bug ticket con pasos de reproducción |
| ⚠️ OBSERVADO | Desviación menor, no bloqueante |

---

## 🔧 Configuración Previa Requerida

| # | Requisito | Verificación |
|---|-----------|---------------|
| P1 | Usuario tenant_admin logueado en el ambiente de staging | Login exitoso en `/login` |
| P2 | Usuario superusuario (para FastCheckEX ruta protegida) | Acceso a `/fast-check-ex` sin bloqueo |
| P3 | Base de datos con: al menos 1 Result con RUT conocido + 10 socios históricos + registros en `lpaltos` y `lpmedios` | Confirmar vía el script `export-rut-consultations.ts` |
| P4 | Servidor backend corriendo en el puerto configurado + variables `MONGODB_URI` presentes | Ejecutar `cd server && npm run dev` |
| P5 | Frontend corriendo y accesible en navegador | Cargar `/consultas` sin errores consola |

---

## MÓDULO 1 — Consultas (Listado)

### 1.1 Carga y Paginación

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado |
|----|----------------|-------|---------------------|-------------------------|--------|
| C-001 | Carga inicial de lista | Ir a `/consultas` | Muestra tabla con 20 resultados (o menos si hay menos) + spinner inicial | La tabla se muestra completa en < 5s; sin errores en consola | 🟢 |
| C-002 | Paginación siguiente | Clic botón Siguiente (⏭) | Carga la página 2; `currentPage` URL state actualiza | No hay recarga de página completa; datos son nuevos | 🟢 |
| C-003 | Paginación anterior | Desde la página 2, clic en Anterior (⏮) | Vuelve a la página 1; resultados idénticos a la primera carga | El orden y los IDs coinciden con la primera visualización | 🟢 |
| C-004 | Exportar Excel estándar | Clic "Exportar Excel" en filtros | Descarga `Consultas_Duxiter_YYYY-MM-DD.xlsx` | El archivo abre; columnas = RUT, Razón Social, Fecha Consulta, Nivel Riesgo, Tag | 🟢 |

### 1.2 Filtros y Búsqueda

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado |
|----|----------------|-------|---------------------|-------------------------|--------|
| C-010 | Búsqueda por RUT (con guion) | Escribir `17752947-8` en input búsqueda → Aplicar Filtros | Filas restantes solo contienen RUT que incluye `17752947` | La búsqueda NO diferencia mayúsculas ni formato puntos/guion | 🟢 |
| C-011 | Búsqueda por RUT (solo cuerpo, sin DV) | Escribir `17752947` → Aplicar | Encuentra el mismo resultado de C-010 | Debe hacer match usando solo el cuerpo (remove trailing DV) | 🟢 |
| C-012 | Búsqueda por Razón Social | Escribir parte del nombre ("MERCOCARGO") → Aplicar | Filtra por Razón Social correspondiente | Match case-insensitive | 🟢 |
| C-013 | Filtro por rango de fechas | Seleccionar rango Inicio + Fin conocidos → Aplicar | Resultados solo con `createdAt` dentro del rango (inclusivo) | Fechas límite inclusive; resultados en rango | 🟢 |
| C-014 | Filtro por Nivel de Riesgo | Seleccionar "Rojo" / "Crítico" → Aplicar | Solo resultados con `semaphore = red` | 1 checkbox = 1 categoría; multiselección funcional | 🟢 |
| C-015 | Filtro por Tag cliente | Seleccionar un Tag existente → Aplicar | Solo resultados que contienen ese tag en `noteTags[]` | Tags faltantes devuelven array vacío | 🟢 |
| C-016 | Limpiar filtros | Aplicar varios filtros → clic "Limpiar Filtros" | Todos los filtros se resetean; tabla retorna a estado inicial | `allPagesLoaded=false`, búsqueda vacía, riesgos desmarcados | 🟢 |
| C-017 | Botón "Aplicar Todas las Páginas" | Búsqueda conocida → clic botón morado | Muestra `Modo: Todas las páginas cargadas (N resultados totales)`; no hay cortes por paginación | Después del spinner, `fullDataset.length == pagination.total` | 🟢 |
| C-018 | Exportar Excel Info RUTs | Mismo escenario C-017 → clic botón azul "Exportar Excel Info RUTs" | Por cada RUT único: descarga Excel con Sub-Headers tipo (Impacto, Detectado, Riesgo, Cant. Detalles) x cada regla + Totales al final | Archivo abre correctamente en LibreOffice/Excel; no hay columnas desalineadas | 🟢 |

### 1.3 Click en RUT (Navegación → Puente → FastCheckEX)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado |
|----|----------------|-------|---------------------|-------------------------|--------|
| C-030 | **Click celda RUT subrayada** | Clic en el texto del RUT `17752947-8` | Navega a URL intermedia `/consultas/{_id}` y REDIRIGE INMEDIATAMENTE a `/fast-check-ex?rut=...&resultId=...&fecha=...` | Tiempo de transición < 2s; no se ve contenido de ConsultaDetailPage (spinner máximo 1-2s) | 🟢 |
| C-031 | **Click icono ojo 👁 en Acciones** | Clic en el ojo de la misma fila | Misma redirección que C-030 | Resultado idéntico a C-030 | 🟢 |
| C-032 | **Navegación Atrás después del click** | Ejecutar C-030 → clic botón Atrás del navegador | VUELVE a `/consultas` NO a `/consultas/{_id}` | `navigate(replace=true)` destruye la página puente — NO debe quedar en la historia | 🟢 |
| C-033 | **Validación Params URL** | Después de C-030, observar URL en barra de direcciones | Contiene al menos 3 params: `rut=`, `resultId=`, `fecha=` (ISO timestamp) | `resultId` es el ObjectId mongo original de la fila; `rut` coincide con el valor mostrado | 🟢 |
| C-034 | **Isolamento Tenant (seguridad)** | Copiar `resultId` de un Result conocido; cambiar manualmente `?id=` en la URL por un `_id` de OTRO tenant | Backend devuelve 404 Not Found; ConsultaDetailPage muestra error | NO debe permitir acceso cruzado; datos de otro tenant son invisibles | 🟢 |

---

## MÓDULO 2 — FastCheckEX (Resultado de Consulta)

### 2.1 Carga desde `resultId` (precedencia URL)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado |
|----|----------------|-------|---------------------|-------------------------|--------|
| F-001 | Carga con URL `?resultId=X` | Navegar vía flujo C-030 | `fetchData()` recibe `resultId=X` y hace GET a `/rut/results/X` | El registro cargado coincide exactamente con la fila clickeada | 🟢 |
| F-002 | **Precedencia: resultId gana sobre rut** | Modificar URL manualmente: `?rut=OTRO_RUT_DIFERENTE&resultId=X_ORIGINAL` | La página carga el Result del `resultId` — ignora el param `rut` diferente | El RUT mostrado en la UI debe ser el de `resultId`, NO el param `rut` de la URL | 🟢 |
| F-003 | Parámetro `fecha` preservado | Observar `companyData.fechaEvaluacion` en UI (tarjeta principal) | Fecha = `createdAt` del documento mongo (no fecha de HOY) | No debe sobreescribirse con `new Date()` — tiene que ser la fecha real de la consulta | 🟢 |

### 2.2 Sección Socios Históricos — Bug Fix del RUT principal

> **Contexto fix del 30.09.2026**: El RUT de la empresa evaluada NO debe aparecer nunca dentro de la lista de "Socios Históricos". Anteriormente aparecía como socio de sí misma (OWNED_BY autorreferencial).

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado |
|----|----------------|-------|---------------------|-------------------------|--------|
| S-000 | **RUT empresa no aparece en Socios Históricos** | Abrir `/fast-check-ex?resultId=X` de una empresa con OWNED_BY a sí misma | En la tabla "Socios Históricos (N evaluados/seleccionados)" el RUT `17752947-8` NO está listado | Checkeo visual directo + console.log banner `🔧 [FILTRO RUT EVALUACION] Eliminados N socio/s…` | 🟢 |
| S-001 | Matching robusto RUT normalizado | Forzar en el dataset un socio con RUT `17.752.947-8` (con puntos) y otro `177529478` (sin guion ni separadores) | Ambos se excluyen también (matching 3-fallback) | La exclusión no es por string exacto; usa norm + digitsOnly + prefijo 8cifras | 🟢 |
| S-002 | Conteo coherente después del filtro | `Socios Históricos (17/3 evaluados)` → `3 evaluados` son los que tienen `Ya evaluado` | Ninguno de los "Ya evaluados" es el propio RUT de la evaluación | Check visual + tabla de estado "Estado Evaluación" | 🟢 |
| S-003 | Evaluación PEP — checkbox máximo 3 | Intentar marcar 4 socios incluyendo al RUT principal en un caso testigo | El propio RUT principal ni siquiera está visible; el bloqueo máximo-3 solo aplica a los socios listados | `Nota: Puedes evaluar un máximo de 3 socios en total (incluyendo los ya evaluados)` visible | 🟢 |
| S-004 | MeshFlowTable visible por default | URL sin `?p=true` | Panel de la tabla MeshFlowTable (Participaciones Societarias) RENDERIZADO; no colapsado ni oculto | Solo si `p=true` se oculta (feature flag legacy) | 🟢 |

### 2.3 Listas Propias Alto/Medio Impacto (LP)

> 📌 Nota crítica (de `nota.txt` riga 2): `ipalto ipmedio deve essere applicato solo nel momento della consulta`. Confirmar comportamiento actual antes de corregir.

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación (⚠️ comportamiento actual HOY) | Estado |
|----|----------------|-------|---------------------|-------------------------------------------------------|--------|
| LP-001 | **Sincro LP al re-abrir consulta** | 1) Ejecutar C-030 y abrir una consulta <br>2) En otra pestaña, entrar a `/tenant/lpalto` y AGREGAR un socio de esa empresa a Lista Propia Alto Impacto <br>3) Volver a FastCheckEX y **RE-FRESCO (F5)** | 🔴 **Comportamiento actual**: El semáforo cambia y `Listas Propias Alto Impacto = Detectado` (sync in-vivo). Además: `Result.updateOne` PERSISTE el nuevo `riskAssessment` en el documento histórico. | Criterio actual HOY: se re-aplica y modifica el doc histórico. **Intento dichiarato futuro**: snapshot al momento del lookup y RI-calc SOLO durante el click de "Evaluar/refresh". | 🟢 |
| LP-002 | Snapshot before/after coherente | En la misma operación LP-001 revisar server logs | Aparecen banners: `before.lpaltosRecordsLen vs after.lpaltosRecordsLen` → `listaPropiaChanged=true` | Re-calculo de riesgo sólo si cambiaron conteos o si hay desalineación reglas vs data | 🟢 |
| LP-003 | Reglas LP alineadas con data | Después de agregar LP, revisar panel Listas Propias Alto Impato / Mediano Impacto | El checkbox "Detectado" coincide con la longitud de `lpaltosRecords / lpmediosRecords` | No debe haber "detectado = false" cuando `len > 0` ni viceversa | 🟢 |
| LP-004 | Scope tenant nelle LP | Usuario Tenant A agrega RUT X en lpalto. Cerrar sesión → Login como Tenant B → Buscar RUT X y abrir consulta | **No se ve reflejada la LP del Tenant A** | Query LP sempre filtrata per `tenant = tenantId` — isolamento assoluto tra tenants | 🟢 |

### 2.4 Relaciones OWNED_BY bidirezionali

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado |
|----|----------------|-------|---------------------|-------------------------|--------|
| O-001 | Arco inverso detectado | Fuente de datos `dequienesRelationships` solo contiene arco `EMPRESA A → OWNED_BY → SOCIO X` (un solo sentido) | En React Flow MeshFlowChart aparece también el arco inverso: `SOCIO X → controla → EMPRESA A` en la vista | La deduplicación del PASSO 2 no crea duplicados de nombre con/sin acentos | 🟢 |
| O-002 | Normalización diacríticos nombre | Dos registros iguales: `José Pérez` vs `Jose Perez` (sin acento) → mismo RUT | De-dup: queda una única fila con el nombre más completo y el RUT unido | `NFD + strip marks` en la key de deduplicación | 🟢 |

---

## MÓDULO 3 — RUT Canonicalización (Modulo 11)

> Fix del 29.09.2026: String numeriche 8 cifre senza trattino: `20779347` → prima diventava `2077934-7` ERRATO, adesso `20779347-7` corretto grazie alla validazione Mod-11.

| ID | Caso di Prueba | Pasos | Resultado Esperado | Criterio di Accettazione | Stato |
|----|----------------|-------|---------------------|---------------------------|--------|
| R-001 | 8 cifre SENZA trattino | Input `20779347` (noto: corpo=20779347, DV corretto=7) | Il sistema formatta e salva come `20779347-7` | NON deve troncare a 7+1 — l'interpretazione corretta è 8 cifre corpo + DV calcolato | 🟢 |
| R-002 | 7 cifre SENZA trattino | Input `1234567` | DV calcolato via Mod-11; formato corretto `1234567-{DV}` | Per 7 cifre SEMPRE assume corpo=7 e DV viene aggiunto | 🟢 |
| R-003 | Input con punti e K maiuscolo/minuscolo | Input `12.345.678-k` → stringa con trattino esplicito | Canonicalizza in `12345678-K` | Punti rimossi, DV-K uppercased | 🟢 |
| R-004 | Input sbagliato DV noto | Input `12345678-1` (ma il DV corretto Mod-11 = diverso da '1') | Sistema ricalcola e sovrascrive con DV valido secondo algoritmo | Matching "ultima cifra=DV" solo se Mod-11 valida la combinazione | 🟢 |
| R-005 | Stringa 9+ cifre senza trattino | Input `123456789` | Tenta 2 ipotesi: corpo-8 + ultima-cifra-DV vs tutto-corpo e DV calcolato. Vince quella che passa Mod-11 | Disambiguazione tramite algoritmo | 🟢 |

---

## MÓDULO 4 — Script Export Consultas por RUT

> Script creato il 30.09.2026 in [export-rut-consultations.ts](file:///home/duxiter/duxiter_intermediate/server/src/scripts/export-rut-consultations.ts)

| ID | Caso de Prueba | Pasos (en shell dentro `server/`) | Resultado Esperado | Criterio de Aceptación | Estado |
|----|----------------|-----------------------------------|---------------------|-------------------------|--------|
| E-001 | Ejecución básica sin PATH relativo | `npx tsx src/scripts/export-rut-consultations.ts --rut 17752947-8` | 1) Banner verde v1.0 <br> 2) Connessione MongoDB OK (family=4, timeout 5s) <br> 3) Messaggio `✅ EXPORT COMPLETATO` <br> 4) File JSON generato in `server/exports/` | File non-vuoto; non ci sono errori uncaught | 🟢 |
| E-002 | Parametro RUT formati misti | Esegui 3 volte lo stesso RUT: `--rut 17752947-8`, `--rut "17.752.947-8"`, `--rut 177529478` | I 3 file JSON prodotti contengono lo stesso `totalDocuments` e lo stesso set di `_id` | Matching robusto a 3 livelli; canonicalizzazione uguale su tutti gli input | 🟢 |
| E-003 | Cross-Tenant nessun filtro | Eseguire E-001 con un RUT presente in 2 tenant diversi | Nel JSON `meta.summary.distinctTenants = 2` (o più); i `doc.tenantId` sono quelli multipli | **Non applica nessun filtro `tenantId`** a differenza delle API REST | 🟢 |
| E-004 | 3 collezioni interrogate | Verificare il JSON dopo E-001 | 3 chiavi: `results`, `consultaHistory`, `evaluationResults`. Ognuna con `summary`, `ids[]`, `docs[]` | Anche se una collezione non ha dati = count 0 + array vuoto — NO crash | 🟢 |
| E-005 | Modalità `--light` | Eseguire `--rut 17752947-8 --light` | I campi pesanti `sheriffLogData`, `details`, `riskAssessment`, `responseData`, ecc. NON serializzati: contengono stringa placeholder `[OMESSO – campi pesanti disabilitati con --light]` | Dimensione file almeno 10x più piccolo rispetto alla versione completa | 🟢 |
| E-006 | Parametro `--include-archived` | `--rut X --include-archived` | Includono anche documenti con `archived=true` | Di default (senza flag) results.archived=true sono ESCLUSI | 🟢 |
| E-007 | Output path custom `-o` | `-o /tmp/mytest.json --pretty` | File salvato in `/tmp/mytest.json`; formattato con 2 spazi indent (human-readable) | jsonlint valida il file senza errori | 🟢 |
| E-008 | Help `--help` | `--help` | Schermata con Usage, opzioni, esempi e lista delle collezioni | Exit code 0; non crasha | 🟢 |
| E-009 | Parametro `--rut` mancante | Esegui senza flag | Messaggio ERRORE `parametro --rut obbligatorio mancante` + help, exit con code 1 | NO uncaught exception — handled graceful | 🟢 |
| E-010 | MONGODB_URI mancante nel `.env` | Rinominare temporaneamente `.env` → `.env.bak` e rieseguire | Messaggio chiaro `MONGODB_URI non trovato nel file .env`, exit code 1 | NO stacktrace criptico Mongoose default | 🟢 |

---

## MÓDULO 5 — Gestione Errori e Resilienza Backend

> Fix del 29.09.2026: Errori HTTP 400 da `sheriff_v2` (lookup di alcuni RUT) producevano `TypeError: Cannot read properties of null (reading 'data')`. Risolto con stub fallback + optional chaining.

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio di Aceptación | Estado |
|----|----------------|-------|---------------------|-------------------------|--------|
| ERR-001 | RUT causa 400 Bad Request su sheriff_v2 | Forzare un mock di axios che devuelve 400 para un RUT específico (o usar un RUT que se sabe causa dicho error en entorno real) | Lookup NO crashea con TypeError; devuelve stub de fallback coherente (sheriffData parcial / default) | El resto del riskAssessment se calcula con los datos disponibles, no undefined | 🟢 |
| ERR-002 | RUT non-existent | Buscar un RUT inventado y malformado tipo `99999999-Z` | Pantalla con mensaje error controlado, pantalla no-blanca | React ErrorBoundary / catch en useEffect; usuario puede volver atrás y reintentar | 🟢 |
| ERR-003 | MongoDB lento/caído | Parar temporalmente `mongod` y ejecutar script export | `serverSelectionTimeoutMS = 5s` (no 30s default). Mensaje de timeout claro con conexión fallida. | Mensaje `⏱️ Tempo totale connessione MongoDB` fallisce in < 6s | 🟢 |

---

## MÓDULO 6 — UI React Flow Constraints (Hard Constraints del Project Memory)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio di Aceptación | Stato |
|----|----------------|-------|---------------------|-------------------------|--------|
| RF-001 | `fitView` prop disabled | Revisar código `<ReactFlow ...>` + ejecutar en UI: zoom in manuale luego drag nodo | No hay reseteo indeseado de la vista cuando cambian props o estado de nodos | SOLO `fitView()` vía imperative ref. NUNCA prop `fitView={true}` | 🟢 |
| RF-002 | Container dimensions non-zero | Abrir consulta con grafo en viewport | El grafo è visibile; nessun errore in console tipo `width=0 / height=0` | Container React Flow has fixed / absolute dimensions (altezza non collassa) | 🟢 |
| RF-003 | safeOnNodesChange preserves `data.*` | Muovere un nodo nel grafo e ispezionare state nodi in DevTools / logger | Campi custom nel `data` (es. `data.rut`, `data.tenant`, `data.queryType`) NON si perdono dopo l'update | Middleware `safeOnNodesChange` in uso; non sovrascrive intero obj `data` | 🟢 |
| RF-004 | Nodo radice BFS N0 — nome injectato | Grafo mesh con ente radice (la empresa della consulta) | L'Node 0 del BFS ha il `mainName` corretto (Razón Social) non "Sin nombre" fallback | Fallback getName() a multi- livello; l'init passa esplicitamente `mainName` dal prop | 🟢 |

---

## Check Globali di Accettazione Fine Progetto (Definizione di Fatto)

- [ ] Tutti i casi precedenti hanno stato ✅ APROBADO (o documentata giustificazione per los RECHAZADOS)
- [ ] Nessun error `TypeError`, `Uncaught`, `Unhandled Promise Rejection` visibili in console di Chrome / DevTools nei flussi felici
- [ ] Build Frontend: `cd ~/duxiter_intermediate && npm run build` — exit 0 senza TS errors
- [ ] Build Backend (tsc --noEmit): `cd server && npx tsc --noEmit` — exit 0
- [ ] Lint / Diagnostics: 0 file rosso in GetDiagnostics / ESLint
- [ ] CHANGELOG_SEMANAL.md aggionato con i riferimenti di linea esatti `#Lstart-Lend` alle modifiche
- [ ] Script export-rut-consultations eseguito correttamente in staging con almeno 10 file json prodotti senza errori

---

### 📎 Referenze AI / Documenti di supporto

- Descrizione flusso completo (spagnolo): [consultaflow.md](file:///home/duxiter/duxiter_intermediate/consultaflow.md)
- Descrizione flusso completo (italiano): [consultaflow.IT.md](file:///home/duxiter/duxiter_intermediate/consultaflow.IT.md)
- Nota issue LP da `nota.txt`: `problema ipalto ipmedio deve essere applicato solo nel momento della consulta`
- Project memory / hard constraints: `/home/duxiter/.trae/memory/projects/-home-duxiter-.../project_memory.md`

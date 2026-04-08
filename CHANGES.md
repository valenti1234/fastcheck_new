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

# Criteri per Tenant Attivi - Sistema Duxiter

## 📊 Panoramica

Questo documento descrive i criteri utilizzati dal sistema Duxiter per determinare quando un tenant è considerato "attivo" nelle statistiche del pannello amministrativo.

## ✅ Criterio Principale

**Un tenant è considerato attivo se ha utilizzato almeno una valutazione (evaluation).**

### Dettagli Tecnici

Il sistema determina l'attività di un tenant attraverso i seguenti passaggi:

1. **Ricerca nelle operazioni di credito**: Il sistema cerca nella collezione `CreditOperation` tutte le operazioni con:
   - `operationType: 'evaluation'`
   - `creditsChanged < 0` (deduzioni di credito, che indicano valutazioni effettive)

2. **Raggruppamento per tenant**: Le operazioni vengono raggruppate per `tenantId` per contare quante valutazioni ha utilizzato ogni tenant

3. **Conteggio tenant attivi**: Il numero di tenant attivi corrisponde al numero di tenant unici che appaiono nel risultato dell'aggregazione

## 🔍 Implementazione nel Codice

### Posizione
- **File**: `/server/src/controllers/tenant.controller.ts`
- **Funzione**: `getTenantStatistics`
- **Linee**: circa 244-254

### Codice di Riferimento

```javascript
// Aggregazione per trovare tenant con valutazioni utilizzate
const tenantEvaluationStats = await CreditOperation.aggregate([
  {
    $match: {
      operationType: 'evaluation',
      creditsChanged: { $lt: 0 }  // Solo deduzioni (valutazioni effettive)
    }
  },
  {
    $group: {
      _id: '$tenantId',
      evaluationsUsed: { $sum: 1 },
      lastEvaluationDate: { $max: '$createdAt' }
    }
  }
]);

// Il numero di tenant attivi = numero di tenant nel risultato
const activeTenants = tenantEvaluationStats.length;
```

## 📈 Distinzioni Aggiuntive

### Tenant Recentemente Attivi
Il sistema distingue anche i **tenant recentemente attivi** (ultimi 30 giorni) da quelli attivi in generale:

```javascript
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const recentlyActiveTenants = tenantEvaluationStats.filter(stat => 
  stat.lastEvaluationDate && new Date(stat.lastEvaluationDate) > thirtyDaysAgo
).length;
```

### Distribuzione dell'Utilizzo
I tenant attivi vengono ulteriormente categorizzati in base al loro livello di utilizzo:

- **Heavy users**: > 50 valutazioni utilizzate
- **Moderate users**: 11-50 valutazioni utilizzate  
- **Light users**: 1-10 valutazioni utilizzate

## 🎯 Esempi Pratici

### Scenario 1: Tenant Attivo
- Tenant ID: `6827419eecdd4cff1cd6ad69`
- Ha 2 operazioni di tipo `'evaluation'` con `creditsChanged: -1` e `creditsChanged: -10`
- **Risultato**: Considerato attivo

### Scenario 2: Tenant Inattivo
- Tenant ID: `68655c938b15fbb6b1ed48be`
- Non ha operazioni di tipo `'evaluation'` con `creditsChanged < 0`
- **Risultato**: Non considerato attivo

## 🔄 Aggiornamenti Recenti

**Data**: Agosto 2025
**Modifica**: Il sistema è stato aggiornato per calcolare le statistiche basandosi sulle operazioni di credito reali (`CreditOperation`) invece che sui campi `usageStats` dei tenant, che erano obsoleti.

**Benefici**:
- Dati più accurati e aggiornati in tempo reale
- Eliminazione di discrepanze tra statistiche e dati effettivi
- Maggiore affidabilità del pannello amministrativo

## 📝 Note Importanti

1. **Solo deduzioni contano**: Solo le operazioni con `creditsChanged < 0` sono considerate valutazioni effettive
2. **Tempo reale**: Le statistiche si aggiornano automaticamente quando vengono create nuove operazioni di credito
3. **Persistenza**: Un tenant rimane "attivo" finché ha almeno una valutazione utilizzata, indipendentemente da quando è stata effettuata

## 🔗 File Correlati

- `/server/src/models/creditOperation.model.ts` - Modello delle operazioni di credito
- `/server/src/models/tenant.model.ts` - Modello dei tenant
- `/server/src/controllers/tenant.controller.ts` - Controller con la logica delle statistiche
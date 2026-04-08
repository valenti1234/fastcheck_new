# Documento Test GUI Frontend - Duxiter

## Informazioni Generali

- **Applicazione:** Duxiter Fast Check
- **Versione:** 1.5.20
- **Tipo di Test:** GUI/End-to-End Testing
- **Obiettivo:** Simulare le interazioni dell'utente finale
- **Linguaggio:** Italiano

---

## 1. Introduzione ai Test GUI

### 1.1 Scopo del Documento
Questo documento fornisce una guida completa per eseguire test GUI che simulano il comportamento di un utente reale nell'interfaccia frontend di Duxiter.

### 1.2 Tipi di Test GUI
- **Test End-to-End (E2E):** Simulano flussi completi dell'utente
- **Test di Interfaccia Utente:** Verificano elementi visivi e interazioni
- **Test di Usabilità:** Controllano l'esperienza utente
- **Test di Accessibilità:** Verificano la conformità agli standard di accessibilità

---

## 2. Strumenti per Test GUI

### 2.1 Cypress (Raccomandato)
```bash
# Installazione
npm install --save-dev cypress

# Configurazione
npx cypress open
```

### 2.2 Playwright (Alternativa)
```bash
# Installazione
npm install --save-dev @playwright/test

# Inizializzazione
npx playwright install
```

### 2.3 Selenium WebDriver
```bash
# Installazione
npm install --save-dev selenium-webdriver
```

---

## 3. Configurazione Ambiente di Test

### 3.1 Setup Cypress
```javascript
// cypress.config.js
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
```

### 3.2 Struttura Directory Test
```
cypress/
├── e2e/
│   ├── auth/
│   │   ├── login.cy.js
│   │   └── logout.cy.js
│   ├── dashboard/
│   │   ├── navigation.cy.js
│   │   └── widgets.cy.js
│   ├── evaluations/
│   │   ├── create-evaluation.cy.js
│   │   └── view-results.cy.js
│   └── fast-check/
│       ├── fast-check-flow.cy.js
│       └── consolidated-view.cy.js
├── fixtures/
│   ├── users.json
│   └── test-data.json
├── support/
│   ├── commands.js
│   └── e2e.js
└── screenshots/
```

---

## 4. Test di Autenticazione

### 4.1 Test Login Utente
```javascript
// cypress/e2e/auth/login.cy.js
describe('Login Utente', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('dovrebbe permettere login con credenziali valide', () => {
    // Inserimento email
    cy.get('[data-testid="email-input"]')
      .type('utente@test.com');
    
    // Inserimento password
    cy.get('[data-testid="password-input"]')
      .type('password123');
    
    // Click sul pulsante login
    cy.get('[data-testid="login-button"]')
      .click();
    
    // Verifica reindirizzamento alla dashboard
    cy.url().should('include', '/dashboard');
    
    // Verifica presenza elementi dashboard
    cy.get('[data-testid="dashboard-header"]')
      .should('be.visible');
  });

  it('dovrebbe mostrare errore con credenziali non valide', () => {
    cy.get('[data-testid="email-input"]')
      .type('utente@sbagliato.com');
    
    cy.get('[data-testid="password-input"]')
      .type('passwordsbagliata');
    
    cy.get('[data-testid="login-button"]')
      .click();
    
    // Verifica messaggio di errore
    cy.get('[data-testid="error-message"]')
      .should('be.visible')
      .and('contain', 'Credenziali non valide');
  });

  it('dovrebbe validare campi obbligatori', () => {
    cy.get('[data-testid="login-button"]')
      .click();
    
    // Verifica errori di validazione
    cy.get('[data-testid="email-error"]')
      .should('be.visible');
    
    cy.get('[data-testid="password-error"]')
      .should('be.visible');
  });
});
```

### 4.2 Test Logout
```javascript
// cypress/e2e/auth/logout.cy.js
describe('Logout Utente', () => {
  beforeEach(() => {
    // Login automatico prima di ogni test
    cy.login('utente@test.com', 'password123');
  });

  it('dovrebbe permettere logout dalla dashboard', () => {
    // Click sul menu utente
    cy.get('[data-testid="user-menu"]')
      .click();
    
    // Click su logout
    cy.get('[data-testid="logout-button"]')
      .click();
    
    // Verifica reindirizzamento alla pagina login
    cy.url().should('include', '/login');
    
    // Verifica che la sessione sia terminata
    cy.visit('/dashboard');
    cy.url().should('include', '/login');
  });
});
```

---

## 5. Test Navigazione Dashboard

### 5.1 Test Menu Principale
```javascript
// cypress/e2e/dashboard/navigation.cy.js
describe('Navigazione Dashboard', () => {
  beforeEach(() => {
    cy.login('utente@test.com', 'password123');
    cy.visit('/dashboard');
  });

  it('dovrebbe navigare tra le sezioni principali', () => {
    // Test navigazione Fast Check
    cy.get('[data-testid="nav-fast-check"]')
      .click();
    cy.url().should('include', '/fast-check');
    cy.get('[data-testid="fast-check-container"]')
      .should('be.visible');
    
    // Test navigazione Evaluazioni
    cy.get('[data-testid="nav-evaluations"]')
      .click();
    cy.url().should('include', '/evaluations');
    cy.get('[data-testid="evaluations-list"]')
      .should('be.visible');
    
    // Test navigazione Consultas
    cy.get('[data-testid="nav-consultas"]')
      .click();
    cy.url().should('include', '/consultas');
    cy.get('[data-testid="consultas-container"]')
      .should('be.visible');
  });

  it('dovrebbe mostrare breadcrumb corretti', () => {
    cy.get('[data-testid="nav-evaluations"]')
      .click();
    
    cy.get('[data-testid="breadcrumb"]')
      .should('contain', 'Dashboard')
      .and('contain', 'Evaluazioni');
  });
});
```

### 5.2 Test Widget Dashboard
```javascript
// cypress/e2e/dashboard/widgets.cy.js
describe('Widget Dashboard', () => {
  beforeEach(() => {
    cy.login('utente@test.com', 'password123');
    cy.visit('/dashboard');
  });

  it('dovrebbe caricare tutti i widget', () => {
    // Verifica widget statistiche
    cy.get('[data-testid="stats-widget"]')
      .should('be.visible');
    
    // Verifica widget evaluazioni recenti
    cy.get('[data-testid="recent-evaluations-widget"]')
      .should('be.visible');
    
    // Verifica widget grafici
    cy.get('[data-testid="charts-widget"]')
      .should('be.visible');
  });

  it('dovrebbe aggiornare dati in tempo reale', () => {
    // Verifica caricamento iniziale
    cy.get('[data-testid="stats-counter"]')
      .should('not.contain', '0');
    
    // Simula aggiornamento dati
    cy.get('[data-testid="refresh-button"]')
      .click();
    
    // Verifica indicatore di caricamento
    cy.get('[data-testid="loading-spinner"]')
      .should('be.visible');
    
    // Verifica dati aggiornati
    cy.get('[data-testid="loading-spinner"]')
      .should('not.exist');
  });
});
```

---

## 6. Test Fast Check

### 6.1 Test Flusso Completo Fast Check
```javascript
// cypress/e2e/fast-check/fast-check-flow.cy.js
describe('Flusso Fast Check', () => {
  beforeEach(() => {
    cy.login('utente@test.com', 'password123');
    cy.visit('/fast-check');
  });

  it('dovrebbe completare una valutazione Fast Check', () => {
    // Inserimento RUT
    cy.get('[data-testid="rut-input"]')
      .type('12345678-5');
    
    // Selezione tipo valutazione
    cy.get('[data-testid="evaluation-type-select"]')
      .select('Completa');
    
    // Click su avvia valutazione
    cy.get('[data-testid="start-evaluation-button"]')
      .click();
    
    // Verifica caricamento
    cy.get('[data-testid="evaluation-progress"]')
      .should('be.visible');
    
    // Attesa completamento (con timeout)
    cy.get('[data-testid="evaluation-results"]', { timeout: 30000 })
      .should('be.visible');
    
    // Verifica presenza risultati
    cy.get('[data-testid="risk-score"]')
      .should('be.visible')
      .and('not.be.empty');
    
    // Verifica pulsanti azioni
    cy.get('[data-testid="download-pdf-button"]')
      .should('be.visible');
    
    cy.get('[data-testid="save-evaluation-button"]')
      .should('be.visible');
  });

  it('dovrebbe validare formato RUT', () => {
    // Test RUT non valido
    cy.get('[data-testid="rut-input"]')
      .type('123456789');
    
    cy.get('[data-testid="start-evaluation-button"]')
      .click();
    
    // Verifica messaggio errore
    cy.get('[data-testid="rut-error"]')
      .should('be.visible')
      .and('contain', 'Formato RUT non valido');
  });

  it('dovrebbe permettere download PDF risultati', () => {
    // Completa valutazione
    cy.completeFastCheck('12345678-5');
    
    // Click download PDF
    cy.get('[data-testid="download-pdf-button"]')
      .click();
    
    // Verifica download (nota: dipende dalla configurazione browser)
    cy.readFile('cypress/downloads/evaluation-report.pdf')
      .should('exist');
  });
});
```

### 6.2 Test Fast Check Consolidado
```javascript
// cypress/e2e/fast-check/consolidated-view.cy.js
describe('Fast Check Consolidado', () => {
  beforeEach(() => {
    cy.login('utente@test.com', 'password123');
    cy.visit('/fast-check-consolidado');
  });

  it('dovrebbe caricare vista consolidata', () => {
    // Verifica caricamento componenti
    cy.get('[data-testid="consolidated-container"]')
      .should('be.visible');
    
    // Verifica filtri
    cy.get('[data-testid="date-filter"]')
      .should('be.visible');
    
    cy.get('[data-testid="status-filter"]')
      .should('be.visible');
    
    // Verifica tabella risultati
    cy.get('[data-testid="results-table"]')
      .should('be.visible');
  });

  it('dovrebbe filtrare risultati per data', () => {
    // Imposta filtro data
    cy.get('[data-testid="date-from"]')
      .type('2024-01-01');
    
    cy.get('[data-testid="date-to"]')
      .type('2024-12-31');
    
    cy.get('[data-testid="apply-filter-button"]')
      .click();
    
    // Verifica applicazione filtro
    cy.get('[data-testid="results-table"] tbody tr')
      .should('have.length.greaterThan', 0);
  });
});
```

---

## 7. Test Evaluazioni

### 7.1 Test Creazione Evaluazione
```javascript
// cypress/e2e/evaluations/create-evaluation.cy.js
describe('Creazione Evaluazione', () => {
  beforeEach(() => {
    cy.login('utente@test.com', 'password123');
    cy.visit('/evaluations/new');
  });

  it('dovrebbe creare nuova valutazione', () => {
    // Compilazione form
    cy.get('[data-testid="company-name-input"]')
      .type('Azienda Test S.p.A.');
    
    cy.get('[data-testid="rut-input"]')
      .type('12345678-5');
    
    cy.get('[data-testid="evaluation-type-select"]')
      .select('Completa');
    
    cy.get('[data-testid="priority-select"]')
      .select('Alta');
    
    // Upload documenti
    cy.get('[data-testid="file-upload"]')
      .selectFile('cypress/fixtures/test-document.pdf');
    
    // Verifica anteprima file
    cy.get('[data-testid="uploaded-file"]')
      .should('contain', 'test-document.pdf');
    
    // Invio form
    cy.get('[data-testid="submit-evaluation-button"]')
      .click();
    
    // Verifica successo
    cy.get('[data-testid="success-message"]')
      .should('be.visible')
      .and('contain', 'Valutazione creata con successo');
    
    // Verifica reindirizzamento
    cy.url().should('include', '/evaluations/');
  });

  it('dovrebbe validare campi obbligatori', () => {
    cy.get('[data-testid="submit-evaluation-button"]')
      .click();
    
    // Verifica errori validazione
    cy.get('[data-testid="company-name-error"]')
      .should('be.visible');
    
    cy.get('[data-testid="rut-error"]')
      .should('be.visible');
  });
});
```

### 7.2 Test Visualizzazione Risultati
```javascript
// cypress/e2e/evaluations/view-results.cy.js
describe('Visualizzazione Risultati', () => {
  beforeEach(() => {
    cy.login('utente@test.com', 'password123');
    // Naviga a una valutazione esistente
    cy.visit('/evaluations/123');
  });

  it('dovrebbe mostrare dettagli valutazione', () => {
    // Verifica header valutazione
    cy.get('[data-testid="evaluation-header"]')
      .should('be.visible');
    
    // Verifica score di rischio
    cy.get('[data-testid="risk-score"]')
      .should('be.visible')
      .and('not.be.empty');
    
    // Verifica sezioni risultati
    cy.get('[data-testid="financial-section"]')
      .should('be.visible');
    
    cy.get('[data-testid="legal-section"]')
      .should('be.visible');
    
    cy.get('[data-testid="commercial-section"]')
      .should('be.visible');
  });

  it('dovrebbe permettere esportazione risultati', () => {
    // Test export PDF
    cy.get('[data-testid="export-pdf-button"]')
      .click();
    
    cy.get('[data-testid="pdf-options-modal"]')
      .should('be.visible');
    
    cy.get('[data-testid="confirm-export-button"]')
      .click();
    
    // Test export Excel
    cy.get('[data-testid="export-excel-button"]')
      .click();
    
    // Verifica download
    cy.readFile('cypress/downloads/evaluation-results.xlsx')
      .should('exist');
  });
});
```

---

## 8. Test Amministrazione

### 8.1 Test Gestione Utenti
```javascript
// cypress/e2e/admin/user-management.cy.js
describe('Gestione Utenti', () => {
  beforeEach(() => {
    cy.login('admin@test.com', 'adminpass');
    cy.visit('/admin/users');
  });

  it('dovrebbe creare nuovo utente', () => {
    cy.get('[data-testid="add-user-button"]')
      .click();
    
    // Compilazione form utente
    cy.get('[data-testid="user-name-input"]')
      .type('Nuovo Utente');
    
    cy.get('[data-testid="user-email-input"]')
      .type('nuovo@test.com');
    
    cy.get('[data-testid="user-role-select"]')
      .select('Operatore');
    
    cy.get('[data-testid="save-user-button"]')
      .click();
    
    // Verifica creazione
    cy.get('[data-testid="users-table"]')
      .should('contain', 'nuovo@test.com');
  });

  it('dovrebbe modificare utente esistente', () => {
    // Click su modifica primo utente
    cy.get('[data-testid="edit-user-button"]')
      .first()
      .click();
    
    // Modifica ruolo
    cy.get('[data-testid="user-role-select"]')
      .select('Amministratore');
    
    cy.get('[data-testid="save-user-button"]')
      .click();
    
    // Verifica modifica
    cy.get('[data-testid="success-message"]')
      .should('contain', 'Utente aggiornato');
  });
});
```

### 8.2 Test Configurazioni Sistema
```javascript
// cypress/e2e/admin/system-settings.cy.js
describe('Configurazioni Sistema', () => {
  beforeEach(() => {
    cy.login('admin@test.com', 'adminpass');
    cy.visit('/admin/settings');
  });

  it('dovrebbe aggiornare parametri valutazione', () => {
    // Modifica soglie rischio
    cy.get('[data-testid="low-risk-threshold"]')
      .clear()
      .type('30');
    
    cy.get('[data-testid="medium-risk-threshold"]')
      .clear()
      .type('70');
    
    cy.get('[data-testid="save-settings-button"]')
      .click();
    
    // Verifica salvataggio
    cy.get('[data-testid="success-message"]')
      .should('contain', 'Configurazioni salvate');
  });
});
```

---

## 9. Test Responsività

### 9.1 Test Dispositivi Mobili
```javascript
// cypress/e2e/responsive/mobile.cy.js
describe('Test Responsività Mobile', () => {
  beforeEach(() => {
    cy.viewport('iphone-6');
    cy.login('utente@test.com', 'password123');
  });

  it('dovrebbe adattarsi a schermo mobile', () => {
    cy.visit('/dashboard');
    
    // Verifica menu hamburger
    cy.get('[data-testid="mobile-menu-button"]')
      .should('be.visible');
    
    // Test apertura menu
    cy.get('[data-testid="mobile-menu-button"]')
      .click();
    
    cy.get('[data-testid="mobile-nav-menu"]')
      .should('be.visible');
    
    // Test navigazione mobile
    cy.get('[data-testid="mobile-nav-fast-check"]')
      .click();
    
    cy.url().should('include', '/fast-check');
  });

  it('dovrebbe mantenere usabilità su tablet', () => {
    cy.viewport('ipad-2');
    cy.visit('/fast-check');
    
    // Verifica layout tablet
    cy.get('[data-testid="fast-check-form"]')
      .should('be.visible');
    
    // Test input touch-friendly
    cy.get('[data-testid="rut-input"]')
      .should('have.css', 'min-height')
      .and('match', /44px|48px/);
  });
});
```

---

## 10. Test Performance

### 10.1 Test Tempi di Caricamento
```javascript
// cypress/e2e/performance/loading-times.cy.js
describe('Test Performance', () => {
  it('dovrebbe caricare dashboard in tempo accettabile', () => {
    const startTime = Date.now();
    
    cy.login('utente@test.com', 'password123');
    cy.visit('/dashboard');
    
    cy.get('[data-testid="dashboard-content"]')
      .should('be.visible')
      .then(() => {
        const loadTime = Date.now() - startTime;
        expect(loadTime).to.be.lessThan(3000); // 3 secondi max
      });
  });

  it('dovrebbe gestire caricamento asincrono', () => {
    cy.login('utente@test.com', 'password123');
    cy.visit('/evaluations');
    
    // Verifica skeleton loading
    cy.get('[data-testid="loading-skeleton"]')
      .should('be.visible');
    
    // Verifica caricamento dati
    cy.get('[data-testid="evaluations-list"]')
      .should('be.visible');
    
    cy.get('[data-testid="loading-skeleton"]')
      .should('not.exist');
  });
});
```

---

## 11. Test Accessibilità

### 11.1 Test Conformità WCAG
```javascript
// cypress/e2e/accessibility/wcag-compliance.cy.js
describe('Test Accessibilità', () => {
  beforeEach(() => {
    cy.login('utente@test.com', 'password123');
  });

  it('dovrebbe essere navigabile con tastiera', () => {
    cy.visit('/dashboard');
    
    // Test navigazione tab
    cy.get('body').tab();
    cy.focused().should('have.attr', 'data-testid', 'skip-link');
    
    // Test navigazione menu
    cy.get('[data-testid="nav-fast-check"]')
      .focus()
      .type('{enter}');
    
    cy.url().should('include', '/fast-check');
  });

  it('dovrebbe avere attributi ARIA corretti', () => {
    cy.visit('/fast-check');
    
    // Verifica labels
    cy.get('[data-testid="rut-input"]')
      .should('have.attr', 'aria-label');
    
    // Verifica ruoli
    cy.get('[data-testid="evaluation-form"]')
      .should('have.attr', 'role', 'form');
    
    // Verifica stati
    cy.get('[data-testid="submit-button"]')
      .should('have.attr', 'aria-disabled', 'false');
  });

  it('dovrebbe supportare screen reader', () => {
    cy.visit('/evaluations/123');
    
    // Verifica heading structure
    cy.get('h1').should('exist');
    cy.get('h2').should('exist');
    
    // Verifica descrizioni
    cy.get('[data-testid="risk-score"]')
      .should('have.attr', 'aria-describedby');
  });
});
```

---

## 12. Comandi Personalizzati Cypress

### 12.1 Comandi di Supporto
```javascript
// cypress/support/commands.js

// Comando login personalizzato
Cypress.Commands.add('login', (email, password) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('[data-testid="email-input"]').type(email);
    cy.get('[data-testid="password-input"]').type(password);
    cy.get('[data-testid="login-button"]').click();
    cy.url().should('include', '/dashboard');
  });
});

// Comando Fast Check completo
Cypress.Commands.add('completeFastCheck', (rut) => {
  cy.get('[data-testid="rut-input"]').type(rut);
  cy.get('[data-testid="evaluation-type-select"]').select('Completa');
  cy.get('[data-testid="start-evaluation-button"]').click();
  cy.get('[data-testid="evaluation-results"]', { timeout: 30000 })
    .should('be.visible');
});

// Comando attesa caricamento
Cypress.Commands.add('waitForLoad', () => {
  cy.get('[data-testid="loading-spinner"]').should('not.exist');
  cy.get('[data-testid="page-content"]').should('be.visible');
});

// Comando verifica toast
Cypress.Commands.add('checkToast', (message, type = 'success') => {
  cy.get(`[data-testid="toast-${type}"]`)
    .should('be.visible')
    .and('contain', message);
});
```

---

## 13. Dati di Test

### 13.1 Fixture Utenti
```json
// cypress/fixtures/users.json
{
  "admin": {
    "email": "admin@test.com",
    "password": "adminpass",
    "role": "administrator"
  },
  "operator": {
    "email": "operatore@test.com",
    "password": "operatorpass",
    "role": "operator"
  },
  "viewer": {
    "email": "visualizzatore@test.com",
    "password": "viewerpass",
    "role": "viewer"
  }
}
```

### 13.2 Fixture Dati Test
```json
// cypress/fixtures/test-data.json
{
  "companies": [
    {
      "name": "Azienda Test S.p.A.",
      "rut": "12345678-5",
      "type": "SPA"
    },
    {
      "name": "Società di Prova Ltda.",
      "rut": "87654321-0",
      "type": "LTDA"
    }
  ],
  "evaluations": [
    {
      "id": "eval-001",
      "companyRut": "12345678-5",
      "status": "completed",
      "riskScore": 75
    }
  ]
}
```

---

## 14. Esecuzione Test

### 14.1 Comandi di Esecuzione
```bash
# Esecuzione interattiva
npx cypress open

# Esecuzione headless
npx cypress run

# Esecuzione test specifici
npx cypress run --spec "cypress/e2e/auth/*.cy.js"

# Esecuzione con browser specifico
npx cypress run --browser chrome

# Esecuzione con video
npx cypress run --record --key=your-key
```

### 14.2 Script Package.json
```json
{
  "scripts": {
    "test:e2e": "cypress run",
    "test:e2e:open": "cypress open",
    "test:e2e:chrome": "cypress run --browser chrome",
    "test:e2e:auth": "cypress run --spec 'cypress/e2e/auth/*.cy.js'",
    "test:e2e:ci": "cypress run --record --parallel"
  }
}
```

---

## 15. Reporting e Monitoraggio

### 15.1 Report HTML
```javascript
// cypress.config.js
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    reporter: 'mochawesome',
    reporterOptions: {
      reportDir: 'cypress/reports',
      overwrite: false,
      html: true,
      json: true
    }
  }
});
```

### 15.2 Integrazione CI/CD
```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Start application
      run: |
        npm run build
        npm run preview &
        npx wait-on http://localhost:4173
    
    - name: Run E2E tests
      run: npm run test:e2e:ci
    
    - name: Upload screenshots
      uses: actions/upload-artifact@v3
      if: failure()
      with:
        name: cypress-screenshots
        path: cypress/screenshots
```

---

## 16. Best Practices

### 16.1 Principi Generali
- **Stabilità:** Test deterministici e ripetibili
- **Velocità:** Ottimizzazione tempi di esecuzione
- **Manutenibilità:** Codice test pulito e organizzato
- **Copertura:** Test scenari critici dell'utente

### 16.2 Convenzioni
- Usare `data-testid` per selettori stabili
- Evitare dipendenze tra test
- Implementare wait espliciti
- Gestire stati dell'applicazione

### 16.3 Troubleshooting
- **Test flaky:** Aumentare timeout, migliorare wait
- **Selettori rotti:** Usare attributi data-testid
- **Performance:** Ottimizzare setup e teardown
- **Debugging:** Usare cy.debug() e screenshot

---

**Nota:** Questo documento fornisce una guida completa per testare l'interfaccia utente simulando comportamenti reali. Aggiornare regolarmente in base all'evoluzione dell'applicazione.

**Ultima revisione:** Dicembre 2024 - Versione 1.5.20
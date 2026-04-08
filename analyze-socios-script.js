import axios from 'axios';
import fs from 'fs';

// Configurazione
const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4041/api';
const LOGIN_CREDENTIALS = {
  email: process.env.TEST_USER_EMAIL || 'edeik@azurian.com',
  password: process.env.TEST_USER_PASSWORD || 'Emilio3465#'
};
const TARGET_RUT = '89907300-2';

class SociosAnalyzer {
  constructor() {
    this.authToken = null;
    this.axiosInstance = null;
  }

  // Effettua il login e ottiene il token di autenticazione
  async login() {
    try {
      console.log('🔐 Effettuando login...');
      const response = await axios.post(`${BASE_URL}/auth/login`, LOGIN_CREDENTIALS);
      
      if (response.data.token) {
        this.authToken = response.data.token;
        this.axiosInstance = axios.create({
          baseURL: BASE_URL,
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('✅ Login effettuato con successo');
        return true;
      } else {
        throw new Error('Token non ricevuto dal server');
      }
    } catch (error) {
      console.error('❌ Errore durante il login:', error.response?.data || error.message);
      return false;
    }
  }

  // Cerca i dati dell'azienda per RUT usando Sheriff Service
  async searchCompanyData(rut) {
    try {
      console.log(`🔍 Cercando dati per RUT: ${rut} tramite Sheriff Service`);
      const response = await this.axiosInstance.post(`/rut/lookup`, { rut });
      return response.data;
    } catch (error) {
      console.error('❌ Errore nella ricerca dei dati:', error.response?.data || error.message);
      return null;
    }
  }

  // Analizza i dati dei soci utilizzando l'AI
  async analyzeSociosWithAI(companyData) {
    try {
      console.log('🤖 Analizzando i dati dei soci con AI...');
      
      // Prepara i dati per l'analisi AI
      const analysisData = {
        rut: TARGET_RUT,
        razonSocial: companyData.details?.razonSocial || 'N/A',
        mallaSocietariaData: companyData.mallaSocietariaData,
        officialDiaryData: companyData.officialDiaryData,
        companyGeneralInfo: companyData.companyGeneralInfo
      };

      // Richiesta di analisi AI
      const aiPrompt = `
Analizza i seguenti dati societari e identifica chiaramente i soci dell'azienda:

RUT: ${analysisData.rut}
Ragione Sociale: ${analysisData.razonSocial}

Dati Malla Societaria:
${JSON.stringify(analysisData.mallaSocietariaData, null, 2)}

Dati Diario Ufficiale:
${JSON.stringify(analysisData.officialDiaryData, null, 2)}

Informazioni Generali Azienda:
${JSON.stringify(analysisData.companyGeneralInfo, null, 2)}

Per favore:
1. Identifica tutti i soci attuali dell'azienda
2. Fornisci nome, RUT e ruolo di ciascun socio
3. Indica la data di costituzione dell'azienda
4. Segnala eventuali modifiche societarie rilevanti
5. Identifica gli amministratori attuali

Rispondi in italiano con un'analisi strutturata e chiara.`;

      const aiResponse = await this.axiosInstance.post('/ai/analyze', {
        prompt: aiPrompt,
        data: analysisData
      });

      return aiResponse.data;
    } catch (error) {
      console.error('❌ Errore nell\'analisi AI:', error.response?.data || error.message);
      return null;
    }
  }

  // Analisi manuale dei dati dei soci
  analyzeManually(companyData) {
    console.log('📊 Analisi manuale dei dati dei soci...');
    console.log('🔍 Struttura dati ricevuti:', Object.keys(companyData));
    
    const analysis = {
      razonSocial: companyData.details?.razonSocial || 'N/A',
      rut: TARGET_RUT,
      socios: [],
      administradores: [],
      fechaConstitucion: null,
      modificacionesSocietarie: []
    };

    // Analizza mallaSocietariaData
    const mallaSocietariaData = companyData.sheriffLogData?.mallaSocietariaData || companyData.mallaSocietariaData;
    if (mallaSocietariaData) {
      console.log('🔍 Analizzando mallaSocietariaData...');
      
      // Cerca nella sezione empresaEnUnDia
      if (mallaSocietariaData.empresaEnUnDia && mallaSocietariaData.empresaEnUnDia.length > 0) {
        const empresaData = mallaSocietariaData.empresaEnUnDia;
        
        // Prendi i dati più recenti (ultimo elemento)
        const latestData = empresaData[empresaData.length - 1];
        
        if (latestData.socios) {
          analysis.socios = latestData.socios.map(socio => ({
            nombre: socio.socio || socio.nombre,
            rut: socio.rut,
            domicilio: socio.domicilio || 'N/A',
            fuente: 'empresaEnUnDia'
          }));
        }
        
        if (latestData.administradores) {
          analysis.administradores = latestData.administradores.map(admin => ({
            nombre: admin.administrador || admin.nombre,
            rut: admin.rut
          }));
        }
        
        // Cerca la data di costituzione
        for (const empresa of empresaData) {
          if (empresa.actuacion === 'CONSTITUCIÓN') {
            analysis.fechaConstitucion = empresa.fecha;
            break;
          }
        }
        
        // Registra tutte le modifiche societarie
        analysis.modificacionesSocietarie = empresaData.map(empresa => ({
          fecha: empresa.fecha,
          actuacion: empresa.actuacion,
          numeroAtencion: empresa.numeroAtencion
        }));
      }
      
      // Analizza diarioOficial se disponibile
      if (mallaSocietariaData.diarioOficial && mallaSocietariaData.diarioOficial.length > 0) {
        console.log('📰 Analizzando diarioOficial...');
        console.log(`📊 Numero di elementi diarioOficial: ${mallaSocietariaData.diarioOficial.length}`);
        
        for (const entry of mallaSocietariaData.diarioOficial) {
          console.log(`🔍 Analizzando diarioOficial entry...`);
          console.log(`   📅 Data: ${entry.fecha || 'N/A'}`);
          console.log(`   👥 Numero soci in questa entry: ${entry.socios?.length || 0}`);
          
          if (entry.seccion === 'CONSTITUCIÓN' && !analysis.fechaConstitucion) {
            analysis.fechaConstitucion = entry.fecha;
          }
          
          // Analizza i soci dall'array socios di ogni entry del diarioOficial
          if (entry.socios && Array.isArray(entry.socios)) {
            entry.socios.forEach((socio, socioIndex) => {
              console.log(`     👤 Socio ${socioIndex + 1}: ${socio.nombre || socio.name} (${socio.rut})`);
              if (socio.rut) {
                // Evita duplicati basandosi sul RUT
                const existeSocio = analysis.socios.find(s => s.rut && socio.rut && s.rut === socio.rut);
                if (!existeSocio) {
                  console.log(`       ✅ Nuovo socio aggiunto da diarioOficial`);
                  analysis.socios.push({
                    nombre: socio.nombre || socio.name,
                    rut: socio.rut,
                    domicilio: socio.domicilio || 'N/A',
                    fuente: `diarioOficial-${entry.fecha || 'fecha_no_disponible'}`
                  });
                } else {
                  console.log(`       ⚠️ Socio già esistente, saltato`);
                }
              }
            });
          } else {
            console.log(`   ❌ Nessun array socios trovato in questa entry`);
          }
        }
      } else {
        console.log(`❌ Nessun diarioOficial trovato nei dati mallaSocietariaData`);
      }
    }

    // Analizza officialDiaryData
    if (companyData.officialDiaryData && companyData.officialDiaryData.data) {
      console.log('📋 Analizzando officialDiaryData...');
      
      for (const entry of companyData.officialDiaryData.data) {
        if (entry.socios && entry.socios.length > 0) {
          // Aggiungi soci da officialDiaryData se non già presenti
          for (const socio of entry.socios) {
            const exists = analysis.socios.find(s => s.rut === socio.rut);
            if (!exists) {
              analysis.socios.push({
                nombre: socio.nombre,
                rut: socio.rut,
                domicilio: socio.domicilio || 'N/A'
              });
            }
          }
        }
      }
    }

    // Analizza companyGeneralInfo
    if (companyData.companyGeneralInfo) {
      console.log('🏢 Analizzando companyGeneralInfo...');
      
      if (companyData.companyGeneralInfo.socios && companyData.companyGeneralInfo.socios.length > 0) {
        // Verifica e aggiorna i dati dei soci
        for (const socio of companyData.companyGeneralInfo.socios) {
          const existing = analysis.socios.find(s => s.rut === socio.rut);
          if (!existing) {
            analysis.socios.push({
              nombre: socio.socio || socio.nombre,
              rut: socio.rut,
              domicilio: socio.domicilio || 'N/A',
              fuente: 'companyGeneralInfo'
            });
          }
        }
      }
      
      if (companyData.companyGeneralInfo.administradores && companyData.companyGeneralInfo.administradores.length > 0) {
        for (const admin of companyData.companyGeneralInfo.administradores) {
          const existing = analysis.administradores.find(a => a.rut === admin.rut);
          if (!existing) {
            analysis.administradores.push({
              nombre: admin.administrador || admin.nombre || admin.name,
              rut: admin.rut
            });
          }
        }
      }
      
      if (companyData.companyGeneralInfo.fechaDeConstitucion && !analysis.fechaConstitucion) {
        analysis.fechaConstitucion = companyData.companyGeneralInfo.fechaDeConstitucion;
      }
    }

    return analysis;
  }

  // Genera un report dettagliato
  generateReport(manualAnalysis, aiAnalysis = null) {
    const report = {
      timestamp: new Date().toISOString(),
      rut: TARGET_RUT,
      razonSocial: manualAnalysis.razonSocial,
      analisiManuale: manualAnalysis,
      analisiAI: aiAnalysis,
      riassunto: {
        numeroSoci: manualAnalysis.socios.length,
        numeroAmministratori: manualAnalysis.administradores.length,
        dataCostituzione: manualAnalysis.fechaConstitucion,
        modificheSocietarie: manualAnalysis.modificacionesSocietarie.length
      }
    };

    return report;
  }

  // Salva il report su file
  saveReport(report) {
    const filename = `socios-analysis-${TARGET_RUT.replace('-', '')}-${Date.now()}.json`;
    const filepath = `/root/duxiter/${filename}`;
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`📄 Report salvato in: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error('❌ Errore nel salvare il report:', error.message);
      return null;
    }
  }

  // Stampa un riassunto leggibile
  printSummary(analysis) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ANALISI SOCI - RIASSUNTO');
    console.log('='.repeat(60));
    console.log(`🏢 Azienda: ${analysis.razonSocial}`);
    console.log(`🆔 RUT: ${TARGET_RUT}`);
    console.log(`📅 Data Costituzione: ${analysis.fechaConstitucion || 'Non disponibile'}`);
    console.log(`\n👥 SOCI (${analysis.socios.length}):`);
    
    if (analysis.socios.length > 0) {
      analysis.socios.forEach((socio, index) => {
        console.log(`   ${index + 1}. ${socio.nombre}`);
        console.log(`      RUT: ${socio.rut}`);
        console.log(`      Domicilio: ${socio.domicilio}`);
        console.log(`      Fonte: ${socio.fuente}`);
        console.log('');
      });
    } else {
      console.log('   Nessun socio trovato nei dati disponibili.');
    }
    
    console.log(`\n👨‍💼 AMMINISTRATORI (${analysis.administradores.length}):`);
    
    if (analysis.administradores.length > 0) {
      analysis.administradores.forEach((admin, index) => {
        console.log(`   ${index + 1}. ${admin.nombre}`);
        console.log(`      RUT: ${admin.rut}`);
        console.log('');
      });
    } else {
      console.log('   Nessun amministratore trovato nei dati disponibili.');
    }
    
    if (analysis.modificacionesSocietarie.length > 0) {
      console.log(`\n📋 MODIFICHE SOCIETARIE (${analysis.modificacionesSocietarie.length}):`);
      analysis.modificacionesSocietarie.forEach((mod, index) => {
        console.log(`   ${index + 1}. ${mod.actuacion} - ${mod.fecha}`);
        console.log(`      N° Attenzione: ${mod.numeroAtencion}`);
        console.log('');
      });
    }
    
    console.log('='.repeat(60));
  }

  // Metodo principale per eseguire l'analisi completa
  async run() {
    console.log('🚀 Avvio analisi soci per RUT:', TARGET_RUT);
    console.log('='.repeat(60));
    
    // 1. Effettua il login
    const loginSuccess = await this.login();
    if (!loginSuccess) {
      console.error('❌ Impossibile procedere senza autenticazione');
      return;
    }
    
    // 2. Cerca i dati dell'azienda
    const companyData = await this.searchCompanyData(TARGET_RUT);
    if (!companyData) {
      console.error('❌ Impossibile ottenere i dati dell\'azienda');
      return;
    }
    
    console.log('✅ Dati azienda ottenuti con successo');
    
    // 3. Analisi manuale
    const manualAnalysis = this.analyzeManually(companyData);
    
    // 4. Tentativo di analisi AI (opzionale)
    let aiAnalysis = null;
    try {
      console.log('🤖 Tentativo di analisi AI...');
      const aiResponse = await this.axiosInstance.post('/ai/analyze', {
        data: {
          companyName: companyData.companyGeneralInfo?.companyName || 'N/A',
          socios: manualAnalysis.socios,
          administrators: manualAnalysis.administradores,
          constitutionDate: manualAnalysis.fechaConstitucion,
          corporateModifications: manualAnalysis.modificacionesSocietarie,
          totalSociosFound: manualAnalysis.socios.length,
          sociosSources: [...new Set(manualAnalysis.socios.map(s => s.fuente))]
        },
        analysisType: 'socios',
        rut: TARGET_RUT
      });

      if (aiResponse.data) {
        aiAnalysis = aiResponse.data.analysis || 'Analisi AI completata ma senza risultati.';
        console.log('✅ Analisi AI completata con successo');
      } else {
        console.log('❌ Errore nell\'analisi AI: Nessun dato ricevuto');
        aiAnalysis = 'Errore nell\'analisi AI: Nessun dato ricevuto';
      }
    } catch (error) {
      console.log('⚠️  Analisi AI non disponibile, continuando con analisi manuale');
      aiAnalysis = `Errore nella chiamata AI: ${error.message}`;
    }
    
    // 5. Genera e salva il report
    const report = this.generateReport(manualAnalysis, aiAnalysis);
    const reportPath = this.saveReport(report);
    
    // 6. Stampa il riassunto
    this.printSummary(manualAnalysis);
    
    if (reportPath) {
      console.log(`\n📄 Report completo salvato in: ${reportPath}`);
    }
    
    console.log('\n✅ Analisi completata con successo!');
  }
}

// Esecuzione dello script
// Esecuzione diretta dello script
const analyzer = new SociosAnalyzer();
analyzer.run().catch(error => {
  console.error('❌ Errore durante l\'esecuzione:', error);
  process.exit(1);
});

export default SociosAnalyzer;
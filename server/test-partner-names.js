const { CompanyAnalysisService } = require('./src/services/companyAnalysisService');

// Test data con nomi dei partner
const testData = {
  mallaSocietariaData: {
    empresaEnUnDia: [
      {
        rut: '12345678-9',
        nome: 'Juan Perez',
        domicilio: 'Santiago, Chile'
      },
      {
        rut: '98765432-1',
        name: 'Maria Rodriguez',
        domicilio: 'Valparaiso, Chile'
      },
      {
        rut: '11111111-1',
        nombre: 'Carlos Lopez',
        domicilio: 'Concepcion, Chile'
      }
    ],
    diarioOficial: [
      {
        rut: '22222222-2',
        nome: 'Ana Garcia',
        domicilio: 'La Serena, Chile'
      },
      {
        rut: '33333333-3',
        name: 'Pedro Martinez',
        domicilio: 'Temuco, Chile'
      },
      {
        rut: '44444444-4',
        nombre: 'Sofia Gonzalez',
        domicilio: 'Antofagasta, Chile'
      }
    ]
  },
  summaryData: {
    data: {
      socios: []
    }
  }
};

console.log('🧪 Testing partner name extraction...');

const service = new CompanyAnalysisService();
const result = service.analyzeManually(testData);

console.log('\n📊 Results:');
console.log('empresaEnUnDia partners:', JSON.stringify(result.analysisResults.empresaEnUnDia.partners, null, 2));
console.log('diarioOficial partners:', JSON.stringify(result.analysisResults.diarioOficial.partners, null, 2));

console.log('\n✅ Test completed!');
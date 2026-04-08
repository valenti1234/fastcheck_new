import mongoose from 'mongoose';
import { PromptConfiguration } from '../models/PromptConfiguration';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const createDefaultPrompts = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.VITE_MONGODB_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Default prompts
    const defaultPrompts = [
      {
        name: 'Búsqueda de Datos - Análisis de Riesgo',
        description: 'Prompt para analizar datos de empresas y determinar niveles de riesgo',
        promptTemplate: `Analiza los siguientes datos de la empresa y proporciona una evaluación de riesgo:

{data}

Por favor, evalúa:
1. Riesgo financiero
2. Riesgo operacional
3. Riesgo de cumplimiento
4. Recomendaciones

Proporciona una respuesta estructurada y detallada.`,
        category: 'seekData',
        isActive: true,
        createdBy: 'system',
        updatedBy: 'system'
      },
      {
        name: 'Análisis Sheriff - Evaluación Legal',
        description: 'Prompt para analizar datos legales y antecedentes judiciales',
        promptTemplate: `Analiza los siguientes datos legales y antecedentes:

{data}

Evalúa:
1. Antecedentes penales relevantes
2. Procesos judiciales en curso
3. Sanciones administrativas
4. Nivel de riesgo legal
5. Recomendaciones de mitigación

Proporciona un análisis detallado y conclusiones.`,
        category: 'analyzeSheriffData',
        isActive: true,
        createdBy: 'system',
        updatedBy: 'system'
      },
      {
        name: 'Parámetros de Evaluación - Análisis Integral',
        description: 'Prompt para evaluación integral de parámetros empresariales',
        promptTemplate: `Realiza una evaluación integral basada en los siguientes parámetros:

{data}

Analiza:

## Evaluación General
- Situación financiera actual
- Estabilidad operacional
- Cumplimiento normativo
- Reputación empresarial

## Principales Riesgos Identificados
- Riesgos financieros
- Riesgos operacionales
- Riesgos legales y de cumplimiento
- Riesgos reputacionales

## Recomendaciones
- Acciones inmediatas
- Medidas de mitigación
- Monitoreo continuo
- Decisión de aprobación/rechazo

Proporciona una evaluación detallada y fundamentada.`,
        category: 'analyzeEvaluationParameters',
        isActive: true,
        createdBy: 'system',
        updatedBy: 'system'
      }
    ];

    // Create prompts
    for (const promptData of defaultPrompts) {
      const existingPrompt = await PromptConfiguration.findOne({
        category: promptData.category,
        isActive: true
      });

      if (!existingPrompt) {
        const prompt = new PromptConfiguration(promptData);
        await prompt.save();
        console.log(`Created default prompt for category: ${promptData.category}`);
      } else {
        console.log(`Active prompt already exists for category: ${promptData.category}`);
      }
    }

    console.log('Default prompts creation completed');
  } catch (error) {
    console.error('Error creating default prompts:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
createDefaultPrompts()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
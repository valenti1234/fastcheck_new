import OpenAI from 'openai';
import { ISheriffDataLog } from '../models/SheriffDataLog';
import { PromptConfiguration } from '../models/PromptConfiguration';
import { AIOperationLog } from '../models/AIOperationLog';
import { ConsultaHistory } from '../models/ConsultaHistory';
// import dotenv from 'dotenv'; // Removed - should be loaded once in index.ts

// dotenv.config({ path: require('path').resolve(__dirname, '../../.env') }); // Removed problematic line

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIService {
  private static instance: OpenAIService;

  private constructor() {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY is not set. OpenAIService will not function.');
    }
  }

  public static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }
    return OpenAIService.instance;
  }

  private async logAIOperation(
    operationType: 'seekData' | 'analyzeSheriffData' | 'analyzeEvaluationParameters',
    promptUsed: string,
    inputData: any,
    aiResponse: string,
    aiModel: string,
    temperature: number,
    maxTokens: number,
    executionTime: number,
    success: boolean,
    promptConfigId?: string,
    rut?: string,
    tenantId?: string,
    userId?: string,
    errorMessage?: string,
    tokensUsed?: { prompt: number; completion: number; total: number }
  ): Promise<void> {
    try {
      const logEntry = new AIOperationLog({
        rut,
        tenantId,
        operationType,
        promptUsed,
        promptConfigId,
        inputData,
        aiResponse,
        aiModel,
        temperature,
        maxTokens,
        tokensUsed,
        executionTime,
        success,
        errorMessage,
        userId
      });

      await logEntry.save();
      console.log(`[OpenAIService] AI operation logged: ${operationType} - Success: ${success}`);
    } catch (error) {
      console.error('[OpenAIService] Failed to log AI operation:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }

  private async canUseOpenAI(): Promise<boolean> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('[OpenAIService.canUseOpenAI] Missing OPENAI_API_KEY');
        return false;
      }
      // Removed backoff window check
      const now = Date.now();
      const windowMs = 5 * 60 * 1000;
      const lastChecked = (this as any)._openAICreditStatusCheckedAt as number | undefined;
      const lastUsable = (this as any)._openAICreditUsable as boolean | undefined;
      if (lastChecked && typeof lastUsable !== 'undefined' && now - lastChecked < windowMs) {
        return lastUsable;
      }
      try {
        await openai.models.list();
        (this as any)._openAICreditUsable = true;
        (this as any)._openAICreditStatusCheckedAt = now;
        return true;
      } catch (err: any) {
        const status = err?.status;
        const code = err?.code;
        const type = err?.type;
        // Removed backoff setting on 429/insufficient_quota
        (this as any)._openAICreditUsable = false;
        (this as any)._openAICreditStatusCheckedAt = now;
        console.warn('[OpenAIService.canUseOpenAI] Models endpoint check failed:', err?.message || err, { status, code, type });
        return false;
      }
    } catch (err) {
      console.warn('[OpenAIService.canUseOpenAI] Unexpected error:', err);
      return false;
    }
  }

  public async seekData(sheriffLog: ISheriffDataLog, tenantId?: string, userId?: string): Promise<string> {
    const startTime = Date.now();

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured.');
    }

    const dataString = JSON.stringify({ sheriffLog }, null, 2);
    const maxDataLength = Number(process.env.OPENAI_MAX_DATA_LENGTH) || 10000;
    const truncatedDataString = dataString.length > maxDataLength
      ? dataString.substring(0, maxDataLength) + "\n... (data truncated)"
      : dataString;

    // Obtener el prompt configurado para seekData
    const promptConfig = await PromptConfiguration.findOne({
      category: 'seekData',
      isActive: true
    });

    // Usar prompt por defecto si no hay configuración
    const defaultPrompt = `
Por favor, analiza los siguientes datos JSON, y busca fecha de constitucion inicio de actividades y rapresentante legal, lista socios y administratores si no la encuntra en empresaenundada, busca en campo "diarioOficial"
Enfócate en proporcionar información útil y procesable. Sé objetivo y basa tus comentarios únicamente en los datos proporcionados.
Datos:
\`\`\`json
${truncatedDataString}
\`\`\`
Resumen en JSON
`;

    const prompt = promptConfig ?
      promptConfig.promptTemplate.replace('{{data}}', truncatedDataString) :
      defaultPrompt;

    const aiModel = process.env.OPENAI_MODEL_ANALYSIS || 'gpt-4o';
    const temperature = Number(process.env.OPENAI_TEMPERATURE) || 0.3;
    const maxTokens = Number(process.env.OPENAI_MAX_TOKENS) || 1000;

    try {
      console.log(`[OpenAIService] Starting seekData operation for RUT: ${sheriffLog.rut}`);

      const completion = await openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      });

      const markdownOutput = completion.choices[0]?.message?.content || 'No summary generated by AI.';
      const executionTime = Date.now() - startTime;

      // Extract token usage if available
      const tokensUsed = completion.usage ? {
        prompt: completion.usage.prompt_tokens,
        completion: completion.usage.completion_tokens,
        total: completion.usage.total_tokens
      } : undefined;

      // Log the AI operation
      await this.logAIOperation(
        'seekData',
        prompt,
        { sheriffLog, truncatedDataString },
        markdownOutput,
        aiModel,
        temperature,
        maxTokens,
        executionTime,
        true,
        promptConfig?._id?.toString(),
        sheriffLog.rut,
        tenantId,
        userId,
        undefined,
        tokensUsed
      );

      console.log(`[OpenAIService] seekData completed successfully in ${executionTime}ms`);
      return markdownOutput;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = `Failed to analyze data with OpenAI: ${error instanceof Error ? error.message : String(error)}`;

      console.error('Error calling OpenAI API:', error);

      // Log the failed AI operation
      await this.logAIOperation(
        'seekData',
        prompt,
        { sheriffLog, truncatedDataString },
        '',
        aiModel,
        temperature,
        maxTokens,
        executionTime,
        false,
        promptConfig?._id?.toString(),
        sheriffLog.rut,
        tenantId,
        userId,
        errorMessage
      );

      return errorMessage;
    }
  }

  public async analyzeSheriffData(
    sheriffLog: ISheriffDataLog,
    riskAssessment: { level: string },
    details: any,
    tenantId?: string,
    userId?: string
  ): Promise<string> {
    const startTime = Date.now();

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured.');
    }

    const dataString = JSON.stringify({ sheriffLog, details, riskAssessment }, null, 2);
    const maxDataLength = Number(process.env.OPENAI_MAX_DATA_LENGTH) || 10000;
    const truncatedDataString = dataString.length > maxDataLength
      ? dataString.substring(0, maxDataLength) + "\n... (data truncated)"
      : dataString;

    // Obtener el prompt configurado para analyzeSheriffData
    const promptConfig = await PromptConfiguration.findOne({
      category: 'analyzeSheriffData',
      isActive: true
    });

    // Usar prompt por defecto si no hay configuración
    const defaultPrompt = `
Por favor, analiza los siguientes datos JSON, que representan un registro de información obtenida para la empresa "${details.razonSocial}" con RUT ${sheriffLog.rut}.
Los datos incluyen varios detalles de diferentes fuentes, un nivel de riesgo calculado y detalles específicos.
Genera un resumen conciso en formato Markdown, en ESPAÑOL DE CHILE.
El resumen debe incluir:
1.  Una tabla de resumen de riesgos tipo semáforo (con emojis 🟢, 🟡, 🔴) para las siguientes categorías: 'Historial Legal', 'Cumplimiento Normativo', 'Salud Financiera'.
2.  Una evaluación general del estado de la empresa, considerando el 'riskAssessment.level'.
3.  Puntos positivos clave.
4.  Puntos negativos clave o áreas de preocupación, usando la información de 'details' y los datos del sheriff.
5.  Menciona el nivel de riesgo ('riskAssessment.level') y explica brevemente por qué se asignó, usando 'details'.

Enfócate en proporcionar información útil y procesable. Sé objetivo y basa tus comentarios únicamente en los datos proporcionados.

Datos:
\`\`\`json
${truncatedDataString}
\`\`\`

Resumen en Markdown (en español de Chile):
`;

    const prompt = promptConfig ?
      promptConfig.promptTemplate
        .replace('{{sheriffLog}}', JSON.stringify(sheriffLog, null, 2))
        .replace('{{details}}', JSON.stringify(details, null, 2))
        .replace('{{riskAssessment}}', JSON.stringify(riskAssessment, null, 2))
        .replace('{{truncatedDataString}}', truncatedDataString) :
      defaultPrompt;

    const aiModel = process.env.OPENAI_MODEL_SUMMARY || 'gpt-3.5-turbo';
    const temperature = Number(process.env.OPENAI_TEMPERATURE) || 0.3;
    const maxTokens = Number(process.env.OPENAI_MAX_TOKENS) || 1000;

    try {
      console.log(`[OpenAIService] Starting analyzeSheriffData operation for RUT: ${sheriffLog.rut}`);

      const completion = await openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      });

      const markdownOutput = completion.choices[0]?.message?.content || 'No summary generated by AI.';
      const executionTime = Date.now() - startTime;

      // Extract token usage if available
      const tokensUsed = completion.usage ? {
        prompt: completion.usage.prompt_tokens,
        completion: completion.usage.completion_tokens,
        total: completion.usage.total_tokens
      } : undefined;

      // Log the AI operation
      await this.logAIOperation(
        'analyzeSheriffData',
        prompt,
        { sheriffLog, details, riskAssessment, truncatedDataString },
        markdownOutput,
        aiModel,
        temperature,
        maxTokens,
        executionTime,
        true,
        promptConfig?._id?.toString(),
        sheriffLog.rut,
        tenantId,
        userId,
        undefined,
        tokensUsed
      );

      console.log(`[OpenAIService] analyzeSheriffData completed successfully in ${executionTime}ms`);
      return markdownOutput;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = `Failed to analyze data with OpenAI: ${error instanceof Error ? error.message : String(error)}`;

      console.error('Error calling OpenAI API:', error);

      // Log the failed AI operation
      await this.logAIOperation(
        'analyzeSheriffData',
        prompt,
        { sheriffLog, details, riskAssessment, truncatedDataString },
        '',
        aiModel,
        temperature,
        maxTokens,
        executionTime,
        false,
        promptConfig?._id?.toString(),
        sheriffLog.rut,
        tenantId,
        userId,
        errorMessage
      );

      return errorMessage;
    }
  }

  public async analyzeEvaluationParameters(analysisData: any, tenantId?: string, userId?: string): Promise<string> {
    const startTime = Date.now();

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured.');
    }

    // Obtener el prompt configurado para analyzeEvaluationParameters
    const promptConfig = await PromptConfiguration.findOne({
      category: 'analyzeEvaluationParameters',
      isActive: true
    });

    // Usar prompt por defecto si no hay configuración
    const defaultPrompt = `
Como experto en análisis de riesgo empresarial, proporciona un análisis CONCISO y DIRECTO de la empresa ${analysisData.companyName} (RUT: ${analysisData.rut}).

📊 **Datos clave:**
- Nivel de Riesgo: ${analysisData.riskLevel} ${analysisData.semaphore}
- Problemas: ${analysisData.detectedIssues}/${analysisData.totalParameters} (🔴${analysisData.criticalIssues} críticos, 🟡${analysisData.significantIssues} significativos)

Proporciona un análisis en MÁXIMO 3 párrafos cortos:

## 🔍 **Evaluación General**
Resumen del estado de riesgo en 2-3 líneas

## ⚠️ **Principales Riesgos**
Lista máximo 3 puntos críticos con emojis

## 💡 **Recomendaciones**
Máximo 2 acciones prioritarias

Sé CONCISO, usa emojis relevantes (🔴🟡🟢💡⚠️📊) y mantén cada sección en máximo 2-3 líneas.
`;

    const prompt = promptConfig ?
      promptConfig.promptTemplate.replace('{data}', JSON.stringify(analysisData, null, 2)) :
      defaultPrompt;

    const aiModel = process.env.OPENAI_MODEL_ANALYSIS || 'gpt-4o';
    const temperature = 0.7;
    const maxTokens = 800;

    try {
      console.log(`[OpenAIService] Starting analyzeEvaluationParameters operation for RUT: ${analysisData.rut} ${prompt}`);

      const completion = await openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response received from OpenAI');
      }

      const executionTime = Date.now() - startTime;

      // Extract token usage if available
      const tokensUsed = completion.usage ? {
        prompt: completion.usage.prompt_tokens,
        completion: completion.usage.completion_tokens,
        total: completion.usage.total_tokens
      } : undefined;

      // Log the AI operation
      await this.logAIOperation(
        'analyzeEvaluationParameters',
        prompt,
        analysisData,
        aiResponse,
        aiModel,
        temperature,
        maxTokens,
        executionTime,
        true,
        promptConfig?._id?.toString(),
        analysisData.rut,
        tenantId,
        userId,
        undefined,
        tokensUsed
      );

      console.log(`[OpenAIService] analyzeEvaluationParameters completed successfully in ${executionTime}ms`);
      return aiResponse;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = `Error al generar análisis AI: ${error instanceof Error ? error.message : String(error)}`;

      console.error('Error calling OpenAI API for evaluation analysis:', error);

      // Log the failed AI operation
      await this.logAIOperation(
        'analyzeEvaluationParameters',
        prompt,
        analysisData,
        '',
        aiModel,
        temperature,
        maxTokens,
        executionTime,
        false,
        promptConfig?._id?.toString(),
        analysisData.rut,
        tenantId,
        userId,
        errorMessage
      );

      return errorMessage;
    }
  }

  public async evaluateFinancialRisk(logEntry: ISheriffDataLog) {
    try {
      // Removed backoff skip: always attempt when canUseOpenAI returns true
      const companyData = logEntry || {};
      // console.warn(462, "companyData:", companyData.summaryData.data);
      //make a copy of logEntry and cut the data not needed
      let aiFilteredData = {
        ...companyData.summaryData.data || {},
        equifaxData: (logEntry as any).equifaxData || {},
        antiunionCase: (logEntry as any).antiunionCase || {},
        multasLaborales: (logEntry as any).multasLaborales || {},
      };


      console.warn(473, "evaluateFinancialRisk Data :", aiFilteredData);

      //      const companyData = logEntry.filteredDetails || {};
      const prompt = `
Eres un analista senior de riesgo financiero especializado en empresas de Latinoamérica (Chile).  
Tu tarea es generar la **Sección 4: Principales Hallazgos** del reporte Fast Check, siguiendo el documento técnico oficial “Requerimiento Técnico – Principales Hallazgos (FastCheck v1)”.

---

### 🎯 Objetivo
Identificar y listar **solo los parámetros con riesgo Alto o Crítico**, mostrando un **detalle factual** (conteos, montos, estados, fechas, instituciones) basado en las fuentes primarias.  
El resultado debe entregarse en formato **Markdown estructurado con tablas**.

---

### ⚙️ Formato de salida
Devuelve el resultado **en español (Chile)**, con este formato:

## 🧾 Resumen

---

## Compliance
| Parámetro | Detalle factual | Nivel |
|------------|-----------------|--------|
| *Ejemplo:* Condenas Ley 21.121 | Sin registros activos al 24/10/2025 | — |
| *Ejemplo:* Listas Internacionales | No aparece en sanciones internacionales | — |

> Si no hay hallazgos relevantes, incluye una sola fila:
> \`| Sin hallazgos relevantes en esta dimensión | — | — |\`

---

## Capital Humano
| Parámetro | Detalle factual | Nivel |
|------------|-----------------|--------|
| *Ejemplo:* Deuda Previsional Presunta | 10 casos; 9 inactivas; 1 activa; última actualización 24/10/2025 | Alto 🟠 |
| *Ejemplo:* Multas Laborales: totalFines por CLP totalFinesAmount; pagadas paidFines finesPaidAmount; pendientes outstandingFinesoutstandingFinesAmount; última actualización boletinLaboralLastUpdate | Alto 🟠 |

---

## Financiero / Tributario
| Parámetro | Detalle factual | Nivel |
|------------|-----------------|--------|
| *Ejemplo:* Protestos y Morosidades | Sin protestos ni morosidades registradas | — |

> Si no existen hallazgos relevantes, usar:
> \`| Sin hallazgos relevantes en esta dimensión | — | — |\`

---

## Legal
| Parámetro | Detalle factual | Nivel |
|------------|-----------------|--------|
| *Ejemplo:* Causas Laborales | 1 caso en tramitación; RIT O-412-2025; Juzgado de Letras del Trabajo de Los Ángeles; ingreso 13/10/2025 | Crítico 🔴 |
| *Ejemplo:* Causas Cobranza Laboral | 2 casos activos; monto total CLP 2.300.000; última actualización 24/10/2025 | Alto 🟠 |

---

### 🧩 Dimensiones y parámetros esperados

#### Compliance
- Condenas Ley 21.121  
- Condenas Ley 20.393  
- Listas Internacionales  
- Sanciones Medioambientales  
- Procesos Sancionatorios Medioambientales  
- Listas Propias Alto Impacto  
- Listas Propias Mediano Impacto  
- PEP Chile Directo  
- PEP Chile Relacionados  

#### Capital Humano
- Condenas Prácticas Antisindicales  
- Deuda Previsional Publicada  
- Multas Laborales  (search for totalFines, totalFinesAmount,
paidFines, finesPaidAmount,
outstandingFines,
outstandingFinesAmount,
boletinLaboralLastUpdate)
- Deuda Previsional Presunta  (search for: moraPrevisionalCasesData[*];
trabajadores únicos (RUT),
instituciones (AFP/AFC), período más
reciente
)

#### Financiero / Tributario
- Protestos y Morosidades  
- Término de Giro  
- Difícil Fiscalización  
- Inicio de Actividades (SII)  

#### Legal
- Quiebra Judicial / Procedimientos Concursales  
- Boletín Concursal  
- Causas Civiles  
- Causas Laborales  
- Causas Cobranza Laboral  

---

### 🧮 Reglas
- Solo incluir parámetros con riesgo **Alto o Crítico**.  
- Si una dimensión no tiene hallazgos, mostrar una sola fila:
  \`| Sin hallazgos relevantes en esta dimensión | — | — |\`
- Incluir detalles concretos (fechas, montos, conteos, estados, instituciones).  
- Formato monetario: CLP con punto como separador de miles.  
- Fechas: DD/MM/AAAA.  
- No incluir texto explicativo fuera de las tablas.

---

### 📦 Datos a analizar
\`\`\`json
${JSON.stringify(aiFilteredData, null, 2)}
\`\`\`
`;

      const usable = await this.canUseOpenAI();
      if (!usable) {
        console.warn('[OpenAIService.evaluateFinancialRisk] Skipping due to insufficient credit/quota.');
        return {
          summary: 'AI check failed or insufficient credit. Using default assessment.',
          riskLevel: 'Medium',
          riskScore: 50,
          keyIndicators: {
            boletinComercialDebt: null,
            laborDebt: null,
            bankDebt: null,
            bankruptcy: false,
            assetsValue: null
          }
        };
      }
      //console.log('[OpenAIService.evaluateFinancialRisk] Sending request to OpenAI with prompt:', prompt);

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL_ANALYSIS || 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a financial risk analysis assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
      });


      const output = response.choices?.[0]?.message?.content?.trim();
      console.log('[OpenAIService.evaluateFinancialRisk] Raw OpenAI response:', output);
      if (!output) {
        throw new Error('Empty OpenAI response');
      }
      return response.choices[0].message.content;
      /*
      try {
        const parsed = JSON.parse(output);
        return parsed;
      } catch (err) {
        const match = output.match(/\{[\s\S]*\}/);
        if (match) {
          return JSON.parse(match[0]);
        }
        throw err;
      }
        */
    } catch (error) {
      // Removed backoff setting for 429/insufficient_quota
      console.error('Error in OpenAIService.evaluateFinancialRisk AI call:', error);
      return {
        summary: 'AI analysis unavailable. Defaulting to conservative medium risk based on missing or incomplete data.',
        riskLevel: 'Medium',
        riskScore: 50,
        keyIndicators: {
          boletinComercialDebt: null,
          laborDebt: null,
          bankDebt: null,
          bankruptcy: false,
          assetsValue: null
        }
      };
    }
  }


  public async evaluateFinancialRiskiaRes(iaRes: any[]) {
    try {
      // ---------- Helpers ----------
      const toCLP = (n: any) => {
        const num = typeof n === 'string' ? Number(n) : Number(n ?? 0);
        if (!isFinite(num)) return '—';
        return num.toLocaleString('es-CL', { maximumFractionDigits: 0 });
      };

      const isEmpty = (v: any) =>
        v == null ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && Object.keys(v).length === 0) ||
        (typeof v === 'string' && v.trim() === '');

      const fmtDate = (raw: any): string => {
        if (!raw) return '—';
        // formats: "20251014", "2019-05-24T00:00:00.000Z", "2025-10-01", "14-09-2001"
        const s = String(raw).trim();
        // yyyymmdd
        if (/^\d{8}$/.test(s)) {
          const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8);
          return `${d}/${m}/${y}`;
        }
        // dd-mm-yyyy
        if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
          const [d, m, y] = s.split('-');
          return `${d}/${m}/${y}`;
        }
        // ISO
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) {
          const d = String(dt.getUTCDate()).padStart(2, '0');
          const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const y = dt.getUTCFullYear();
          return `${d}/${m}/${y}`;
        }
        return s;
      };

      type Row = { parametro: string; detalle: string; nivel: 'Alto' | 'Crítico' };

      // Utility per fetch rapido dal iaRes
      const get = (dimension: string, parameter: string) =>
        iaRes.find(
          (x) =>
            String(x.dimension).toLowerCase().trim() === dimension.toLowerCase().trim() &&
            String(x.parameter ?? x.seekData ?? '').toLowerCase().trim() === parameter.toLowerCase().trim()
        )?.value;

      const rowsCompliance: Row[] = [];
      const rowsHumano: Row[] = [];
      const rowsFinTrib: Row[] = [];
      const rowsLegal: Row[] = [];

      // ---------- COMPLIANCE ----------
      // Regole (in generale: true/valori presenti => Alto/Crítico; assenza => non include)
      // Condenas Ley 21.121
      {
        const v = get('Compliance', 'Condenas Ley 21.121');
        if (v === true || (Array.isArray(v) && v.length > 0)) {
          rowsCompliance.push({
            parametro: 'Condenas Ley 21.121',
            detalle: 'Condenas registradas (fuente: Poder Judicial/Ministerio Público).',
            nivel: 'Crítico',
          });
        }
      }
      // Condenas Ley 20.393
      {
        const v = get('Compliance', 'Condenas Ley 20.393');
        if (v === true || (Array.isArray(v) && v.length > 0)) {
          rowsCompliance.push({
            parametro: 'Condenas Ley 20.393',
            detalle: 'Condenas por responsabilidad penal de la persona jurídica.',
            nivel: 'Crítico',
          });
        }
      }
      // Listas Internacionales
      {
        const v = get('Compliance', 'Listas Internacionales');
        if (Array.isArray(v) && v.length > 0) {
          rowsCompliance.push({
            parametro: 'Listas Internacionales',
            detalle: `Aparece en listas internacionales (${v.length} coincidencias).`,
            nivel: 'Crítico',
          });
        }
      }
      // Sanciones Medioambientales
      {
        const v = get('Compliance', 'Sanciones Medioambientales');
        if (Array.isArray(v) && v.length > 0) {
          rowsCompliance.push({
            parametro: 'Sanciones Medioambientales',
            detalle: `${v.length} sanciones vigentes (fuente SMA/SEA).`,
            nivel: 'Alto',
          });
        }
      }
      // Procesos Sancionatorios Medioambientales
      {
        const v = get('Compliance', 'Procesos Sancionatorios Medioambientales');
        if (Array.isArray(v) && v.length > 0) {
          rowsCompliance.push({
            parametro: 'Procesos Sancionatorios Medioambientales',
            detalle: `${v.length} procesos en curso (fuente SMA/SEA).`,
            nivel: 'Alto',
          });
        }
      }
      // Listas Propias Alto/Mediano Impacto
      {
        const alta = get('Compliance', 'Listas Propias de Alto Impacto') ?? get('Compliance', 'Listas Propias Alto Impacto');
        if (alta === true) {
          rowsCompliance.push({
            parametro: 'Listas Propias de Alto Impacto',
            detalle: 'Coincidencia en lista propia de alto impacto.',
            nivel: 'Crítico',
          });
        }
        const media =
          get('Compliance', 'Listas Propias de Mediano Impacto') ??
          get('Compliance', 'Listas Propias Mediano Impacto') ??
          get('Compliance', 'Listas Proprias Mediano Impacto');
        if (media === true) {
          rowsCompliance.push({
            parametro: 'Listas Propias de Mediano Impacto',
            detalle: 'Coincidencia en lista propia de mediano impacto.',
            nivel: 'Alto',
          });
        }
      }
      // PEP
      {
        const pepDir = get('Compliance', 'PEP Chile Directo');
        if (Array.isArray(pepDir) && pepDir.length > 0) {
          rowsCompliance.push({
            parametro: 'PEP Chile (Directo)',
            detalle: `${pepDir.length} persona(s) PEP directamente vinculadas.`,
            nivel: 'Alto',
          });
        }
        const pepRel = get('Compliance', 'PEP Chile Relacionados');
        if (Array.isArray(pepRel) && pepRel.length > 0) {
          rowsCompliance.push({
            parametro: 'PEP Chile Relacionados (Familiares)',
            detalle: `${pepRel.length} relación(es) PEP por parentesco.`,
            nivel: 'Alto',
          });
        }
      }

      // ---------- CAPITAL HUMANO ----------
      // Condenas Prácticas Antisindicales
      {
        const v = get('Capital Humano', 'Condenas por Prácticas Antisindicales');
        console.warn(815,'Condenas por Prácticas Antisindicales', v);
        if (Array.isArray(v) && v.length > 0) {
          rowsHumano.push({
            parametro: 'Condenas por Prácticas Antisindicales',
            detalle: `${v.length} condena(s) registradas (DT/PJUD).`,
            nivel: 'Crítico',
          });
        }
      }
      // Deuda Previsional Publicada
      {
        const v = get('Capital Humano', 'Deuda Previsional Publicada');
        if (v && !isEmpty(v.totalBolab)) {
          const tot = Number(v.totalBolab ?? 0);
          const monto = v.totalAmountBolab ?? v.totalAmount ?? v.totalAmountCLP ?? v.totalAmountBolab;
          const montoTxt = toCLP(monto);
          const exp = fmtDate(v.expirationDateLastBolab);
          if (tot > 0) {
            rowsHumano.push({
              parametro: 'Deuda Previsional Publicada',
              detalle: `${tot} deuda(s) publicadas; monto total CLP ${montoTxt}; última expiración ${exp}.`,
              nivel: 'Alto',
            });
          }
        }
      }
      // Multas Laborales
      {
        const v = get('Capital Humano', 'Multas Laborales');
        if (v && (Number(v.totalFines ?? 0) > 0 || Number(v.outstandingFines ?? 0) > 0)) {
          const total = Number(v.totalFines ?? 0);
          const totalAmt = toCLP(v.totalFinesAmount);
          const pag = Number(v.paidFines ?? 0);
          const pagAmt = toCLP(v.finesPaidAmount);
          const pend = Number(v.outstandingFines ?? 0);
          const pendAmt = toCLP(v.outstandingFinesAmount);
          const nivel: Row['nivel'] = pend > 0 ? 'Alto' : 'Alto';
          rowsHumano.push({
            parametro: 'Multas Laborales',
            detalle: `${total} multas; pagadas ${pag} (CLP ${pagAmt}); pendientes ${pend} (CLP ${pendAmt}).`,
            nivel,
          });
        }
      }
      // Deuda Previsional Presunta
      {
        const v = get('Capital Humano', 'Deuda Previsional Presunta');
        if (v && Number(v.totalCases ?? 0) > 0) {
          rowsHumano.push({
            parametro: 'Deuda Previsional Presunta',
            detalle: `${Number(v.totalCases)} caso(s) con ${Number(v.employees ?? 0)} trabajador(es) afectados.`,
            nivel: 'Alto',
          });
        }
      }

      // ---------- FINANCIERO / TRIBUTARIO ----------
      // Protestos y Morosidades
      {
        const v = get('Financiero / Tributario', 'Protestos y Morosidades');
        let handled = false;
        // If we received the structured Equifax protest summary, extract details
        if (v && typeof v === 'object') {
          const totalProtests = Number((v as any).totalProtests ?? 0);
          const totalAmount = Number((v as any).totalAmountProtests ?? 0);
          const lastAmount = Number((v as any).amountLastProtest ?? 0);
          const lastExp = fmtDate((v as any).expirationDateLastProtest);
          if ((isFinite(totalAmount) && totalAmount > 0) || totalProtests > 0 || (isFinite(lastAmount) && lastAmount > 0)) {
            rowsFinTrib.push({
              parametro: 'Protestos y Morosidades',
              detalle: `Último protesto CLP ${toCLP(lastAmount)} (venc: ${lastExp}); total ${totalProtests} protesto(s) por CLP ${toCLP(totalAmount)}.`,
              nivel: 'Alto',
            });
            handled = true;
          }
        }
        // Fallback: if value is a simple numeric amount
        if (!handled) {
          const n = Number(v ?? 0);
          if (isFinite(n) && n > 0) {
            rowsFinTrib.push({
              parametro: 'Protestos y Morosidades',
              detalle: `Registros con saldo/monto asociado (${toCLP(n)}).`,
              nivel: 'Alto',
            });
          }
        }
      }
      // Término de Giro
      {
        const v = get('Financiero / Tributario', 'Término de Giro');
        if (v === true || (typeof v === 'string' && v.trim() !== '')) {
          rowsFinTrib.push({
            parametro: 'Término de Giro',
            detalle: `Término de giro detectado (${String(v)}).`,
            nivel: 'Crítico',
          });
        }
      }
      // Difícil Fiscalización
      {
        const v = get('Financiero / Tributario', 'Difícil Fiscalización');
//        console.warn(897,'Difícil Fiscalización', v);
        if (typeof v === 'string' && !/No se encuentra/i.test(v)) {
          rowsFinTrib.push({
            parametro: 'Difícil Fiscalización',
            detalle: "El contribuyente se encuentra en la Nómina de Difícil Fiscalización",
            nivel: 'Alto',
          });
        }
      }
      // Inicio de Actividades (regla especial: si NO detectado => Alto/Crítico; si SI => no incluir)
      {
        const v = get('Financiero / Tributario', 'Inicio de Actividades');
        const presenta = v?.presentaActividades;
        if (!v || String(presenta).toUpperCase() !== 'SI') {
          rowsFinTrib.push({
            parametro: 'Inicio de Actividades (SII)',
            detalle: 'No se detecta inicio de actividades vigente en SII.',
            nivel: 'Alto',
          });
        }
      }

      // ---------- LEGAL ----------

      // 🧩 Helper ricorsivo per trovare oggetti che contengono parole chiave tipo "causa", "laboral", "cobranza"
      const deepFindCases = (obj: any, keywords: string[]) => {
        const results: any[] = [];
        const search = (node: any) => {
          if (!node || typeof node !== 'object') return;
          for (const [key, value] of Object.entries(node)) {
            const k = key.toLowerCase();
            if (keywords.some((kw) => k.includes(kw))) {
              if (Array.isArray(value)) {
                results.push(...value);
              } else if (typeof value === 'object') {
                results.push(value);
              }
            }
            if (typeof value === 'object') search(value);
          }
        };
        search(obj);
        return results;
      };

      {
        // === QUIEBRA JUDICIAL ===
        console.log("evaluateFinancialRiskiaRes Legal Quiebra Judicial Procedimientos Concursales");
        const v = get('Legal', 'Quiebra Judicial Procedimientos Concursales');
        const bank = Number(v?.bankruptcyCases ?? 0);
        if (bank > 0) {
          const resumen = v?.bankruptcyCasesResume
            ? Object.entries(v.bankruptcyCasesResume)
              .map(([k, val]) => `${k}: ${val}`)
              .join('; ')
            : `Casos: ${bank}`;
          rowsLegal.push({
            parametro: 'Quiebra Judicial / Procedimientos Concursales',
            detalle: resumen,
            nivel: 'Crítico',
          });
        }

        // === BOLETÍN CONCURSAL ===
        console.log("evaluateFinancialRiskiaRes Legal Boletín Concursal");
        const bc = get('Legal', 'Boletín Concursal');
        const flag = bc?.summaryBolConcursal?.flagBoletinConcursal;
        if (String(flag) === '1') {
          const items = bc?.detailBoletinConcursal?.commercialDetailBoletinConcursal ?? [];
          let maxDate = '';
          if (Array.isArray(items) && items.length) {
            const dates = items
              .map((i: any) => i?.dateBoletin)
              .filter(Boolean)
              .map((d: string) => fmtDate(d));
            maxDate = dates[0] || '';
          }
          rowsLegal.push({
            parametro: 'Boletín Concursal',
            detalle: `Publicaciones activas (última visible: ${maxDate || '—'})`,
            nivel: 'Crítico',
          });
        }

        // === CAUSAS CIVILES ===
                console.log("evaluateFinancialRiskiaRes Legal Causas Civiles");
        const causasCiv = get('Legal', 'Causas Civiles') || get('Legal', 'Causas Civiles Detalle');
        if (Array.isArray(causasCiv) && causasCiv.length > 0) {
          const activas = causasCiv.filter(
            (c: any) =>
              /Tramitación/i.test(c.estado ?? '') ||
              /Vigente/i.test(c.estadoActual ?? '') ||
              /Trámite/i.test(c.estado ?? '')
          );
          if (activas.length > 0) {
            const primera = activas[0];
            rowsLegal.push({
              parametro: 'Causas Civiles',
              detalle: `${activas.length} en tramitación; Rol ${primera.rol ?? '—'}; ${primera.tribunal ?? '—'}; ingreso ${fmtDate(primera.fechaIngreso)}`,
              nivel: 'Alto',
            });
          }
        }

        // === CAUSAS LABORALES (ricerca fuzzy) ===
        console.log("evaluateFinancialRiskiaRes Legal Causas Laborales");
        let causasLab =
          get('Legal', 'Causas Laborales') ||
          get('Legal', 'Causas Laborales Detalle') ||
          get('Legal', 'LaboralCases') ||
          deepFindCases(iaRes, ['laboral', 'juicio', 'trabajo']);
        causasLab = causasLab.flat().filter((x: any) => typeof x === 'object');
     //   console.warn(1063, "causasLab", causasLab);

        if (Array.isArray(causasLab) && causasLab.length > 0) {
          const activas = causasLab.filter(
            (c: any) =>
              /Terminada/i.test(c.etapa ?? '') 
          );
          if (activas.length > 0) {
            const primera = activas[0];
            rowsLegal.push({
              parametro: 'Causas Laborales',
              detalle: `${activas.length} en tramitación; RIT ${primera.rit ?? primera.rol ?? '—'}; ${primera.tribunal ?? '—'}; ingreso ${fmtDate(primera.fechaIngreso)}`,
              nivel: 'Alto',
            });
          } else {
            console.warn(1024, "***** not found Causas Laborales");
          }
        }

        // === CAUSAS COBRANZA LABORAL (ricerca fuzzy) ===
        console.log("evaluateFinancialRiskiaRes Legal Causas Cobranza Laboral");
        let causasCob =
          get('Legal', 'Causas Cobranza Laboral') ||
          get('Legal', 'Causas de Cobranza Laboral') ||
          deepFindCases(iaRes, ['cobranza', 'ejecutivo', 'cobro', 'demanda']);
        causasCob = causasCob.flat().filter((x: any) => typeof x === 'object');
       // console.warn(1063, "causasCob", causasCob);
        if (Array.isArray(causasCob) && causasCob.length > 0) {
          const activas = causasCob.filter(
            (c: any) =>
               /Terminada/i.test(c.etapa ?? '')  ||
              /Tramitación/i.test(c.estado ?? '') ||
              /Concluido/i.test(c.estado ?? '') ||
              /Vigente/i.test(c.estadoActual ?? '') ||
              /Trámite/i.test(c.estado ?? '')
          );
          const totalMonto = activas.reduce((acc: number, c: any) => acc + Number(c.monto ?? 0), 0);
          if (activas.length > 0) {
            rowsLegal.push({
              parametro: 'Causas Cobranza Laboral',
              detalle: `${activas.length} activas; monto total CLP ${toCLP(totalMonto)}.`,
              nivel: totalMonto > 5000000 ? 'Crítico' : 'Alto',
            });
          }
        }
      }

 //     console.warn(1052, "rowsLegal complete", rowsLegal);


      // ---------- Render Markdown ----------
      const renderTable = (rows: Row[]) => {
        if (!rows.length) {
          return `| Parámetro | Detalle factual | Nivel |\n|------------|-----------------|--------|\n| Sin hallazgos relevantes en esta dimensión | — | — |`;
        }
        const emoji = (nivel: Row['nivel']) => (nivel === 'Crítico' ? '🔴' : '🟠');
        const body = rows
          .map((r) => `| ${r.parametro} | ${r.detalle} | ${r.nivel} ${emoji(r.nivel)} |`)
          .join('\n');
        return `| Parámetro | Detalle factual | Nivel |\n|------------|-----------------|--------|\n${body}`;
      };

      // ------- Resumen total / nivel y puntaje -------
      const allRows: Row[] = [
        ...rowsCompliance,
        ...rowsHumano,
        ...rowsFinTrib,
        ...rowsLegal
      ];
      const criticalCount = allRows.filter((r) => r.nivel === 'Crítico').length;
      const highCount = allRows.filter((r) => r.nivel === 'Alto').length;
      const dimsAffected = [rowsCompliance, rowsHumano, rowsFinTrib, rowsLegal]
        .filter((rows) => rows.length > 0).length;
      const overallLevel = criticalCount > 0 ? 'Crítico' : (highCount > 0 ? 'Alto' : 'Bajo');
      const score = Math.min(100, criticalCount * 25 + highCount * 15);

      const md = [
        '## Compliance',
        renderTable(rowsCompliance),
        '---',
        '## Capital Humano',
        renderTable(rowsHumano),
        '---',
        '## Financiero / Tributario',
        renderTable(rowsFinTrib),
        '---',
        '## Legal',
        renderTable(rowsLegal),
        '---',
     /*   '## 🧠 Conclusión Global',
        `**Nivel total de riesgo:** ${overallLevel}`,
        `**Puntaje consolidado:** ${score}/100`,
        `**Resumen total:** ${criticalCount} crítico(s); ${highCount} alto(s); dimensiones afectadas: ${dimsAffected}`,
        '**Recomendaciones finales (como proveedor):**\n' +
        '- Ajustar términos según exposición legal y laboral vigente.\n' +
        '- Monitoreo mensual de Boletín Concursal y multas laborales.', */
      ].join('\n');

    //  console.warn(1040, "evaluateFinancialRiskiaRes Data :", md);
      return md;
    } catch (error) {
      console.error('Error in evaluateFinancialRiskiaRes:', error);
      return 'No fue posible generar el reporte.';
    }
  }


  public async evaluateFinancialRiskiaRes_2(iaRes: any[]) {
    try {
      console.warn(468, "evaluateFinancialRiskiaRes Data :", iaRes);

      // ==============================
      // 🎯 Prompt comune a tutte le sezioni
      // ==============================
      const commonInstructions = `
Eres un analista senior de riesgo financiero especializado en empresas de Latinoamérica (Chile).  
Tu tarea es generar la **Sección: Principales Hallazgos** según el estándar FastCheck v1.

### 🎯 Objetivo
Identificar y listar **solo los parámetros con riesgo Alto o Crítico**, mostrando un **detalle factual** (conteos, montos, estados, fechas, instituciones) basado en las fuentes primarias.  
El resultado debe entregarse en formato **Markdown estructurado con tablas**.

### 🧮 Reglas
- Solo incluir parámetros con riesgo **Alto o Crítico**.  
- Si una dimensión no tiene hallazgos, mostrar una sola fila:
  \`| Sin hallazgos relevantes en esta dimensión | — | — |\`
- Incluir detalles concretos (fechas, montos, conteos, estados, instituciones).  
- Formato monetario: CLP con punto como separador de miles.  
- Fechas: DD/MM/AAAA.  
- No incluir texto explicativo fuera de las tablas.
`;

      // ==============================
      // 📊 Prompts por dimensión
      // ==============================
      const prompts = {
        compliance: `
${commonInstructions}

## Compliance
| Parámetro | Detalle factual | Nivel |
|------------|-----------------|--------|
- Condenas Ley 21.121  
- Condenas Ley 20.393  
- Listas Internacionales  
- Sanciones Medioambientales  
- Procesos Sancionatorios Medioambientales  
- Listas Propias Alto Impacto  
- Listas Propias Mediano Impacto  
- PEP Chile Directo  
- PEP Chile Relacionados  

### 📦 Datos
\`\`\`json
${JSON.stringify(iaRes.filter(r => r.dimension === 'compliance'), null, 2)}
\`\`\`
`,

        capital: `
${commonInstructions}

## Capital Humano
| Parámetro | Detalle factual | Nivel |
|------------|-----------------|--------|
- Condenas Prácticas Antisindicales  
- Deuda Previsional Publicada  
- Multas Laborales  
- Deuda Previsional Presunta  

> Usa estos campos si existen: totalFines, totalFinesAmount, paidFines, finesPaidAmount, outstandingFines, outstandingFinesAmount, boletinLaboralLastUpdate, moraPrevisionalCasesData, instituciones AFP/AFC, período más reciente.

### 📦 Datos
\`\`\`json
${JSON.stringify(iaRes.filter(r => r.dimension === 'capitalHumano'), null, 2)}
\`\`\`
`,

        financieroTrib: `
${commonInstructions}

## Financiero / Tributario
| Parámetro | Detalle factual | Nivel |
|------------|-----------------|--------|
- Protestos y Morosidades  
- Término de Giro  
- Difícil Fiscalización  
- Inicio de Actividades (SII)  

### 📦 Datos
\`\`\`json
${JSON.stringify(iaRes.filter(r => r.dimension === 'financieroTributario'), null, 2)}
\`\`\`
`,

        legal: `
${commonInstructions}

## Legal
| Parámetro | Detalle factual | Nivel |
|------------|-----------------|--------|
- Quiebra Judicial / Procedimientos Concursales  
- Boletín Concursal  
- Causas Civiles  
- Causas Laborales  
- Causas Cobranza Laboral  

### 📦 Datos
\`\`\`json
${JSON.stringify(iaRes.filter(r => r.dimension === 'legal'), null, 2)}
\`\`\`
`
      };

      // ==============================
      // ✅ Verifica credito OpenAI
      // ==============================
      const usable = await this.canUseOpenAI();
      if (!usable) {
        console.warn('[OpenAIService.evaluateFinancialRiskiaRes] Skipping due to insufficient credit/quota.');
        return { summary: 'AI analysis skipped due to insufficient credit.', riskLevel: 'Medium', riskScore: 50 };
      }

      // ==============================
      // 🧠 Funzione helper per chiamate AI
      // ==============================
      const analyze = async (role: string, prompt: string) => {
        const res = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL_ANALYSIS || 'gpt-4o-mini', // usa mini per meno token
          temperature: 0.2,
          messages: [
            { role: 'system', content: role },
            { role: 'user', content: prompt },
          ],
        });
        return res.choices?.[0]?.message?.content?.trim() || '';
      };

      // ==============================
      // 🚀 Esecuzione step-by-step
      // ==============================
      console.log("🔹 Step 1: Compliance...");
      const complianceOutput = await analyze(
        'You are a corporate compliance analyst for Chilean companies.',
        prompts.compliance
      );

      console.log("🔹 Step 2: Capital Humano...");
      const capitalOutput = await analyze(
        'You are a labor and social security analyst for Chilean companies.',
        prompts.capital
      );

      console.log("🔹 Step 3: Financiero-Tributario...");
      const tributaryOutput = await analyze(
        'You are a financial and tax analyst for Chilean companies.',
        prompts.financieroTrib
      );

      console.log("🔹 Step 4: Legal...");
      const legalOutput = await analyze(
        'You are a legal risk analyst for Chilean companies.',
        prompts.legal
      );

      // ==============================
      // 🧾 Report Markdown finale
      // ==============================
      const finalMarkdown = `
Análisis automatizado de riesgo económico y financiero basado en fuentes oficiales y registros públicos.

---

## Compliance
${complianceOutput}

---

## Capital Humano
${capitalOutput}

---

## Financiero / Tributario
${tributaryOutput}

---

## Legal
${legalOutput}

---

## 🧠 Conclusión Global
**Nivel total de riesgo:** (Bajo / Medio / Alto / Crítico)  
**Puntaje consolidado:** XX/100  
**Recomendaciones finales:**  
- Evaluar continuidad como proveedor solo tras resolución de causas judiciales y laborales.  
- Revisar periódicamente el Boletín Concursal y deudas previsionales.
`;

      console.log('[OpenAIService.evaluateFinancialRiskiaRes] ✅ Reporte generado correctamente.');
      return finalMarkdown;

    } catch (error) {
      console.error('Error in OpenAIService.evaluateFinancialRiskiaRes AI call:', error);
      return {
        summary: 'AI analysis unavailable. Defaulting to medium risk.',
        riskLevel: 'Medium',
        riskScore: 50,
      };
    }
  }

}
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Definizione dei parametri .env consentiti
const ALLOWED_ENV_PARAMS = [
  'OPENAI_API_KEY',
  'SHERIFF_API_TOKEN',
  'SENDGRID_API_KEY',
  'MONGODB_URI',
  'PORT',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'API_URL',
  'SHERIFF_API_URL',
  'SII_URL',
  'OPENAI_MODEL_SUMMARY',
  'OPENAI_MODEL_ANALYSIS',
  'OPENAI_MODEL_VISION',
  'OPENAI_TEMPERATURE',
  'OPENAI_MAX_TOKENS',
  'OPENAI_MAX_DATA_LENGTH',
  'SHERIFF_CLIENT_IDENTIFIER',
  'SHERIFF_PAGINATION_LIMIT',
  'RISK_TOTAL_PARAMS',
  'RISK_CIVIL_CASES_THRESHOLD',
  'RISK_LABORAL_CASES_THRESHOLD',
  'RISK_CRITICAL_PERCENTAGE',
  'RISK_HIGH_PERCENTAGE',
  'RISK_MEDIUM_PERCENTAGE',
  'SUPPORT_EMAIL',
  'SENDGRID_FROM_EMAIL',
  'SENDGRID_FROM_NAME',
  'RABBITMQ_URL',
  'RABBITMQ_QUEUE'
];

// Parametri sensibili che devono essere mascherati
const SENSITIVE_PARAMS = [
  'OPENAI_API_KEY',
  'SHERIFF_API_TOKEN',
  'SENDGRID_API_KEY',
  'MONGODB_URI',
  'RABBITMQ_URL'
];

interface EnvConfigRequest extends Request {
  body: { [key: string]: string };
}

/**
 * Legge il file .env e restituisce i parametri di configurazione
 */
export const getEnvConfig = async (req: Request, res: Response) => {
  try {
    const envPath = path.join(process.cwd(), '.env');
    
    // Verifica se il file .env esiste
    if (!fs.existsSync(envPath)) {
      return res.status(404).json({
        success: false,
        message: 'File .env non trovato'
      });
    }
    
    // Legge il file .env
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envConfig = dotenv.parse(envContent);
    
    // Filtra solo i parametri consentiti e maschera quelli sensibili
    const filteredConfig: { [key: string]: string } = {};
    
    ALLOWED_ENV_PARAMS.forEach(param => {
      if (envConfig[param] !== undefined) {
        if (SENSITIVE_PARAMS.includes(param) && envConfig[param]) {
          // Maschera i parametri sensibili mostrando solo i primi e ultimi caratteri
          const value = envConfig[param];
          if (value.length > 8) {
            filteredConfig[param] = value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
          } else {
            filteredConfig[param] = '*'.repeat(value.length);
          }
        } else {
          filteredConfig[param] = envConfig[param] || '';
        }
      } else {
        filteredConfig[param] = '';
      }
    });
    
    res.json({
      success: true,
      data: filteredConfig
    });
    
  } catch (error) {
    console.error('Error reading .env config:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella lettura della configurazione',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Aggiorna il file .env con i nuovi parametri
 */
export const updateEnvConfig = async (req: EnvConfigRequest, res: Response) => {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const newConfig = req.body;
    
    // Valida che tutti i parametri siano consentiti
    const invalidParams = Object.keys(newConfig).filter(param => !ALLOWED_ENV_PARAMS.includes(param));
    if (invalidParams.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Parametri non consentiti: ${invalidParams.join(', ')}`
      });
    }
    
    // Legge la configurazione esistente
    let existingConfig: { [key: string]: string } = {};
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      existingConfig = dotenv.parse(envContent);
    }
    
    // Aggiorna solo i parametri forniti, mantenendo gli altri
    const updatedConfig = { ...existingConfig };
    
    Object.keys(newConfig).forEach(key => {
      const value = newConfig[key];
      
      // Se il valore è mascherato (contiene asterischi), mantieni il valore esistente
      if (SENSITIVE_PARAMS.includes(key) && value && value.includes('*')) {
        // Non aggiornare il valore se è mascherato
        return;
      }
      
      // Aggiorna il valore
      if (value === '') {
        delete updatedConfig[key];
      } else {
        updatedConfig[key] = value;
      }
    });
    
    // Costruisce il contenuto del file .env
    const envLines: string[] = [];
    
    // Aggiungi commenti per le sezioni
    const sections = {
      'API Keys': ['OPENAI_API_KEY', 'SHERIFF_API_TOKEN', 'SENDGRID_API_KEY'],
      'Database': ['MONGODB_URI'],
      'Server': ['PORT', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS'],
      'API URLs': ['API_URL', 'SHERIFF_API_URL', 'SII_URL'],
      'OpenAI Settings': ['OPENAI_MODEL_SUMMARY', 'OPENAI_MODEL_ANALYSIS', 'OPENAI_MODEL_VISION', 'OPENAI_TEMPERATURE', 'OPENAI_MAX_TOKENS', 'OPENAI_MAX_DATA_LENGTH'],
      'Sheriff API Settings': ['SHERIFF_CLIENT_IDENTIFIER', 'SHERIFF_PAGINATION_LIMIT'],
      'Risk Calculation Thresholds': ['RISK_TOTAL_PARAMS', 'RISK_CIVIL_CASES_THRESHOLD', 'RISK_LABORAL_CASES_THRESHOLD', 'RISK_CRITICAL_PERCENTAGE', 'RISK_HIGH_PERCENTAGE', 'RISK_MEDIUM_PERCENTAGE'],
      'Contact Information': ['SUPPORT_EMAIL'],
      'SendGrid Configuration': ['SENDGRID_FROM_EMAIL', 'SENDGRID_FROM_NAME'],
      'RabbitMQ Configuration': ['RABBITMQ_URL', 'RABBITMQ_QUEUE']
    };
    
    Object.entries(sections).forEach(([sectionName, params]) => {
      const sectionParams = params.filter(param => updatedConfig[param] !== undefined);
      if (sectionParams.length > 0) {
        envLines.push(`# ${sectionName}`);
        sectionParams.forEach(param => {
          envLines.push(`${param}=${updatedConfig[param]}`);
        });
        envLines.push('');
      }
    });
    
    // Rimuovi l'ultima riga vuota
    if (envLines[envLines.length - 1] === '') {
      envLines.pop();
    }
    
    // Scrive il file .env
    fs.writeFileSync(envPath, envLines.join('\n'));
    
    res.json({
      success: true,
      message: 'Configurazione aggiornata con successo',
      note: 'Riavviare il server per applicare le modifiche'
    });
    
  } catch (error) {
    console.error('Error updating .env config:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'aggiornamento della configurazione',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Valida la configurazione .env
 */
export const validateEnvConfig = async (req: Request, res: Response) => {
  try {
    const envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
      return res.status(404).json({
        success: false,
        message: 'File .env non trovato'
      });
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envConfig = dotenv.parse(envContent);
    
    // Parametri obbligatori
    const requiredParams = [
      'OPENAI_API_KEY',
      'SHERIFF_API_TOKEN',
      'MONGODB_URI',
      'PORT',
      'API_URL',
      'SHERIFF_API_URL'
    ];
    
    const missingParams = requiredParams.filter(param => !envConfig[param]);
    const warnings: string[] = [];
    
    // Controlla parametri opzionali ma raccomandati
    const recommendedParams = [
      'SENDGRID_API_KEY',
      'SENDGRID_FROM_EMAIL',
      'SUPPORT_EMAIL'
    ];
    
    recommendedParams.forEach(param => {
      if (!envConfig[param]) {
        warnings.push(`Parametro raccomandato mancante: ${param}`);
      }
    });
    
    res.json({
      success: missingParams.length === 0,
      message: missingParams.length === 0 ? 'Configurazione valida' : 'Configurazione incompleta',
      missingRequired: missingParams,
      warnings: warnings
    });
    
  } catch (error) {
    console.error('Error validating .env config:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella validazione della configurazione',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
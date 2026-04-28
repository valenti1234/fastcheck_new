import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import passport from 'passport';
import session from 'express-session';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { connectDB } from './config/db';
import routes from './routes';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { EvaluationService } from './services/evaluationService';
import { MonitoringService } from './services/monitoringService';
import { TenantUsageService } from './services/tenantUsageService';
import { EquifaxCleanupService } from './services/equifaxCleanupService';
import { DbBackupService } from './services/dbBackupService';
import ELKService from './services/elkService';
import { elkLoggingMiddleware, elkErrorMiddleware, elkPerformanceMiddleware } from './middleware/elkMiddleware';
import './config/passport'; // Initialize passport strategies

// Load environment variables
const __filename = fileURLToPath(import.meta.url); // Define __filename first
const __dirname = path.dirname(__filename); // Then __dirname
const envPath = path.resolve(__dirname, '../.env');
const devEnvPath = path.resolve(__dirname, '../_env_dev');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  ELKService.info('Environment variables loaded from server/.env');
} else if (fs.existsSync(devEnvPath)) {
  dotenv.config({ path: devEnvPath });
  ELKService.info('Environment variables loaded from server/_env_dev');
} else {
  dotenv.config();
  ELKService.warn('No env file found; relying on process environment variables');
}

// Create Express app
const app = express();
ELKService.info('Express app created');

// If you are behind a proxy (like Nginx), set this to trust the X-Forwarded-For header.
// The value '1' means it trusts the first hop (your Nginx proxy).
// Adjust if you have more proxies.
app.set('trust proxy', 1);
ELKService.info('Trust proxy set to 1');
app.use((req, res, next) => {
  if(req.originalUrl !== '/api/health') {
    console.log(`[REQ] method: ${req.method} > ${req.originalUrl}`);
  }
  next();
});
// Enable CORS for all origins in development
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));
ELKService.info('CORS middleware enabled with permissive settings');

// Basic security headers
app.use(helmet({
  contentSecurityPolicy: false, // CSP is disabled
  crossOriginEmbedderPolicy: false, // Keep as false unless you specifically need COEP
  crossOriginResourcePolicy: false  // Keep as false unless you specifically need CORP
}));
ELKService.info('Helmet middleware enabled');

// Session configuration for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
ELKService.info('Session middleware enabled');

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
ELKService.info('Passport middleware enabled');

// ELK logging middleware
app.use(elkLoggingMiddleware);
app.use(elkPerformanceMiddleware);
ELKService.info('ELK logging and performance middleware enabled');

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
ELKService.info('JSON and URL-encoded body parsers enabled');

// Rate limiting
/*
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10000, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);
*/
ELKService.info('Rate limiting middleware enabled');

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DuXiter API Documentation',
      version: '1.0.0',
      description: 'API documentation for DuXiter application',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3010}/api`,
        description: 'Local Development Server',
      },
      {
        url: '/api',
        description: 'Production Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: [
    path.join(__dirname, './routes/*.ts'),
    path.join(__dirname, './routes/*.js'),
    path.join(__dirname, './models/*.ts'),
    path.join(__dirname, './models/*.js'),
  ],
};

// Generate Swagger specification
const swaggerSpec = swaggerJsdoc(swaggerOptions);
ELKService.info('Swagger specification generated');

const resolveDirWithFile = (candidates: string[], requiredFile: string): string | null => {
  for (const candidate of candidates) {
    try {
      const filePath = path.join(candidate, requiredFile);
      if (fs.existsSync(filePath)) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
};

const frontendDistDir = resolveDirWithFile(
  [
    path.resolve(__dirname, './frontend'),
    path.resolve(__dirname, '../../dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), '../dist'),
  ],
  'index.html'
);

const staticDir = resolveDirWithFile(
  [
    path.resolve(__dirname, './static'),
    path.resolve(__dirname, '../static'),
  ],
  ''
);

// Serve static files for PDF reports
if (staticDir) {
  app.use('/static', express.static(staticDir));
  ELKService.info(`Static files middleware enabled for /static (${staticDir})`);
} else {
  ELKService.warn('Static files directory not found; /static will not be served');
}

// Serve frontend build files
if (frontendDistDir) {
  app.use(express.static(frontendDistDir));
  ELKService.info(`Frontend static files middleware enabled (${frontendDistDir})`);
} else {
  ELKService.warn('Frontend dist directory not found; frontend will not be served');
}

// Routes
app.use('/api', routes);
ELKService.info('API routes mounted under /api');

// Serve Swagger documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
ELKService.info('Swagger UI served at /api/docs');

// Save Swagger JSON for external use
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
ELKService.info('Swagger JSON available at /api/docs.json');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});
ELKService.info('Health check endpoint available at /api/health');

//catch all wrong api endpoints and print them
app.use('/api', (req, res) => {
  console.warn(`[API 404] method: ${req.method} > ${req.originalUrl}`);
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Catch-all handler for React Router (must be after API routes)
app.get('*', (req, res) => {
  if (!frontendDistDir) {
    res.status(404).send('Frontend not available');
    return;
  }
  res.sendFile(path.join(frontendDistDir, 'index.html'));
});
ELKService.info('Catch-all route registered for React Router');

// CORS preflight
app.options('*', cors());
ELKService.info('CORS preflight handling enabled for all routes');

// ELK Error handling middleware
app.use(elkErrorMiddleware);

// Global error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('=== GLOBAL ERROR HANDLER ===');
  console.error('Error:', err);
  console.error('Error message:', err.message);
  console.error('Error stack:', err.stack);
  console.error('Request URL:', req.url);
  console.error('Request method:', req.method);
  console.error('Request headers:', req.headers);
  console.error('Request body:', req.body);
  console.error('================================');

  ELKService.error('Unhandled error in global middleware', err);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});


ELKService.info('Global error handling middleware registered');

// Start server
const getEnvFlag = (name: string): boolean => {
  const rawExact = process.env[name];
  const raw =
    rawExact ??
    Object.entries(process.env).find(([key]) => key.trim() === name)?.[1];

  if (!raw) return false;

  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const rebuildMongoIndexes = async () => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected');
  }

  const models = Object.values(mongoose.models);
  ELKService.warn('REBUILD_MONGO_INDEX enabled: rebuilding MongoDB indexes', { models: models.length });

  for (const model of models) {
    try {
      await model.collection.dropIndexes();
    } catch (error) {
      ELKService.warn('Failed to drop indexes for model', {
        model: model.modelName,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      await model.createIndexes();
    } catch (error) {
      ELKService.warn('Failed to create indexes for model', {
        model: model.modelName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  ELKService.info('MongoDB indexes rebuild completed');
};

const startServer = async () => {
  ELKService.info('Starting server...');
  try {
    // Test ELK connection
    const elkTest = await ELKService.testConnection();
    if (elkTest.success) {
      ELKService.info('ELK connection test successful');
    } else {
      ELKService.warn('ELK connection test failed', { message: elkTest.message });
    }

    await connectDB();
    ELKService.info('MongoDB connected successfully');

    if (getEnvFlag('REBUILD_MONGO_INDEX')) {
      await rebuildMongoIndexes();
    }

    // Initialize RabbitMQ and evaluation service (temporarily disabled for testing)
    try {
      await EvaluationService.initialize();
      ELKService.info('RabbitMQ service initialized successfully');
    } catch (error) {
      ELKService.warn('RabbitMQ service initialization failed, continuing without it', error as Error);
    }

    // Initialize monitoring service
    await MonitoringService.getInstance().initialize();
    ELKService.info('Monitoring service initialized successfully');

    // Initialize tenant usage service
    await TenantUsageService.getInstance().initialize();
    ELKService.info('Tenant usage service initialized successfully');

    // Initialize Equifax cleanup service (every 30 minutes)
    await EquifaxCleanupService.getInstance().initialize();
    ELKService.info('Equifax cleanup service initialized successfully');

    // Initialize DB backup service (daily)
    await DbBackupService.getInstance().initialize();
    ELKService.info('DB backup service initialized successfully');

    
    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      ELKService.info(`Server is running on port ${port}`);
      ELKService.info(`API Documentation available at http://localhost:${port}/api/docs`);
      ELKService.logBusinessEvent('server_started', { port, environment: process.env.NODE_ENV || 'development' });
    });
  } catch (error) {
    ELKService.error('Failed to start server', error as Error);
    process.exit(1);
  }
};

// Only start server outside of test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// Export app for testing
export { app };

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import passport from 'passport';
import session from 'express-session';
import routes from './routes';
import ELKService from './services/elkService';
import { elkLoggingMiddleware, elkErrorMiddleware, elkPerformanceMiddleware } from './middleware/elkMiddleware';
import './config/passport';

// Load environment variables (basic)
dotenv.config();

// Create Express app
const app = express();
ELKService.info('Express app (test-ready) created');

app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(elkLoggingMiddleware);
app.use(elkPerformanceMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Error handlers
app.use(elkErrorMiddleware);
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  ELKService.error('Unhandled error in app.ts', err);
  res.status(500).json({ status: 'error', message: 'Something went wrong!' });
});

export { app };
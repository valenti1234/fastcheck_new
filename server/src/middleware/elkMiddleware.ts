import { Request, Response, NextFunction } from 'express';
import ELKService from '../services/elkService';

// Estendi l'interfaccia Request per includere startTime
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
    }
  }
}
 
/**
 * Middleware per il logging delle richieste HTTP con ELK
 * Registra informazioni dettagliate su ogni richiesta HTTP
 */
export const elkLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.ELK_ENABLED !== 'true') {
    return next();
  }

  // Registra il tempo di inizio della richiesta
  req.startTime = Date.now();
  
  // Estrai informazioni dalla richiesta
  const requestInfo = {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: {
      'user-agent': req.get('User-Agent'),
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
      'x-forwarded-for': req.get('X-Forwarded-For'),
      'x-real-ip': req.get('X-Real-IP')
    },
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString()
  };

  // Log della richiesta in arrivo
  ELKService.info('Incoming HTTP request', {
    type: 'incoming_request',
    ...requestInfo
  });

  // Intercetta la risposta per loggare anche quella
  const originalSend = res.send;
  res.send = function(body: any) {
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    // Log della risposta usando logRequest
    ELKService.logRequest({
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: responseTime,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Log di errore se status code >= 400
    if (res.statusCode >= 400) {
      ELKService.error(`HTTP Error ${res.statusCode}`, undefined, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

/**
 * Middleware per il logging degli errori con ELK
 * Da utilizzare come error handler globale
 */
export const elkErrorMiddleware = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (process.env.ELK_ENABLED !== 'true') {
    return next(err);
  }

  const responseTime = req.startTime ? Date.now() - req.startTime : 0;
  
  // Log dell'errore con dettagli completi
  ELKService.logSystemError(err, 'HTTP Request Error', {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: req.headers,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    responseTime,
    timestamp: new Date().toISOString()
  });

  // Passa l'errore al prossimo middleware
  next(err);
};

/**
 * Middleware per il logging delle metriche di performance
 */
export const elkPerformanceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.ELK_ENABLED !== 'true') {
    return next();
  }

  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000; // Converti in millisecondi
    
    // Log delle metriche di performance
    ELKService.info('Performance metrics', {
      type: 'performance',
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  });
  
  next();
};

export default {
  elkLoggingMiddleware,
  elkErrorMiddleware,
  elkPerformanceMiddleware
};

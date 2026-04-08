import swaggerJsdoc from 'swagger-jsdoc';
import dotenv from 'dotenv';

dotenv.config();

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DuxIter API Documentation',
      version: '1.0.0',
      description: 'API documentation for DuxIter - Provider Evaluation Platform',
      contact: {
        name: 'API Support',
        email: process.env.SUPPORT_EMAIL || 'support@duxiter.com'
      }
    },
    servers: [
      {
        url: 'https://duxiter.azurianlab.com',
        description: 'Production server'
      },
      {
        url: 'http://localhost:3020/api',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: [
    './src/routes/*.ts',
    './src/models/*.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { TextEncoder, TextDecoder } from 'util';

// Polyfills for Node.js environment
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock process.env for tests
process.env.NODE_ENV = 'test';
process.env.VITE_JWT_SECRET = 'test-jwt-secret';
process.env.VITE_JWT_EXPIRES_IN = '1h';
process.env.SENDGRID_API_KEY = 'test-sendgrid-key';
process.env.SENDGRID_FROM_EMAIL = 'test@example.com';

// Mock external services
jest.mock('../services/elkService', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logRequest: jest.fn(),
    logBusinessEvent: jest.fn(),
    logSystemError: jest.fn(),
    checkElasticsearchHealth: jest.fn().mockResolvedValue(true),
    isELKEnabled: jest.fn().mockReturnValue(false),
  },
}), { virtual: true });

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

jest.mock('../services/notificationService', () => ({
  NotificationService: {
    getInstance: jest.fn().mockReturnValue({
      sendRiskChangeNotification: jest.fn().mockResolvedValue(true),
      sendBulkNotification: jest.fn().mockResolvedValue({ success: [], failed: [] }),
      getTenantNotificationEmails: jest.fn().mockResolvedValue([]),
      testConfiguration: jest.fn().mockResolvedValue(true),
    }),
  },
}), { virtual: true });

// Global test database setup
let mongoServer: MongoMemoryServer;
const shouldStartMongoMemoryServer = process.env.SKIP_MONGO_MEMORY_SERVER !== 'true';

beforeAll(async () => {
  if (!shouldStartMongoMemoryServer) {
    return;
  }

  // Start in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to the in-memory database
  await mongoose.connect(mongoUri);
});

beforeEach(async () => {
  if (!shouldStartMongoMemoryServer || mongoose.connection.readyState !== 1) {
    return;
  }

  // Clear all collections before each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  if (!shouldStartMongoMemoryServer || !mongoServer || mongoose.connection.readyState === 0) {
    return;
  }

  // Cleanup
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
});

// Helper function to create test user
export const createTestUser = async (userData = {}) => {
  const { User } = require('../models/user.model');
  const defaultUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'evaluator',
    tenant: new mongoose.Types.ObjectId(),
    isActive: false, // Changed to reflect new default behavior
    ...userData,
  };
  return await User.create(defaultUser);
};

// Helper function to create test tenant
export const createTestTenant = async (tenantData = {}) => {
  const { Tenant } = require('../models/tenant.model');
  const defaultTenant = {
    name: 'Test Tenant',
    settings: {},
    usageStats: {
      evaluationsRemaining: 100,
      evaluationsUsed: 0,
      lastEvaluationDate: null,
    },
    creditBalance: {
      availableCredits: 100,
      totalCreditsUsed: 0,
      lastCreditOperation: null,
    },
    ...tenantData,
  };
  return await Tenant.create(defaultTenant);
};

// Helper function to generate JWT token for testing
export const generateTestToken = (userId: string, role = 'user') => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId, role },
    process.env.VITE_JWT_SECRET,
    { expiresIn: process.env.VITE_JWT_EXPIRES_IN }
  );
};

// Mock request object for testing
export const createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ...overrides,
});

// Mock response object for testing
export const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

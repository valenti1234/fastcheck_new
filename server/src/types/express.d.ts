import 'express';

declare global {
  namespace Express {
    interface User {
      _id: string;
      id: string;
      email: string;
      role: string;
      tenant: string;
    }

    interface Request {
      user?: User;
      tenantId?: string;
    }
  }
}

export {};
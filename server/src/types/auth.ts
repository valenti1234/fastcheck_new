import { Request } from 'express';

export interface User {
  _id: string;
  id: string;
  email: string;
  role: string;
  tenant: string;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  tenantId?: string;
}
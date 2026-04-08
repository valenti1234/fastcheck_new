import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { Tenant } from '../models/tenant.model';

const JWT_SECRET = process.env.VITE_JWT_SECRET || 'your-secret-key';

// Types are augmented centrally in src/types/express.d.ts

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      console.log(`[Auth] 401: No token provided for ${req.method} ${req.url}`);
      return res.status(401).json({ message: 'No token provided' });
    }

    // Assuming JWT payload has 'id', 'email', 'role', 'tenant'
    const decodedPayload = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
      tenant: string;
    };

    // Check if user is active
    const user = await User.findById(decodedPayload.id);
    if (!user || !user.isActive) {
      console.log(`[Auth] 403: User inactive or not found for ${decodedPayload.email}`);
      return res.status(403).json({ 
        message: 'Account not activated. Please wait for superadmin approval.',
        code: 'ACCOUNT_NOT_ACTIVATED'
      });
    }

    // Check if tenant is active (skip for superuser)
    if (decodedPayload.role !== 'superuser') {
      const tenant = await Tenant.findById(decodedPayload.tenant);
      if (!tenant || !tenant.isActive) {
        console.log(`[Auth] 403: Tenant inactive or not found for ${decodedPayload.tenant}`);
        return res.status(403).json({ 
          message: 'Tenant not activated. Please wait for superadmin approval.',
          code: 'TENANT_NOT_ACTIVATED'
        });
      }
    }

    // Map JWT payload to the req.user structure, ensuring _id is present
    req.user = {
      _id: decodedPayload.id, // Map id to _id
      id: decodedPayload.id,
      email: decodedPayload.email,
      role: decodedPayload.role,
      tenant: decodedPayload.tenant,
    };
    next();
  } catch (error) {
    console.error(`[Auth] 401: Authentication error for ${req.method} ${req.url}:`, error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    next();
  };
};
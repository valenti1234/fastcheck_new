import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { Tenant } from '../models/tenant.model';
import elkService from '../services/elkService';

// Use environment variables consistently
const JWT_SECRET = (process.env.VITE_JWT_SECRET || 'your-secret-key') as string;
const JWT_EXPIRES_IN = (process.env.VITE_JWT_EXPIRES_IN || '7d') as string;

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      elkService.logBusinessEvent('auth_current_user_failed', {
        reason: 'not_authenticated',
        ip: req.ip
      });
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Log current user request
    elkService.logBusinessEvent('auth_current_user_requested', {
      userId,
      ip: req.ip
    }, userId);

    const user = await User.findById(userId).select('-password');
    if (!user) {
      elkService.logBusinessEvent('auth_current_user_failed', {
        userId,
        reason: 'user_not_found',
        ip: req.ip
      }, userId);
      return res.status(404).json({ message: 'User not found' });
    }

    // Log successful current user fetch
    elkService.logBusinessEvent('auth_current_user_fetched', {
      userId,
      userEmail: user.email,
      userRole: user.role,
      ip: req.ip
    }, userId, user.tenant?.toString());

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'auth_current_user',
      { userId: req.user?.id, ip: req.ip }
    );
    res.status(500).json({ message: 'Error fetching user data' });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    // Log registration attempt
    elkService.logBusinessEvent('auth_registration_attempted', {
      email,
      name,
      ip: req.ip
    });

    // Validate input
    if (!name || !email || !password) {
      elkService.logBusinessEvent('auth_registration_failed', {
        email,
        reason: 'missing_required_fields',
        ip: req.ip
      });
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      elkService.logBusinessEvent('auth_registration_failed', {
        email,
        reason: 'user_already_exists',
        ip: req.ip
      });
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create a default tenant for the user
    const tenant = await Tenant.create({
      name: `${name}'s Organization`,
      settings: {}
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user with tenant reference (inactive by default, requires superadmin activation)
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'tenant_admin', // First user of a tenant is admin
      tenant: tenant._id,
      isActive: false, // Requires superadmin activation
      oauthProvider: 'local',
      oauthId: email // Use email as unique identifier for local users
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        role: user.role,
        tenant: tenant._id 
      },
      JWT_SECRET as jwt.Secret,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    // Log successful registration
    elkService.logBusinessEvent('auth_registration_successful', {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: tenant._id,
      tenantName: tenant.name,
      ip: req.ip
    }, user._id.toString(), tenant._id.toString());

    // Return user data (excluding password) and token
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.status(201).json({
      user: userResponse,
      token,
      message: 'Registrazione completata con successo. Il tuo account è in attesa di attivazione da parte del superadmin. Riceverai una notifica quando il tuo account sarà attivato.',
      activationStatus: 'pending'
    });
  } catch (error) {
    console.error('Registration error:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'auth_registration',
      { email: req.body.email, ip: req.ip }
    );
    res.status(500).json({ message: 'Error registering user' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Log login attempt
    elkService.logBusinessEvent('auth_login_attempted', {
      email,
      ip: req.ip
    });

    // Validate input
    if (!email || !password) {
      elkService.logBusinessEvent('auth_login_failed', {
        email,
        reason: 'missing_credentials',
        ip: req.ip
      });
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      elkService.logBusinessEvent('auth_login_failed', {
        email,
        reason: 'user_not_found',
        ip: req.ip
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      elkService.logBusinessEvent('auth_login_failed', {
        email,
        userId: user._id,
        reason: 'account_inactive',
        ip: req.ip
      }, user._id.toString(), user.tenant?.toString());
      return res.status(401).json({ 
        message: 'Tu cuenta está pendiente de activación por parte del superadministrador. Contacta al administrador para completar la activación.',
        activationStatus: 'pending'
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      elkService.logBusinessEvent('auth_login_failed', {
        email,
        userId: user._id,
        reason: 'invalid_password',
        ip: req.ip
      }, user._id.toString(), user.tenant?.toString());
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role,
        tenant: user.tenant 
      },
      JWT_SECRET as jwt.Secret,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    // Log successful login
    elkService.logBusinessEvent('auth_login_successful', {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenant,
      ip: req.ip
    }, user._id.toString(), user.tenant?.toString());

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'auth_login',
      { email: req.body.email, ip: req.ip }
    );
    res.status(500).json({ message: 'Server error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    // Log logout event
    elkService.logBusinessEvent('auth_logout', {
      userId: userId || 'unknown',
      ip: req.ip
    }, userId);

    res.json({ 
      success: true,
      message: 'Logout successful' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'auth_logout',
      { userId: req.user?.id, ip: req.ip }
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};
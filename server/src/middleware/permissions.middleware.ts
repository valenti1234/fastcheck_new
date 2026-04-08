import { Request, Response, NextFunction } from 'express';

// Define permission types
export enum Permission {
  // User management
  USER_CREATE = 'user:create',
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  
  // Evaluation permissions
  EVALUATION_CREATE = 'evaluation:create',
  EVALUATION_READ = 'evaluation:read',
  EVALUATION_UPDATE = 'evaluation:update',
  EVALUATION_DELETE = 'evaluation:delete',
  EVALUATION_BULK = 'evaluation:bulk',
  
  // Company data permissions
  COMPANY_READ = 'company:read',
  COMPANY_UPDATE = 'company:update',
  
  // RUT/Sheriff data permissions
  RUT_LOOKUP = 'rut:lookup',
  RUT_READ = 'rut:read',
  SHERIFF_LOGS_READ = 'sheriff:logs:read',
  
  // Monitoring permissions
  MONITORING_CREATE = 'monitoring:create',
  MONITORING_READ = 'monitoring:read',
  MONITORING_UPDATE = 'monitoring:update',
  MONITORING_DELETE = 'monitoring:delete',
  MONITORING_EXECUTE = 'monitoring:execute',
  
  // Tenant management
  TENANT_READ = 'tenant:read',
  TENANT_UPDATE = 'tenant:update',
  TENANT_USERS_MANAGE = 'tenant:users:manage',
  
  // Admin permissions
  ADMIN_DASHBOARD = 'admin:dashboard',
  ADMIN_SETTINGS = 'admin:settings',
  ADMIN_LOGS = 'admin:logs',
  
  // Notification permissions
  NOTIFICATION_READ = 'notification:read',
  NOTIFICATION_CREATE = 'notification:create',
}

// Role-based permission mapping
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  superuser: [
    // Superuser has all permissions
    ...Object.values(Permission)
  ],
  
  tenant_admin: [
    // User management within tenant
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    
    // Full evaluation access
    Permission.EVALUATION_CREATE,
    Permission.EVALUATION_READ,
    Permission.EVALUATION_UPDATE,
    Permission.EVALUATION_DELETE,
    Permission.EVALUATION_BULK,
    
    // Company data access
    Permission.COMPANY_READ,
    Permission.COMPANY_UPDATE,
    
    // RUT/Sheriff data access
    Permission.RUT_LOOKUP,
    Permission.RUT_READ,
    Permission.SHERIFF_LOGS_READ,
    
    // Full monitoring access
    Permission.MONITORING_CREATE,
    Permission.MONITORING_READ,
    Permission.MONITORING_UPDATE,
    Permission.MONITORING_DELETE,
    Permission.MONITORING_EXECUTE,
    
    // Tenant management
    Permission.TENANT_READ,
    Permission.TENANT_UPDATE,
    Permission.TENANT_USERS_MANAGE,
    
    // Admin dashboard access for tenant admins
    Permission.ADMIN_DASHBOARD,
    
    // Notifications
    Permission.NOTIFICATION_READ,
    Permission.NOTIFICATION_CREATE,
  ],
  
  evaluator: [
    // Basic user read access
    Permission.USER_READ,
    
    // Full evaluation access
    Permission.EVALUATION_CREATE,
    Permission.EVALUATION_READ,
    Permission.EVALUATION_UPDATE,
    Permission.EVALUATION_DELETE,
    Permission.EVALUATION_BULK,
    
    // Company data read access
    Permission.COMPANY_READ,
    
    // RUT/Sheriff data access
    Permission.RUT_LOOKUP,
    Permission.RUT_READ,
    Permission.SHERIFF_LOGS_READ,
    
    // Monitoring read and create
    Permission.MONITORING_CREATE,
    Permission.MONITORING_READ,
    Permission.MONITORING_UPDATE,
    Permission.MONITORING_EXECUTE,
    
    // Basic tenant read
    Permission.TENANT_READ,
    
    // Notifications
    Permission.NOTIFICATION_READ,
  ],
  
  read_only: [
    // Read-only access to most data
    Permission.USER_READ,
    Permission.EVALUATION_READ,
    Permission.COMPANY_READ,
    Permission.RUT_READ,
    Permission.SHERIFF_LOGS_READ,
    Permission.MONITORING_READ,
    Permission.TENANT_READ,
    Permission.NOTIFICATION_READ,
  ],
  
  write_only: [
    // Can create but limited read access
    Permission.EVALUATION_CREATE,
    Permission.EVALUATION_READ, // Need to read own evaluations
    Permission.COMPANY_READ, // Need to read company data for evaluations
    Permission.RUT_LOOKUP, // Need to lookup RUT for evaluations
    Permission.MONITORING_CREATE,
    Permission.MONITORING_EXECUTE,
    Permission.NOTIFICATION_CREATE,
    Permission.TENANT_READ, // Basic tenant info
    Permission.TENANT_UPDATE, // Can update own tenant
  ],
};

// Helper function to check if user has permission
export const hasPermission = (userRole: string, permission: Permission): boolean => {
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  return rolePermissions.includes(permission);
};

// Helper function to check if user has any of the permissions
export const hasAnyPermission = (userRole: string, permissions: Permission[]): boolean => {
  return permissions.some(permission => hasPermission(userRole, permission));
};

// Helper function to check if user has all permissions
export const hasAllPermissions = (userRole: string, permissions: Permission[]): boolean => {
  return permissions.every(permission => hasPermission(userRole, permission));
};

// Middleware factory for permission checking
export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ 
        message: 'Forbidden: Insufficient permissions',
        required: permission,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Middleware factory for checking any of multiple permissions
export const requireAnyPermission = (permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!hasAnyPermission(req.user.role, permissions)) {
      return res.status(403).json({ 
        message: 'Forbidden: Insufficient permissions',
        required: permissions,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Middleware factory for checking all permissions
export const requireAllPermissions = (permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!hasAllPermissions(req.user.role, permissions)) {
      return res.status(403).json({ 
        message: 'Forbidden: Insufficient permissions',
        required: permissions,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Export role permissions for reference
export { ROLE_PERMISSIONS };
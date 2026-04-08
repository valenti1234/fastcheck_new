import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth';

/**
 * Middleware to ensure tenant isolation by automatically adding tenant filtering
 * to all requests. This middleware should be applied after authentication middleware
 * since it depends on req.user being populated with the authenticated user's information.
 */
export const tenantFilter = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Check if user is authenticated and has tenant information
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required: Tenant information missing'
    });
  }

  // Super admin bypass: skip tenant enforcement to allow cross-tenant visibility
  if (req.user.role === 'superuser') {
    // For backwards compatibility, keep tenantId available if present
    req.tenantId = req.user.tenant;
    return next();
  }
  
  if (!req.user.tenant) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required: Tenant information missing'
    });
  }
  
  // Add tenantId to req for easy access in controllers
  // This avoids having to extract it from req.user.tenant in every controller
  req.tenantId = req.user.tenant;
  
  // For GET requests, automatically add tenant filter to query parameters
  // This helps prevent accidentally querying data from other tenants
  if (req.method === 'GET') {
    req.query = {
      ...req.query,
      _tenantId: req.user.tenant
    };
  }
  
  // Log tenant access for audit purposes (optional)
  //console.log(`Tenant access: ${req.user.tenant} - ${req.method} ${req.path}`);
  
  next();
};

/**
 * Middleware to verify that a resource belongs to the current tenant
 * This can be used on routes that access resources by ID to ensure
 * that users can only access resources that belong to their tenant
 */
export const verifyTenantResource = (resourceFinder: (id: string) => Promise<any>) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required: Tenant information missing'
      });
    }

    // Super admin bypass: resource verification not required for superuser
    if (req.user.role === 'superuser') {
      return next();
    }
    
    if (!req.user.tenant) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required: Tenant information missing'
      });
    }
    
    // Get the resource ID from the request parameters
    const resourceId = req.params.id;
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID is required'
      });
    }
    
    try {
      // Find the resource
      const resource = await resourceFinder(resourceId);
      
      // If resource doesn't exist or doesn't belong to the current tenant
      if (!resource || resource.tenant.toString() !== req.user.tenant) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      
      // Add the resource to the request for use in the controller
      (req as any).resource = resource;
      next();
    } catch (error) {
      console.error('Error verifying tenant resource:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Internal server error' 
      });
    }
  };
};
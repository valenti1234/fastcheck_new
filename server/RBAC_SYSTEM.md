# Role-Based Access Control (RBAC) System

This document describes the comprehensive Role-Based Access Control (RBAC) system implemented in the Duxiter application.

## Overview

The RBAC system provides fine-grained access control through a permission-based approach, replacing the previous simple role-based authorization. This system allows for more flexible and secure access management across all application features.

## User Roles

The system defines five distinct user roles, each with specific permissions:

### 1. Superuser
- **Description**: Full system administrator with unrestricted access
- **Permissions**: All permissions in the system
- **Use Case**: System administrators, platform owners

### 2. Tenant Admin
- **Description**: Administrator within a specific tenant organization
- **Permissions**: Full access within their tenant scope
- **Use Case**: Organization administrators, department heads

### 3. Evaluator
- **Description**: Standard user who can perform evaluations and access most features
- **Permissions**: Evaluation operations, monitoring, basic tenant access
- **Use Case**: Risk analysts, compliance officers

### 4. Read Only
- **Description**: User with view-only access to data
- **Permissions**: Read access to evaluations, companies, RUT data, monitoring, notifications
- **Use Case**: Auditors, reporting users, stakeholders

### 5. Write Only
- **Description**: User who can create/update data but has limited read access
- **Permissions**: Create evaluations, update companies, RUT lookup, monitoring operations
- **Use Case**: Data entry personnel, automated systems

## Permission System

The system uses granular permissions organized by functional areas:

### User Management
- `USER_CREATE`: Create new users
- `USER_READ`: View user information
- `USER_UPDATE`: Modify user details
- `USER_DELETE`: Remove users

### Evaluation Operations
- `EVALUATION_CREATE`: Create single evaluations
- `EVALUATION_READ`: View evaluation results
- `EVALUATION_UPDATE`: Modify evaluations
- `EVALUATION_DELETE`: Remove evaluations
- `EVALUATION_BULK`: Perform bulk evaluation operations

### Company Data
- `COMPANY_READ`: View company information
- `COMPANY_UPDATE`: Modify company data

### RUT Operations
- `RUT_LOOKUP`: Perform RUT lookups
- `RUT_READ`: View RUT-related data and results

### Sheriff Logs
- `SHERIFF_LOGS_READ`: Access Sheriff API logs and data

### Monitoring
- `MONITORING_CREATE`: Create monitoring schedules
- `MONITORING_READ`: View monitoring data
- `MONITORING_UPDATE`: Modify monitoring settings
- `MONITORING_DELETE`: Remove monitoring schedules
- `MONITORING_EXECUTE`: Execute monitoring tasks

### Tenant Management
- `TENANT_READ`: View tenant information
- `TENANT_UPDATE`: Modify tenant settings
- `TENANT_USERS_MANAGE`: Manage users within tenant

### Administrative
- `ADMIN_DASHBOARD`: Access administrative features
- `ADMIN_SETTINGS`: Modify system settings
- `ADMIN_LOGS`: Access system logs

### Notifications
- `NOTIFICATION_READ`: View notifications
- `NOTIFICATION_CREATE`: Send notifications

## Implementation

### Backend Middleware

The permission system is implemented through middleware functions:

```typescript
// Single permission check
requirePermission(Permission.USER_CREATE)

// Multiple permissions (any one required)
requireAnyPermission([Permission.USER_READ, Permission.USER_UPDATE])

// Multiple permissions (all required)
requireAllPermissions([Permission.USER_READ, Permission.TENANT_READ])
```

### Route Protection

All API routes are protected with appropriate permission checks:

```typescript
// Example: User management route
router.post('/users', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.USER_CREATE), 
  createUser
);
```

### Frontend Integration

The frontend receives user role information through the authentication context and can conditionally render UI elements based on user permissions.

## Role-Permission Matrix

| Permission | Superuser | Tenant Admin | Evaluator | Read Only | Write Only |
|------------|-----------|--------------|-----------|-----------|------------|
| USER_CREATE | ✓ | ✓ | ✗ | ✗ | ✗ |
| USER_READ | ✓ | ✓ | ✓ | ✓ | ✗ |
| EVALUATION_CREATE | ✓ | ✓ | ✓ | ✗ | ✓ |
| EVALUATION_READ | ✓ | ✓ | ✓ | ✓ | ✓ |
| COMPANY_READ | ✓ | ✓ | ✓ | ✓ | ✓ |
| RUT_LOOKUP | ✓ | ✓ | ✓ | ✗ | ✓ |
| MONITORING_CREATE | ✓ | ✓ | ✓ | ✗ | ✓ |
| ADMIN_DASHBOARD | ✓ | ✗ | ✗ | ✗ | ✗ |
| TENANT_USERS_MANAGE | ✓ | ✓ | ✗ | ✗ | ✗ |

## Security Considerations

1. **Principle of Least Privilege**: Users are granted only the minimum permissions necessary for their role
2. **Tenant Isolation**: All operations are scoped to the user's tenant (except superuser)
3. **Permission Validation**: Every API endpoint validates permissions before processing requests
4. **Role Inheritance**: Higher-level roles include permissions from lower-level roles where appropriate

## Migration from Previous System

The new RBAC system replaces the previous simple role-based authorization:

- **Before**: `authorize(['superuser', 'tenant_admin'])`
- **After**: `requirePermission(Permission.USER_CREATE)`

This change provides:
- More granular control
- Better separation of concerns
- Easier permission management
- Improved security

## Usage Examples

### Creating a New User Role

1. Add the role to the `UserRole` enum in the user model
2. Define permissions for the role in `ROLE_PERMISSIONS` mapping
3. Update frontend type definitions
4. Test the new role's access patterns

### Adding a New Permission

1. Add the permission to the `Permission` enum
2. Assign it to appropriate roles in `ROLE_PERMISSIONS`
3. Apply the permission to relevant routes
4. Update documentation

### Checking Permissions in Controllers

```typescript
import { hasPermission, Permission } from '../middleware/permissions.middleware';

// In controller function
if (!hasPermission(req.user.role, Permission.USER_DELETE)) {
  return res.status(403).json({ error: 'Insufficient permissions' });
}
```

## Troubleshooting

### Common Issues

1. **403 Forbidden Errors**: Check if the user's role has the required permission
2. **Missing Permissions**: Verify the permission is defined and assigned to the role
3. **Route Access Issues**: Ensure the correct permission middleware is applied to routes

### Debugging

Enable debug logging to trace permission checks:

```typescript
console.log('User role:', req.user.role);
console.log('Required permission:', permission);
console.log('Has permission:', hasPermission(req.user.role, permission));
```

## Future Enhancements

1. **Dynamic Permissions**: Allow runtime permission assignment
2. **Resource-Level Permissions**: Permissions on specific resources (e.g., specific evaluations)
3. **Time-Based Permissions**: Temporary permission grants
4. **Audit Logging**: Track all permission checks and access attempts
5. **Permission Groups**: Logical grouping of related permissions

## Conclusion

The new RBAC system provides a robust, scalable, and secure foundation for access control in the Duxiter application. It enables fine-grained permission management while maintaining simplicity for common use cases.
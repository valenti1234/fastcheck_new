import { Response } from 'express';
import { User } from '../models/user.model';
import bcrypt from 'bcryptjs';
import { AuthenticatedRequest } from '../types/auth';
import elkService from '../services/elkService';

// Get all users in tenant
export const getTenantUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('Fetching users - Auth:', {
      user: req.user,
      headers: req.headers,
      query: req.query
    });

    // The tenant middleware ensures req.user and req.tenantId exist
    // and adds _tenantId to query params, so we don't need to check here
    const tenantId = req.tenantId;

    // Log the user fetch operation
    elkService.logBusinessEvent('user_list_requested', {
      tenantId,
      requestedBy: req.user!.id,
      filters: req.query
    }, req.user!.id, tenantId);

    // Build query
    const query: any = { tenant: tenantId };
    
    if (req.query.role) {
      query.role = req.query.role;
    }
    
    if (req.query.status === 'active') {
      query.isActive = true;
    } else if (req.query.status === 'inactive') {
      query.isActive = false;
    }

    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    console.log('Fetching users with query:', query);

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    console.log(`Found ${users.length} users`);

    const formattedUsers = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    }));

    // Log successful user fetch
    elkService.logBusinessEvent('user_list_fetched', {
      tenantId,
      requestedBy: req.user!.id,
      userCount: formattedUsers.length,
      filters: req.query
    }, req.user!.id, tenantId);

    // Return in the format expected by the frontend
    return res.json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length,
      pages: 1 // Since we're not implementing pagination yet
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    
    // Log the error
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'user_list_fetch',
      { tenantId: req.tenantId, requestedBy: req.user?.id }
    );
    
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Add new user to tenant
export const addTenantUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, password, role } = req.body;
    // The tenant middleware ensures req.tenantId exists
    const tenantId = req.tenantId;

    // Log user creation attempt
    elkService.logBusinessEvent('user_creation_attempted', {
      tenantId,
      createdBy: req.user!.id,
      targetUserEmail: email,
      targetUserRole: role
    }, req.user!.id, tenantId);

    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      elkService.logBusinessEvent('user_creation_failed', {
        tenantId,
        createdBy: req.user!.id,
        targetUserEmail: email,
        reason: 'email_already_exists'
      }, req.user!.id, tenantId);
      
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      tenant: tenantId,
      isActive: true,
      oauthProvider: 'local',
      oauthId: email // Use email as unique identifier for local users
    });

    await user.save();

    // Log successful user creation
    elkService.logBusinessEvent('user_created', {
      tenantId,
      createdBy: req.user!.id,
      newUserId: user._id.toString(),
      newUserEmail: user.email,
      newUserRole: user.role
    }, req.user!.id, tenantId);

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    });
  } catch (error) {
    console.error('Error creating user:', error);
    
    // Log the error
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'user_creation',
      { tenantId: req.tenantId, createdBy: req.user?.id, targetUserEmail: req.body?.email }
    );
    
    res.status(500).json({ message: 'Failed to create user' });
  }
};

// Update user
export const updateTenantUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;
    // The tenant middleware ensures req.tenantId exists
    const tenantId = req.tenantId;

    // Log user update attempt
    elkService.logBusinessEvent('user_update_attempted', {
      tenantId,
      updatedBy: req.user!.id,
      targetUserId: id,
      updateData: { name, email, role }
    }, req.user!.id, tenantId);

    // Find user and ensure they belong to the tenant
    const user = await User.findOne({ _id: id, tenant: tenantId });
    if (!user) {
      elkService.logBusinessEvent('user_update_failed', {
        tenantId,
        updatedBy: req.user!.id,
        targetUserId: id,
        reason: 'user_not_found'
      }, req.user!.id, tenantId);
      
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is being changed and if it's already in use
    if (email !== user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: id } });
      if (existingUser) {
        elkService.logBusinessEvent('user_update_failed', {
          tenantId,
          updatedBy: req.user!.id,
          targetUserId: id,
          reason: 'email_already_in_use',
          conflictingEmail: email
        }, req.user!.id, tenantId);
        
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Store original values for logging
    const originalData = {
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Update user
    user.name = name;
    user.email = email;
    user.role = role;

    await user.save();

    // Log successful user update
    elkService.logBusinessEvent('user_updated', {
      tenantId,
      updatedBy: req.user!.id,
      targetUserId: id,
      originalData,
      newData: { name, email, role }
    }, req.user!.id, tenantId);

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    });
  } catch (error) {
    console.error('Error updating user:', error);
    
    // Log the error
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'user_update',
      { tenantId: req.tenantId, updatedBy: req.user?.id, targetUserId: req.params?.id }
    );
    
    res.status(500).json({ message: 'Failed to update user' });
  }
};

// Toggle user active status
export const toggleUserStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    // The tenant middleware ensures req.tenantId exists
    const tenantId = req.tenantId;

    // Log user status toggle attempt
    elkService.logBusinessEvent('user_status_toggle_attempted', {
      tenantId,
      toggledBy: req.user!.id,
      targetUserId: id
    }, req.user!.id, tenantId);

    // Find user and ensure they belong to the tenant
    const user = await User.findOne({ _id: id, tenant: tenantId });
    if (!user) {
      elkService.logBusinessEvent('user_status_toggle_failed', {
        tenantId,
        toggledBy: req.user!.id,
        targetUserId: id,
        reason: 'user_not_found'
      }, req.user!.id, tenantId);
      
      return res.status(404).json({ message: 'User not found' });
    }

    // Store original status for logging
    const originalStatus = user.isActive;

    // Toggle status
    user.isActive = !user.isActive;
    await user.save();

    // Log successful status toggle
    elkService.logBusinessEvent('user_status_toggled', {
      tenantId,
      toggledBy: req.user!.id,
      targetUserId: id,
      originalStatus,
      newStatus: user.isActive
    }, req.user!.id, tenantId);

    res.json({
      id: user._id,
      isActive: user.isActive
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    
    // Log the error
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'user_status_toggle',
      { tenantId: req.tenantId, toggledBy: req.user?.id, targetUserId: req.params?.id }
    );
    
    res.status(500).json({ message: 'Failed to toggle user status' });
  }
};

// Get all users for superadmin (across all tenants)
export const getAllUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Log superadmin user list access
    elkService.logBusinessEvent('superadmin_users_list_accessed', {
      accessedBy: req.user!.id
    }, req.user!.id, 'system');

    // Get all users with tenant information
    const users = await User.find({})
      .populate('tenant', 'name')
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error('Error fetching all users:', error);
    
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'superadmin_users_list',
      { accessedBy: req.user?.id }
    );
    
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// Reset user password for superadmin
export const resetUserPassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Log password reset attempt
    elkService.logBusinessEvent('superadmin_password_reset_attempted', {
      resetBy: req.user!.id,
      targetUserId: id
    }, req.user!.id, 'system');

    // Find user
    const user = await User.findById(id);
    if (!user) {
      elkService.logBusinessEvent('superadmin_password_reset_failed', {
        resetBy: req.user!.id,
        targetUserId: id,
        reason: 'user_not_found'
      }, req.user!.id, 'system');
      
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    // Log successful password reset
    elkService.logBusinessEvent('superadmin_password_reset_successful', {
      resetBy: req.user!.id,
      targetUserId: id,
      targetUserEmail: user.email,
      targetUserTenant: user.tenant
    }, req.user!.id, 'system');

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting user password:', error);
    
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'superadmin_password_reset',
      { resetBy: req.user?.id, targetUserId: req.params?.id }
    );
    
    res.status(500).json({ message: 'Failed to reset password' });
  }
};

// Update user for superadmin (across all tenants)
export const updateUserBySuperAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    // Log user update attempt
    elkService.logBusinessEvent('superadmin_user_update_attempted', {
      updatedBy: req.user!.id,
      targetUserId: id,
      updateData: { name, email, role }
    }, req.user!.id, 'system');

    // Find user
    const user = await User.findById(id);
    if (!user) {
      elkService.logBusinessEvent('superadmin_user_update_failed', {
        updatedBy: req.user!.id,
        targetUserId: id,
        reason: 'user_not_found'
      }, req.user!.id, 'system');
      
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is being changed and if it's already in use
    if (email !== user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: id } });
      if (existingUser) {
        elkService.logBusinessEvent('superadmin_user_update_failed', {
          updatedBy: req.user!.id,
          targetUserId: id,
          reason: 'email_already_in_use',
          conflictingEmail: email
        }, req.user!.id, 'system');
        
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Store original values for logging
    const originalData = {
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Update user
    user.name = name;
    user.email = email;
    user.role = role;

    await user.save();

    // Log successful user update
    elkService.logBusinessEvent('superadmin_user_updated', {
      updatedBy: req.user!.id,
      targetUserId: id,
      targetUserTenant: user.tenant,
      originalData,
      newData: { name, email, role }
    }, req.user!.id, 'system');

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    });
  } catch (error) {
    console.error('Error updating user:', error);
    
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'superadmin_user_update',
      { updatedBy: req.user?.id, targetUserId: req.params?.id }
    );
    
    res.status(500).json({ message: 'Failed to update user' });
  }
};

// Superadmin function to activate users across all tenants
export const superAdminToggleUserStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Only superusers can use this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Access denied. Superuser role required.' });
    }

    // Log superadmin user status toggle attempt
    elkService.logBusinessEvent('superadmin_user_status_toggle_attempted', {
      toggledBy: req.user!.id,
      targetUserId: id
    }, req.user!.id, 'system');

    // Find user across all tenants (no tenant restriction)
    const user = await User.findById(id);
    if (!user) {
      elkService.logBusinessEvent('superadmin_user_status_toggle_failed', {
        toggledBy: req.user!.id,
        targetUserId: id,
        reason: 'user_not_found'
      }, req.user!.id, 'system');
      
      return res.status(404).json({ message: 'User not found' });
    }

    // Store original status for logging
    const originalStatus = user.isActive;

    // Toggle status
    user.isActive = !user.isActive;
    await user.save();

    // Log successful status toggle
    elkService.logBusinessEvent('superadmin_user_status_toggled', {
      toggledBy: req.user!.id,
      targetUserId: id,
      targetUserTenant: user.tenant,
      originalStatus,
      newStatus: user.isActive
    }, req.user!.id, 'system');

    res.json({
      id: user._id,
      isActive: user.isActive,
      message: user.isActive ? 'User activated successfully' : 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Error in superadmin toggle user status:', error);
    
    // Log the error
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'superadmin_user_status_toggle',
      { toggledBy: req.user?.id, targetUserId: req.params?.id }
    );
    
    res.status(500).json({ message: 'Failed to toggle user status' });
  }
};
import { User, IUser } from '../models/user.model'; // Import IUser
import bcrypt from 'bcryptjs'; // Import bcrypt
import elkService from './elkService';

export class UserService {
  static async getProfile(userId: string) {
    return User.findById(userId);
  }

  static async findUsers(filter: { tenantId: string }) {
    return User.find(filter);
  }

  static async countDocuments(filter: { tenantId: string }) {
    return User.countDocuments(filter);
  }

  static async createUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId: string;
  }) {
    return User.create(userData);
  }

  static async updateUser(userId: string, updateData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
  }) {
    return User.findByIdAndUpdate(userId, updateData, { new: true });
  }

  static async deleteUser(userId: string, deletedBy?: string, tenantId?: string) {
    try {
      // Find user before deletion to log details
      const user = await User.findById(userId);
      if (!user) {
        if (deletedBy && tenantId) {
          elkService.logBusinessEvent('user_deletion_failed', {
            tenantId,
            deletedBy,
            targetUserId: userId,
            reason: 'user_not_found'
          }, deletedBy, tenantId);
        }
        return null;
      }

      // Log user deletion attempt
      if (deletedBy && tenantId) {
        elkService.logBusinessEvent('user_deletion_attempted', {
          tenantId,
          deletedBy,
          targetUserId: userId,
          targetUserEmail: user.email,
          targetUserRole: user.role
        }, deletedBy, tenantId);
      }

      const result = await User.findByIdAndDelete(userId);
      
      if (result && deletedBy && tenantId) {
        // Log successful user deletion
        elkService.logBusinessEvent('user_deleted', {
          tenantId,
          deletedBy,
          deletedUserId: userId,
          deletedUserEmail: user.email,
          deletedUserRole: user.role
        }, deletedBy, tenantId);
      }
      
      return result;
    } catch (error) {
      if (deletedBy && tenantId) {
        elkService.logSystemError(
          error instanceof Error ? error : new Error('Unknown error'),
          'user_deletion',
          { tenantId, deletedBy, targetUserId: userId }
        );
      }
      throw error;
    }
  }

  static async updateProfile(userId: string, updateData: Partial<IUser>) {
    try {
      // Prevent updating sensitive fields
      const { password, role, email, ...safeUpdateData } = updateData as any;

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: safeUpdateData },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash the new password before saving
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      
      await user.save();

      return { message: 'Password updated successfully' };
    } catch (error) {
      throw error;
    }
  }
}
import mongoose, { Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: 'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only';
  tenant: mongoose.Types.ObjectId;
  isActive: boolean;
  // OAuth fields
  oauthProvider?: 'google' | 'microsoft' | 'local';
  oauthId?: string;
  profilePicture?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function(this: IUser) {
      // Password is required only for local authentication
      return !this.oauthProvider || this.oauthProvider === 'local';
    },
    minlength: 6
  },
  oauthProvider: {
    type: String,
    enum: ['google', 'microsoft', 'local'],
    default: 'local'
  },
  oauthId: {
    type: String,
    sparse: true // Allows multiple null values but enforces uniqueness for non-null values
  },
  profilePicture: {
    type: String
  },
  role: {
    type: String,
    enum: ['superuser', 'tenant_admin', 'evaluator', 'read_only', 'write_only'],
    default: 'evaluator'
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Add password comparison method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false; // OAuth users don't have passwords
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Add compound index for OAuth provider and ID
// Ensure uniqueness only when oauthId is present; allow multiple nulls for local users
userSchema.index(
  { oauthProvider: 1, oauthId: 1 },
  {
    unique: true,
    partialFilterExpression: { oauthId: { $type: 'string' } }
  }
);

// Check if the model exists before creating it
export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
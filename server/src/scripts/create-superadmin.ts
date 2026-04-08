import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/user.model';
import { Tenant } from '../models/tenant.model';
import { connectDB } from '../config/database';

interface CreateSuperAdminData {
  name: string;
  email: string;
  password: string;
}

const createSuperAdmin = async (data: CreateSuperAdminData) => {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to database');

    // Check if superadmin already exists
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      console.log(`User with email ${data.email} already exists`);
      return;
    }

    // Find or create System tenant
    let systemTenant = await Tenant.findOne({ name: 'System' });
    if (!systemTenant) {
      console.log('Creating System tenant...');
      systemTenant = new Tenant({
        name: 'System',
        isActive: true,
        settings: {},
        usageStats: {
          evaluationsRemaining: 1000000, // High limit for system
          evaluationsUsed: 0
        },
        creditBalance: {
          availableCredits: 1000000, // High limit for system
          totalCreditsUsed: 0
        }
      });
      await systemTenant.save();
      console.log('System tenant created');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

    // Create superadmin user
    const superAdmin = new User({
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role: 'superuser',
      tenant: systemTenant._id,
      permissions: [
        'USER_READ',
        'USER_WRITE',
        'USER_DELETE',
        'TENANT_READ',
        'TENANT_WRITE',
        'TENANT_DELETE',
        'EVALUATION_READ',
        'EVALUATION_WRITE',
        'EVALUATION_DELETE',
        'MONITORING_READ',
        'SYSTEM_ADMIN'
      ],
      isActive: true,
      emailVerified: true
    });

    await superAdmin.save();
    console.log(`Superadmin user created successfully:`);
    console.log(`Name: ${data.name}`);
    console.log(`Email: ${data.email}`);
    console.log(`Role: superuser`);
    
  } catch (error) {
    console.error('Error creating superadmin:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Default superadmin data
const defaultSuperAdmin = {
  name: 'Super Administrator',
  email: 'superadmin@gmail.com',
  password: 'SuperAdmin3465#'
};

// Run the script
createSuperAdmin(defaultSuperAdmin)
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
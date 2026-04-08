const mongoose = require('mongoose');

const MonitoringScheduleSchema = new mongoose.Schema({
  rut: String,
  tenantId: String,
  userId: String,
  companyName: String,
  frequency: String,
  isActive: Boolean,
  lastExecuted: Date,
  nextExecution: Date,
  executionCount: Number,
  lastExecutionStatus: String,
  lastExecutionError: String,
  lastLogId: String
}, { timestamps: true });

const MonitoringSchedule = mongoose.model('MonitoringSchedule', MonitoringScheduleSchema);

async function createTestData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/duxiter');
    console.log('Connected to MongoDB');
    
    // Clear existing data
    await MonitoringSchedule.deleteMany({});
    console.log('Cleared existing monitoring schedules');
    
    // Create test data for multiple tenants
    const testSchedules = [
      {
        rut: '12345678-9',
        tenantId: '507f1f77bcf86cd799439011',
        userId: 'user1',
        companyName: 'Empresa Test 1',
        frequency: 'daily',
        isActive: true,
        nextExecution: new Date(Date.now() + 24 * 60 * 60 * 1000),
        executionCount: 15,
        lastExecutionStatus: 'success',
        lastExecuted: new Date(Date.now() - 24 * 60 * 60 * 1000)
      },
      {
        rut: '98765432-1',
        tenantId: '507f1f77bcf86cd799439011',
        userId: 'user1',
        companyName: 'Empresa Test 2',
        frequency: 'weekly',
        isActive: false,
        nextExecution: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        executionCount: 8,
        lastExecutionStatus: 'error',
        lastExecutionError: 'Connection timeout',
        lastExecuted: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        rut: '11111111-1',
        tenantId: '507f1f77bcf86cd799439012',
        userId: 'user2',
        companyName: 'Empresa Tenant 2',
        frequency: 'monthly',
        isActive: true,
        nextExecution: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        executionCount: 3,
        lastExecutionStatus: 'success',
        lastExecuted: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      },
      {
        rut: '22222222-2',
        tenantId: '507f1f77bcf86cd799439012',
        userId: 'user2',
        companyName: 'Otra Empresa T2',
        frequency: 'daily',
        isActive: true,
        nextExecution: new Date(Date.now() + 24 * 60 * 60 * 1000),
        executionCount: 25,
        lastExecutionStatus: 'pending',
        lastExecuted: new Date(Date.now() - 12 * 60 * 60 * 1000)
      },
      {
        rut: '33333333-3',
        tenantId: '507f1f77bcf86cd799439013',
        userId: 'user3',
        companyName: 'Empresa Tenant 3',
        frequency: 'minute',
        isActive: true,
        nextExecution: new Date(Date.now() + 60 * 1000),
        executionCount: 1440,
        lastExecutionStatus: 'success',
        lastExecuted: new Date(Date.now() - 60 * 1000)
      }
    ];
    
    await MonitoringSchedule.insertMany(testSchedules);
    console.log(`Created ${testSchedules.length} test monitoring schedules`);
    
    // Verify data
    const count = await MonitoringSchedule.countDocuments();
    console.log('Total monitoring schedules:', count);
    
    const schedules = await MonitoringSchedule.find();
    console.log('Created schedules:');
    schedules.forEach(s => {
      console.log(`- RUT: ${s.rut}, Tenant: ${s.tenantId}, Active: ${s.isActive}, Status: ${s.lastExecutionStatus}`);
    });
    
    await mongoose.disconnect();
    console.log('Test data created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestData();
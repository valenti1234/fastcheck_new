const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');

async function testMonitoringEndpoint() {
  try {
    await mongoose.connect('mongodb://localhost:27017/dux2');
    console.log('Connected to MongoDB');

    // Find a superuser
    const user = await mongoose.connection.db.collection('users').findOne({ role: 'superuser' });
    if (!user) {
      console.log('No superuser found');
      mongoose.disconnect();
      return;
    }

    console.log('Found user:', user.email);

    // Create a JWT token
    const token = jwt.sign(
      { 
        userId: user._id.toString(), 
        role: user.role, 
        tenantId: user.tenantId ? user.tenantId.toString() : null
      },
      'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Generated token successfully');

    // Test the endpoint
    exec(`curl -H "Authorization: Bearer ${token}" http://localhost:4040/api/monitoring/statistics`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error:', error);
      } else {
        console.log('Response from monitoring statistics endpoint:');
        console.log(stdout);
      }
      mongoose.disconnect();
    });

  } catch (error) {
    console.error('Error:', error);
    mongoose.disconnect();
  }
}

testMonitoringEndpoint();
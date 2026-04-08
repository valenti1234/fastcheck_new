const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'superuser'],
    default: 'user'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant'
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

async function createAuthToken() {
  try {
    await mongoose.connect('mongodb://localhost:27017/duxiter');
    console.log('Connected to MongoDB');
    
    // Find a superuser
    const superuser = await User.findOne({ role: 'superuser' });
    if (!superuser) {
      console.log('No superuser found');
      return;
    }
    
    console.log('Found superuser:', superuser.email);
    
    // Create JWT token
    const token = jwt.sign(
      { 
        userId: superuser._id,
        email: superuser.email,
        role: superuser.role,
        tenantId: superuser.tenantId
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    console.log('\nGenerated JWT Token:');
    console.log(token);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

createAuthToken();
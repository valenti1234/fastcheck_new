const mongoose = require('mongoose');

async function checkUsers() {
  try {
    await mongoose.connect('mongodb://localhost:27017/dux2');
    console.log('Connected to MongoDB');
    
    const userSchema = new mongoose.Schema({
      email: String,
      password: String,
      role: String,
      tenantId: mongoose.Schema.Types.ObjectId
    }, { timestamps: true });
    
    const User = mongoose.model('User', userSchema);
    
    const users = await User.find({}).select('email role tenantId');
    console.log('Found users:', users);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkUsers();
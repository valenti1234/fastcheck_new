import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

// Create a JWT token for testing
const userId = '6827419eecdd4cff1cd6ad6b';
const tenantId = '6827419eecdd4cff1cd6ad69';
const jwtSecret = process.env.VITE_JWT_SECRET || 'your-secret-key';

const token = jwt.sign(
  { 
    id: userId,
    tenant: tenantId,
    email: 'valenti1234@gmail.com',
    role: 'superuser'
  },
  jwtSecret,
  { expiresIn: '1h' }
);

async function testEvaluationAPI() {
  try {
    console.log('Testing evaluation API with authentication...');
    console.log('Token:', token.substring(0, 50) + '...');
    
    const response = await fetch('http://localhost:3000/api/evaluations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: userId,
        supplierData: {
          rut: '12345678-9',
          name: 'Test Supplier'
        },
        companyData: {
          testData: 'This is test data'
        }
      })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (response.ok) {
      console.log('✅ Evaluation created successfully!');
    } else {
      console.log('❌ Evaluation failed');
    }
    
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

testEvaluationAPI();
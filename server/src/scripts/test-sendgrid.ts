#!/usr/bin/env tsx

/**
 * Test script for SendGrid integration
 * Usage: npx tsx src/scripts/test-sendgrid.ts <test-email>
 */

import dotenv from 'dotenv';
import { NotificationService } from '../services/notificationService';
import { RiskChangeNotification } from '../models/RiskChangeNotification';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

async function testSendGrid() {
  const testEmail = process.argv[2];
  
  if (!testEmail) {
    console.error('Usage: npx tsx src/scripts/test-sendgrid.ts <test-email>');
    process.exit(1);
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(testEmail)) {
    console.error('Invalid email format');
    process.exit(1);
  }
  
  console.log('🧪 Testing SendGrid Integration...');
  console.log(`📧 Test email: ${testEmail}`);
  console.log('');
  
  try {
    // Initialize notification service
    const notificationService = NotificationService.getInstance();
    
    // Test 1: Basic configuration test
    console.log('1️⃣ Testing basic SendGrid configuration...');
    const configTest = await notificationService.testConfiguration(testEmail);
    
    if (configTest) {
      console.log('✅ Basic configuration test passed');
    } else {
      console.log('❌ Basic configuration test failed');
      return;
    }
    
    console.log('');
    
    // Test 2: Risk change notification template
    console.log('2️⃣ Testing risk change notification template...');
    
    // Create a mock risk change notification
    const mockNotification = {
      rut: '12345678-9',
      tenantId: 'test-tenant',
      scheduleId: 'test-schedule',
      companyName: 'Test Company S.A.',
      previousRisk: {
        overallRisk: 'Low',
        riskLevel: 'Low',
        score: 25
      },
      newRisk: {
        overallRisk: 'High',
        riskLevel: 'High', 
        score: 85
      },
      changeDetectedAt: new Date(),
      notificationSent: false,
      notificationMethod: 'email'
    };
    
    const riskNotificationTest = await notificationService.sendRiskChangeNotification(
      mockNotification as any,
      testEmail
    );
    
    if (riskNotificationTest) {
      console.log('✅ Risk change notification test passed');
    } else {
      console.log('❌ Risk change notification test failed');
    }
    
    console.log('');
    console.log('🎉 SendGrid integration test completed!');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   • Basic configuration: ${configTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   • Risk notification: ${riskNotificationTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');
    
    if (configTest && riskNotificationTest) {
      console.log('🚀 SendGrid is properly configured and ready for production!');
    } else {
      console.log('⚠️  Some tests failed. Please check your SendGrid configuration.');
      console.log('');
      console.log('💡 Troubleshooting tips:');
      console.log('   • Verify SENDGRID_API_KEY is set correctly');
      console.log('   • Ensure API key has Mail Send permissions');
      console.log('   • Check that sender email is verified in SendGrid');
      console.log('   • Review SendGrid dashboard for delivery issues');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.log('');
        console.log('💡 This looks like an API key issue. Please check:');
        console.log('   • SENDGRID_API_KEY is set in your .env file');
        console.log('   • API key has the correct permissions');
        console.log('   • API key is not expired or revoked');
      } else if (error.message.includes('sender')) {
        console.log('');
        console.log('💡 This looks like a sender verification issue. Please check:');
        console.log('   • SENDGRID_FROM_EMAIL is verified in SendGrid');
        console.log('   • Domain authentication is set up (recommended)');
      }
    }
  }
}

// Run the test
testSendGrid().catch(console.error);
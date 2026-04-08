import sgMail from '@sendgrid/mail';
import { IRiskChangeNotification } from '../models/RiskChangeNotification';
import { User } from '../models/user.model';
import dotenv from 'dotenv';

dotenv.config();

export interface NotificationTemplate {
  subject: string;
  html: string;
  text: string;
}

export class NotificationService {
  private static instance: NotificationService;
  private isInitialized = false;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private initialize(): void {
    if (this.isInitialized) {
      return;
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey || apiKey === 'your_sendgrid_api_key_here') {
      console.warn('[NotificationService] SendGrid API key not configured. Email notifications will be disabled.');
      return;
    }

    sgMail.setApiKey(apiKey);
    this.isInitialized = true;
    console.log('[NotificationService] SendGrid initialized successfully');
  }

  /**
   * Send risk change notification email
   */
  public async sendRiskChangeNotification(
    notification: IRiskChangeNotification,
    recipientEmail: string
  ): Promise<boolean> {
    if (!this.isInitialized) {
      console.warn('[NotificationService] SendGrid not initialized. Skipping email notification.');
      return false;
    }

    try {
      const template = this.generateRiskChangeTemplate(notification);
      
      const msg = {
        to: recipientEmail,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || 'notifications@duxiter.com',
          name: process.env.SENDGRID_FROM_NAME || 'Duxiter Notifications'
        },
        subject: template.subject,
        text: template.text,
        html: template.html
      };

      await sgMail.send(msg);
      console.log(`[NotificationService] Risk change notification sent to ${recipientEmail} for RUT ${notification.rut}`);
      return true;
    } catch (error) {
      console.error(`[NotificationService] Failed to send risk change notification to ${recipientEmail}:`, error);
      return false;
    }
  }

  /**
   * Send bulk notification to multiple recipients
   */
  public async sendBulkNotification(
    template: NotificationTemplate,
    recipients: string[]
  ): Promise<{ success: string[], failed: string[] }> {
    if (!this.isInitialized) {
      console.warn('[NotificationService] SendGrid not initialized. Skipping bulk email notification.');
      return { success: [], failed: recipients };
    }

    const results = { success: [] as string[], failed: [] as string[] };

    for (const recipient of recipients) {
      try {
        const msg = {
          to: recipient,
          from: {
            email: process.env.SENDGRID_FROM_EMAIL || 'notifications@duxiter.com',
            name: process.env.SENDGRID_FROM_NAME || 'Duxiter Notifications'
          },
          subject: template.subject,
          text: template.text,
          html: template.html
        };

        await sgMail.send(msg);
        results.success.push(recipient);
        console.log(`[NotificationService] Bulk notification sent to ${recipient}`);
      } catch (error) {
        console.error(`[NotificationService] Failed to send bulk notification to ${recipient}:`, error);
        results.failed.push(recipient);
      }
    }

    return results;
  }

  /**
   * Get tenant users' email addresses for notifications
   */
  public async getTenantNotificationEmails(tenantId: string): Promise<string[]> {
    try {
      const users = await User.find({ 
        tenant: tenantId, 
        isActive: true 
      }).select('email');
      
      return users.map(user => user.email).filter(email => email);
    } catch (error) {
      console.error(`[NotificationService] Failed to get tenant notification emails for tenant ${tenantId}:`, error);
      return [];
    }
  }

  /**
   * Generate email template for risk change notifications
   */
  private generateRiskChangeTemplate(notification: IRiskChangeNotification): NotificationTemplate {
    const companyName = notification.companyName || 'Unknown Company';
    const rut = notification.rut;
    const changeDate = notification.changeDetectedAt.toLocaleDateString();
    const changeTime = notification.changeDetectedAt.toLocaleTimeString();

    const previousRiskLevel = this.getRiskLevel(notification.previousRisk);
    const newRiskLevel = this.getRiskLevel(notification.newRisk);
    
    const subject = `Risk Alert: ${companyName} (${rut}) - Risk Level Changed`;
    
    const text = `
Risk Change Alert

Company: ${companyName}
RUT: ${rut}
Date: ${changeDate} at ${changeTime}

Previous Risk Level: ${previousRiskLevel}
New Risk Level: ${newRiskLevel}

Please review the updated risk assessment in your Duxiter dashboard.

Best regards,
Duxiter Risk Monitoring System
    `;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Risk Change Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .alert { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .risk-change { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .risk-high { color: #dc3545; font-weight: bold; }
        .risk-medium { color: #fd7e14; font-weight: bold; }
        .risk-low { color: #28a745; font-weight: bold; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>🚨 Risk Change Alert</h2>
            <p>A risk level change has been detected for one of your monitored companies.</p>
        </div>
        
        <div class="alert">
            <h3>Company Details</h3>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>RUT:</strong> ${rut}</p>
            <p><strong>Detection Date:</strong> ${changeDate} at ${changeTime}</p>
        </div>
        
        <div class="risk-change">
            <h3>Risk Level Change</h3>
            <p><strong>Previous Risk Level:</strong> <span class="${this.getRiskCssClass(notification.previousRisk)}">${previousRiskLevel}</span></p>
            <p><strong>New Risk Level:</strong> <span class="${this.getRiskCssClass(notification.newRisk)}">${newRiskLevel}</span></p>
        </div>
        
        <p>Please review the updated risk assessment in your Duxiter dashboard for detailed information about this change.</p>
        
        <div class="footer">
            <p>This is an automated notification from the Duxiter Risk Monitoring System.</p>
            <p>If you have any questions, please contact our support team.</p>
        </div>
    </div>
</body>
</html>
    `;

    return { subject, text, html };
  }

  /**
   * Extract risk level from risk assessment object
   */
  private getRiskLevel(riskAssessment: any): string {
    if (!riskAssessment) return 'Unknown';
    
    if (riskAssessment.overallRisk) {
      return riskAssessment.overallRisk;
    }
    
    if (riskAssessment.riskLevel) {
      return riskAssessment.riskLevel;
    }
    
    if (riskAssessment.level) {
      return riskAssessment.level;
    }
    
    return 'Unknown';
  }

  /**
   * Get CSS class for risk level styling
   */
  private getRiskCssClass(riskAssessment: any): string {
    const level = this.getRiskLevel(riskAssessment).toLowerCase();
    
    if (level.includes('high') || level.includes('critical')) {
      return 'risk-high';
    }
    
    if (level.includes('medium') || level.includes('moderate')) {
      return 'risk-medium';
    }
    
    return 'risk-low';
  }

  /**
   * Test SendGrid configuration
   */
  public async testConfiguration(testEmail: string): Promise<boolean> {
    if (!this.isInitialized) {
      console.error('[NotificationService] SendGrid not initialized');
      return false;
    }

    try {
      const msg = {
        to: testEmail,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || 'notifications@duxiter.com',
          name: process.env.SENDGRID_FROM_NAME || 'Duxiter Notifications'
        },
        subject: 'Duxiter SendGrid Test',
        text: 'This is a test email to verify SendGrid configuration.',
        html: '<p>This is a test email to verify SendGrid configuration.</p>'
      };

      await sgMail.send(msg);
      console.log(`[NotificationService] Test email sent successfully to ${testEmail}`);
      return true;
    } catch (error) {
      console.error(`[NotificationService] Test email failed:`, error);
      return false;
    }
  }
}
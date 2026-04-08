# SendGrid Email Notifications Setup

This document explains how to set up and configure SendGrid for email notifications in the Duxiter backend.

## Overview

The notification system automatically sends email alerts when risk changes are detected during monitoring. It uses SendGrid as the email service provider.

## Features

- **Risk Change Notifications**: Automatic email alerts when company risk levels change
- **Tenant Isolation**: Notifications are sent only to users within the same tenant
- **Professional Email Templates**: HTML and text email templates with company branding
- **Retry Mechanism**: Failed notifications are tracked and can be retried
- **Configuration Testing**: Test endpoint to verify SendGrid setup
- **Notification History**: Track all sent and pending notifications

## Setup Instructions

### 1. Create SendGrid Account

1. Go to [SendGrid](https://sendgrid.com/) and create an account
2. Verify your email address
3. Complete the account setup process

### 2. Generate API Key

1. Log in to your SendGrid dashboard
2. Go to **Settings** > **API Keys**
3. Click **Create API Key**
4. Choose **Restricted Access** and configure the following permissions:
   - **Mail Send**: Full Access
   - **Mail Settings**: Read Access (optional)
   - **Tracking**: Read Access (optional)
5. Copy the generated API key (you won't be able to see it again)

### 3. Configure Environment Variables

Update your `.env` file with the following variables:

```env
# SendGrid Configuration
SENDGRID_API_KEY=your_actual_sendgrid_api_key_here
SENDGRID_FROM_EMAIL=notifications@yourdomain.com
SENDGRID_FROM_NAME=Duxiter Notifications
```

**Important Notes:**
- Replace `your_actual_sendgrid_api_key_here` with your actual SendGrid API key
- Use a verified sender email address (see Domain Authentication below)
- The `FROM_NAME` will appear as the sender name in emails

### 4. Domain Authentication (Recommended)

For production use, set up domain authentication:

1. In SendGrid dashboard, go to **Settings** > **Sender Authentication**
2. Click **Authenticate Your Domain**
3. Follow the instructions to add DNS records to your domain
4. Use an email address from your authenticated domain as `SENDGRID_FROM_EMAIL`

### 5. Test Configuration

Use the test endpoint to verify your setup:

```bash
POST /api/notifications/test
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "email": "test@example.com"
}
```

## API Endpoints

### Test Configuration
```
POST /api/notifications/test
```
Sends a test email to verify SendGrid configuration.

### Get Pending Notifications
```
GET /api/notifications/pending?limit=50&skip=0
```
Retrieve notifications that haven't been sent yet.

### Get Notification History
```
GET /api/notifications/history?limit=50&skip=0&sent=true
```
Retrieve notification history with optional filtering.

### Process Pending Notifications
```
POST /api/notifications/process-pending
```
Manually trigger processing of pending notifications.

### Get Notification Statistics
```
GET /api/notifications/stats
```
Get statistics about notifications for the tenant.

## How It Works

### Automatic Notifications

1. **Risk Monitoring**: The monitoring service runs scheduled checks on companies
2. **Change Detection**: When a risk level change is detected, a `RiskChangeNotification` record is created
3. **Email Sending**: The notification service automatically sends emails to all active users in the tenant
4. **Status Tracking**: The system tracks whether notifications were sent successfully

### Email Template

The system generates professional HTML emails with:
- Company name and RUT
- Previous and new risk levels with color coding
- Detection date and time
- Professional styling with Duxiter branding

### Error Handling

- Failed email attempts are logged with error messages
- Notifications remain in "pending" status if sending fails
- Manual retry is available through the API
- Multiple recipients per notification are supported

## Monitoring and Troubleshooting

### Check Notification Status

```bash
# Get notification statistics
GET /api/notifications/stats

# Check pending notifications
GET /api/notifications/pending

# View notification history
GET /api/notifications/history
```

### Common Issues

1. **"SendGrid not initialized" warnings**
   - Check that `SENDGRID_API_KEY` is set correctly
   - Ensure the API key has proper permissions

2. **Emails not being delivered**
   - Verify sender email is authenticated
   - Check SendGrid dashboard for delivery statistics
   - Ensure recipient emails are valid

3. **"Failed to send" errors**
   - Check SendGrid API key permissions
   - Verify account is not suspended
   - Check rate limits

### Logs

The system logs notification activities:

```
[NotificationService] SendGrid initialized successfully
[NotificationService] Risk change notification sent to user@example.com for RUT 12345678-9
[MonitoringService] Risk change notifications sent successfully for RUT 12345678-9
```

## Security Considerations

- **API Key Security**: Never commit API keys to version control
- **Environment Variables**: Store sensitive configuration in `.env` files
- **Tenant Isolation**: Notifications are automatically filtered by tenant
- **Authentication**: All notification endpoints require authentication
- **Authorization**: Test endpoint requires admin role

## Production Deployment

1. Set up domain authentication in SendGrid
2. Use environment variables for configuration
3. Monitor delivery rates in SendGrid dashboard
4. Set up alerts for failed notifications
5. Regularly check notification statistics

## Support

For issues with:
- **SendGrid Configuration**: Check SendGrid documentation
- **Email Delivery**: Monitor SendGrid dashboard
- **API Issues**: Check application logs
- **Feature Requests**: Contact development team
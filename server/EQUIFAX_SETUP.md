# Equifax Integration Setup

## Overview
This document describes the setup and configuration required for the Equifax data provider integration in the Duxiter system.

## Environment Variables

The following environment variables must be configured for the Equifax integration to work properly:

### API Configuration
```bash
# Equifax API URLs
EQUIFAX_UAT_URL=https://api.uat.equifax.cl
EQUIFAX_PROD_URL=https://api.equifax.cl
EQUIFAX_ENVIRONMENT=uat  # 'uat' or 'prod'

# OAuth Credentials
EQUIFAX_CLIENT_ID=your_client_id
EQUIFAX_CLIENT_SECRET=your_client_secret
EQUIFAX_USERNAME=your_username
EQUIFAX_PASSWORD=your_password
```

### Personal Data Configuration
```bash
# Default personal information for requests
EQUIFAX_FIRST_NAME=
EQUIFAX_MIDDLE_NAME=
EQUIFAX_LAST_NAME=
EQUIFAX_MOTHER_LAST_NAME=
EQUIFAX_NATIONAL_ID=
EQUIFAX_CHILEAN_SERIAL_NUMBER=
EQUIFAX_REQUEST_TYPE=RUT  # 'RUT' or 'PASSPORT'
```

### Product Data Configuration
```bash
# Product configuration as required by Equifax API
BILL_TO=
SHIP_TO=
PRODUCT_NAME=
PRODUCT_ORCH=
CONFIGURATION=Config
CUSTOMER=
MODEL=
```

## API Endpoints

The integration provides the following endpoints:

### Query RUT
- **POST** `/api/equifax/query/:rut`
- Query Equifax for company/person information by RUT
- Requires authentication and tenant isolation

### Bulk Query
- **POST** `/api/equifax/bulk-query`
- Query multiple RUTs in a single request
- Requires authentication and tenant isolation

### Health Check
- **GET** `/api/equifax/health`
- Check the health status of the Equifax service
- Requires authentication

## Request Structure

The service uses the following payload structure as required by Equifax:

```json
{
  "applicants": {
    "primaryConsumer": {
      "personalInformation": {
        "firstName": "string",
        "middleName": "string",
        "lastName": "string",
        "motherLastName": "string",
        "nationalId": "string",
        "chileanSerialNumber": "string",
        "requestType": "RUT"
      }
    }
  },
  "productData": {
    "billTo": "string",
    "shipTo": "string",
    "productName": "string",
    "productOrch": "string",
    "configuration": "Config",
    "customer": "string",
    "model": "string"
  }
}
```

## Features

- **OAuth Token Management**: Automatic token caching and renewal
- **Environment Support**: Configurable for UAT and production environments
- **Logging**: Comprehensive logging to Elasticsearch via ELK service
- **Error Handling**: Robust error handling with detailed error messages
- **File Storage**: Optional saving of API responses to files
- **Health Monitoring**: Health check endpoint for service monitoring
- **Tenant Isolation**: Full tenant isolation support

## Usage Example

```typescript
// Query a single RUT
const response = await fetch('/api/equifax/query/12345678-9', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    personalData: {
      firstName: 'Juan',
      lastName: 'Pérez'
    },
    productData: {
      productName: 'Credit Report'
    }
  })
});
```

## Security Considerations

- All endpoints require authentication
- Tenant isolation is enforced
- API credentials should be stored securely
- Responses can be optionally saved to files for audit purposes
- All API calls are logged for monitoring and debugging

## Monitoring

The service integrates with the existing ELK stack for:
- Business event logging
- API call monitoring
- Error tracking
- Performance metrics
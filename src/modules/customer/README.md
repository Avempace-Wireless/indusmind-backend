# Customer Devices API Integration

## Overview
This implementation adds a backend API endpoint that proxies requests to the external Indusmind customer devices API.

## Architecture

### Backend (Server)
```
server/src/modules/customer/
├── customer.service.ts      # Business logic & external API call
├── customer.controller.ts   # Request/response handling
├── customer.routes.ts       # Route definitions
└── index.ts                 # Module exports
```

### API Endpoint
```
GET /customer/devices
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Device Name",
      "label": "Device Label",
      "deviceUUID": "uuid-string",
      "accessToken": "token",
      "assignedToCustomer": true,
      "customerId": 2,
      "createdAt": "2025-10-18T21:03:25.881Z",
      "updatedAt": "2025-10-18T21:03:25.881Z"
    }
  ],
  "count": 10,
  "timestamp": "2026-01-20T12:00:00.000Z"
}
```

## External API Called
- **URL:** `http://52.47.152.33:3666/customer/getAllIndusmindCustomerDevices`
- **Method:** POST
- **Body:** `"Indusmind"`

## Frontend Integration

### Service Layer
The frontend calls the local server API:
```typescript
import { getAllIndusmindCustomerDevices } from '@/services/deviceAPI'

const devices = await getAllIndusmindCustomerDevices()
```

### Store Integration
Available in the meters store:
```typescript
import { useMetersStore } from '@/stores/useDeviceMetersStore'

const metersStore = useMetersStore()
await metersStore.fetchIndusmindCustomerDevices()
```

### UI Component
The MeterSelector component includes a "Fetch Customer Devices" button that:
- Calls the server API to get customer devices
- Automatically merges them with existing meters
- Avoids duplicates
- Updates the UI with new devices

Users can access this via:
1. Open the MeterSelector modal in any view
2. Click the cloud download icon button
3. New devices are fetched and added to the selection list

## Testing

### Start the Server
```bash
cd server
npm install
npm run dev
```

Server will run on `http://localhost:3000` (or configured PORT)

### Test the Endpoint

**Using curl:**
```bash
curl http://localhost:3000/customer/devices
```

**Using the browser:**
Navigate to: `http://localhost:3000/customer/devices`

**Using the frontend:**
1. Start the frontend: `npm run dev`
2. Navigate to `/devices` route
3. Click "Fetch Customer Devices" button

### Automated Tests
```bash
cd server
npm test
```

## Environment Configuration

Create `.env` file in server directory:
```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

## Benefits of This Architecture

1. **Security**: External API credentials/URLs hidden from frontend
2. **Caching**: Can add caching layer in server
3. **Rate Limiting**: Can control request rates
4. **Monitoring**: Centralized logging and error tracking
5. **CORS**: No CORS issues since frontend calls same domain
6. **Transformation**: Can transform/filter data before sending to frontend

## Error Handling

The server handles:
- External API connection failures
- Invalid responses
- Network timeouts
- Proper HTTP status codes returned to frontend

## Next Steps

1. Add authentication middleware if needed
2. Implement caching (Redis/in-memory)
3. Add request rate limiting
4. Add response validation with Zod
5. Add monitoring/metrics collection

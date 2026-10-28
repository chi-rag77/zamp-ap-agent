# Zamp Integration API

Organization admins manage organization-scoped API keys in **Settings → Integrations**. The raw key is shown only once; the database stores its SHA-256 digest. The legacy connector marketplace has been removed. **Apps & mappings** lists the available Zamp modules and configured field mappings together.

## API key authentication

Send a key with `Authorization: Bearer <key>` or `X-API-Key: <key>`. Keys can be revoked by organization admins. Each request is scoped to the organization that created the key. API request logs store method, path, status, duration, timestamp, and key identity; they never store authorization headers or request payloads.

## Health check

`GET /api/v1/health` returns a small service response and records the successful key use. It does not read or modify business records.

## Create a purchase order

`POST /api/v1/purchase-orders` creates an `OPEN` PO and its line items in one database transaction. The vendor must be active in the API key's organization and the currency must match. PO numbers are unique per organization for active POs. Repeated requests with an existing PO number return HTTP 409. Invalid line calculations or totals return HTTP 400.

```bash
curl --request POST 'https://<your-zamp-host>/api/v1/purchase-orders' \
  --header 'Authorization: Bearer <your-zamp-api-key>' \
  --header 'Content-Type: application/json' \
  --data '{
    "po_number": "PO-EXT-1001",
    "vendor_id": "<active-vendor-uuid>",
    "currency": "INR",
    "po_date": "2026-10-28",
    "subtotal": 1000,
    "tax": 180,
    "total": 1180,
    "lines": [{
      "sku": "API-TEST-001",
      "description": "Integration API test item",
      "quantity": 10,
      "unit_price": 100,
      "tax_rate": 18,
      "amount": 1000
    }]
  }'
```

In Postman, import the cURL command or create a POST request to `/api/v1/purchase-orders`, set **Authorization → Bearer Token**, and send the JSON body. HTTP 201 returns the saved PO id, number, status, organization id, and view path. A duplicate PO number returns HTTP 409.

## Database setup

Apply `20261028141852_organization_integration_api_keys.sql`. The tables use RLS and do not grant direct access to `anon` or `authenticated`. The transactional PO creation function is executable only by the service role. Server routes authenticate and scope the key before using it.

# Gemini API Integration Setup

To complete the Gemini API integration with the CRM system, follow these steps:

## 1. Environment Configuration

Add the following to your `.env` file in the server directory:

```
GEMINI_API_KEY=AIzaSyBk5ifdCZJDlE-iqE87i-FcZ2pcKcj8UMw
```

## 2. Server Restart

After adding the environment variable, restart the server to apply the changes:

```bash
npm run dev
```

## 3. Verification

To verify the integration is working properly, you can test the endpoints:

- Generate text: `POST /api/gemini/generate`
- Generate with image: `POST /api/gemini/generate-with-image`
- Chat with Gemini: `POST /api/gemini/chat`

## API Endpoint Usage Examples

### Generate Text Content

```javascript
// Request
fetch('/api/gemini/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    prompt: 'Write a follow-up email to a customer who is interested in our product.'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

### Generate Content with Image

```javascript
// Request
fetch('/api/gemini/generate-with-image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    prompt: 'Describe what you see in this image.',
    imageData: 'BASE64_ENCODED_IMAGE_DATA'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

### Chat with Gemini

```javascript
// Request
fetch('/api/gemini/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', parts: 'Hello, I need help with a customer issue.' },
      { role: 'model', parts: 'I\'d be happy to help! What\'s the issue?' },
      { role: 'user', parts: 'The customer is asking about our refund policy.' }
    ]
  })
})
.then(response => response.json())
.then(data => console.log(data));
``` 
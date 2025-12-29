export default defineEventHandler(event => {
  const origin = getHeader(event, 'origin');
  const allowedOrigins = [
    'https://pstream.mov',   // production
    'http://localhost:3000'  // local testing
  ];

  // Only allow whitelisted origins
  if (origin && allowedOrigins.includes(origin)) {
    setHeader(event, 'Access-Control-Allow-Origin', origin);
  }

  setHeader(event, 'Access-Control-Allow-Credentials', 'true');
  setHeader(event, 'Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Respond to preflight OPTIONS
  if (event.method === 'OPTIONS') {
    event.node.res.statusCode = 204;
    return '';
  }
});

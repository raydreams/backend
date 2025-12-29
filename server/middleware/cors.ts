export default defineEventHandler(event => {
  const origin = getHeader(event, 'origin');

  // Only allow your frontend
  const allowedOrigins = ['https://pstream.mov'];
  if (origin && allowedOrigins.includes(origin)) {
    setHeader(event, 'Access-Control-Allow-Origin', origin);
  }

  setHeader(event, 'Access-Control-Allow-Credentials', 'true');
  setHeader(
    event,
    'Access-Control-Allow-Methods',
    'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'
  );
  setHeader(
    event,
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  // Handle preflight requests
  if (event.method === 'OPTIONS') {
    event.node.res.statusCode = 204;
    return '';
  }
});

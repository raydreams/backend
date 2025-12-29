// server/error.ts

export default defineNitroErrorHandler((error, event) => {
  const origin = event.req.headers.origin;

  if (origin) {
    event.res.setHeader('Access-Control-Allow-Origin', origin);
  }

  event.res.setHeader('Access-Control-Allow-Credentials', 'true');
  event.res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'
  );
  event.res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  // optional: log the error
  console.error(error);
});

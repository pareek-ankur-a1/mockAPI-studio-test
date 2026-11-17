import { once } from 'node:events';

export async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, options) => {
    const response = await fetch(`${base}${path}`, options);
    const body = await response.json();
    return { status: response.status, headers: response.headers, body };
  };
}

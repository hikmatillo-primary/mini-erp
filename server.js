const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('./db');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!['127.0.0.1', 'localhost', '::1'].includes(host) &&
    ![process.env.ERP_ADMIN_PASSWORD, process.env.ERP_WAREHOUSE_PASSWORD, process.env.ERP_PRODUCTION_PASSWORD].every(Boolean)) {
  throw new Error('Tarmoqda ishga tushirishdan oldin barcha ERP_*_PASSWORD qiymatlarini belgilang');
}
const store = createStore(process.env.ERP_DB_PATH || path.join(__dirname, '.data', 'erp.sqlite'));
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && store.hasDefaultPasswords()) {
  throw new Error('Tarmoqda ishga tushirishdan oldin demo parollarni Xodimlar oynasida almashtiring');
}
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/css/style.css', ['css/style.css', 'text/css; charset=utf-8']],
  ['/css/refined.css', ['css/refined.css', 'text/css; charset=utf-8']],
  ['/js/data.js', ['js/data.js', 'application/javascript; charset=utf-8']],
  ['/js/app.js', ['js/app.js', 'application/javascript; charset=utf-8']],
  ['/js/connected.js', ['js/connected.js', 'application/javascript; charset=utf-8']]
]);

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function cookie(req) {
  const found = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('erp_session='));
  return found ? found.slice('erp_session='.length) : null;
}
function sessionCookie(req, token) {
  const secure = req.socket.encrypted || process.env.ERP_SECURE_COOKIES === '1' ? '; Secure' : '';
  return `erp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`;
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 65536) { const error = new Error('So‘rov juda katta'); error.status = 413; throw error; }
  }
  try { return JSON.parse(text || '{}'); }
  catch { const error = new Error('JSON noto‘g‘ri'); error.status = 400; throw error; }
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      if (req.method === 'POST' && req.headers.origin) {
        const origin = new URL(req.headers.origin);
        if (origin.host !== req.headers.host) return send(res, 403, { error: 'Boshqa manbadan so‘rov qabul qilinmaydi' });
      }
      if (pathname === '/api/login' && req.method === 'POST') {
        const input = await body(req);
        const result = store.login(input.username, input.password);
        return send(res, 200, { user: result.user, state: store.readState() }, { 'Set-Cookie': sessionCookie(req, result.token) });
      }
      const token = cookie(req);
      const user = store.userForToken(token);
      if (!user) return send(res, 401, { error: 'Tizimga kiring' });
      if (pathname === '/api/state' && req.method === 'GET') return send(res, 200, { user, state: store.readState() });
      if (pathname === '/api/users' && req.method === 'GET') return send(res, 200, { users: store.listUsers(user) });
      if (pathname === '/api/users' && req.method === 'POST') return send(res, 200, { users: store.saveUser(await body(req), user) });
      if (pathname === '/api/logout' && req.method === 'POST') {
        store.logout(token);
        return send(res, 200, { ok: true }, { 'Set-Cookie': 'erp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (pathname === '/api/action' && req.method === 'POST') {
        const input = await body(req);
        return send(res, 200, { user, state: store.apply(input.type, input.payload || {}, user) });
      }
      return send(res, 404, { error: 'API topilmadi' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Ruxsat etilmagan usul' });
    const file = files.get(pathname);
    if (!file) return send(res, 404, { error: 'Fayl topilmadi' });
    const data = fs.readFileSync(path.join(__dirname, file[0]));
    res.writeHead(200, { 'Content-Type': file[1], 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    send(res, error.status || 500, { error: error.status ? error.message : 'Server xatosi' });
    if (!error.status) console.error(error);
  }
});

if (require.main === module) server.listen(port, host, () => console.log(`Mini-ERP: http://${host}:${port}`));
module.exports = { server, store };

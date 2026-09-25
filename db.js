const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STAGES = ['cutting', 'sewing_stone', 'ironing', 'packaging', 'completed'];
const PERMISSIONS = {
  admin: ['reset_demo', 'inbound_raw', 'adjust_stock', 'new_batch', 'advance_stage', 'create_partner', 'sale_invoice', 'partner_payment', 'save_bom'],
  warehouse: ['inbound_raw', 'adjust_stock', 'create_partner', 'sale_invoice', 'partner_payment'],
  production: ['new_batch', 'advance_stage', 'save_bom']
};

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function number(value, label, { min = 0, integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) fail(`${label} noto'g'ri kiritilgan`);
  return n;
}

function clean(value, label, max = 120) {
  const result = String(value ?? '').trim();
  if (!result || result.length > max || /[<>&"]/.test(result)) fail(`${label} noto‘g‘ri kiritilgan`);
  return result;
}

function round(value) { return Math.round((value + Number.EPSILON) * 1000) / 1000; }
function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function seedPartnerData(state) {
  state.partners = [
    { id: 'PARTNER-GULBAHOR', name: 'Gulbahor Boutique', phone: '+998 90 123 45 67', notes: 'Chorsu, doimiy hamkor', balance: 0, createdAt: now() },
    { id: 'PARTNER-ATLAS', name: 'Atlas Savdo', phone: '+998 91 234 56 78', notes: 'Ulgurji savdo', balance: 0, createdAt: now() },
    { id: 'PARTNER-NAFIS', name: 'Nafis Market', phone: '+998 93 345 67 89', notes: '', balance: 0, createdAt: now() }
  ];
  const sale = (partnerId, goodsId, quantity, paid, daysAgo) => {
    const goods = state.finishedGoods.find(item => item.id === goodsId);
    if (!goods || goods.stock < quantity) return;
    const total = quantity * goods.price;
    goods.stock -= quantity;
    const timestamp = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const invoice = { id: id('SALE'), number: `S-${String(state.sales.length + 1).padStart(4, '0')}`,
      partnerId, timestamp, items: [{ goodsId, sku: goods.sku, name: goods.name, size: goods.size, color: goods.color,
        quantity, unitPrice: goods.price, lineTotal: total }], total, paid, balance: total - paid, note: 'Namunaviy sotuv', actor: 'Tizim' };
    state.sales.push(invoice);
    state.partnerTransactions.push({ id: id('TXN'), partnerId, type: 'sale', amount: total, timestamp, saleId: invoice.id, note: invoice.number, balanceAfter: total, actor: 'Tizim' });
    if (paid) state.partnerTransactions.push({ id: id('TXN'), partnerId, type: 'payment', amount: -paid, timestamp, saleId: invoice.id, note: `${invoice.number} uchun to'lov`, balanceAfter: total - paid, actor: 'Tizim' });
    const partner = state.partners.find(item => item.id === partnerId);
    partner.balance += total - paid;
  };
  state.sales = [];
  state.partnerTransactions = [];
  sale('PARTNER-GULBAHOR', 'FG-201', 12, 500000, 2);
  sale('PARTNER-ATLAS', 'FG-202', 6, 840000, 4);
  sale('PARTNER-NAFIS', 'FG-203', 5, 0, 1);
}
function seedBoms(state) {
  const thread = state.rawMaterials.find(item => item.category === 'accessory' && item.unit === 'bobina');
  const label = state.rawMaterials.find(item => item.category === 'packaging' && /etiket/i.test(item.name));
  const packet = state.rawMaterials.find(item => item.category === 'packaging' && /paket|upakovka/i.test(item.name));
  const products = [];
  for (const goods of state.finishedGoods) {
    const batch = state.batches.find(item => item.sku === goods.sku);
    if (batch) products.push({ ...goods, batch });
  }
  for (const batch of state.batches) {
    if (!products.some(item => item.sku === batch.sku)) products.push({ ...batch, batch });
  }
  state.boms = products.map(product => {
    const batch = product.batch;
    const fabric = state.rawMaterials.find(item => item.id === batch.fabricId);
    const items = [];
    if (fabric) items.push({ materialId: fabric.id, quantityPerUnit: fabric.consumptionPerUnit, stage: 'cutting' });
    if (batch.stoneId) {
      const stone = state.rawMaterials.find(item => item.id === batch.stoneId);
      if (stone) items.push({ materialId: stone.id, quantityPerUnit: stone.consumptionPerUnit, stage: 'sewing_stone' });
    }
    if (thread) items.push({ materialId: thread.id, quantityPerUnit: thread.consumptionPerUnit, stage: 'sewing_stone' });
    if (label) items.push({ materialId: label.id, quantityPerUnit: 1, stage: 'packaging' });
    if (packet) items.push({ materialId: packet.id, quantityPerUnit: 1, stage: 'packaging' });
    return { id: `BOM-${product.sku}`, sku: product.sku, name: product.name, size: product.size,
      color: product.color || batch.color || 'Standart', decorType: product.decorType || batch.decorType || 'Klassik',
      price: product.price || batch.price || 0, costPrice: product.costPrice || batch.costPrice || 0,
      items, active: true, updatedAt: now() };
  });
}
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }

function demoState() {
  const source = fs.readFileSync(path.join(__dirname, 'js', 'data.js'), 'utf8');
  const original = vm.runInNewContext(`${source}\nDEFAULT_DATA`);
  const state = JSON.parse(JSON.stringify(original));
  state.version = 1;
  state.rolls = state.rawMaterials.filter(item => item.category === 'fabric').map((item, index) => ({
    id: id('ROLL'), code: `R-${String(index + 1).padStart(3, '0')}`,
    materialId: item.id, initialMeters: item.stock, remainingMeters: item.stock,
    widthCm: 150, supplier: 'Namunaviy yetkazib beruvchi', receivedAt: now()
  }));
  state.batches.forEach(batch => {
    batch.rollId = state.rolls.find(roll => roll.materialId === batch.fabricId)?.id || null;
    batch.plannedQuantity = batch.quantity;
    batch.defective = 0;
    const product = state.finishedGoods.find(g => g.name === batch.name && g.size === batch.size);
    batch.sku = product?.sku || `ROMOL-${batch.id}`;
    batch.color = product?.color || 'Standart';
    batch.decorType = product?.decorType || 'Klassik';
    batch.price = product?.price || 90000;
    batch.costPrice = product?.costPrice || 45000;
  });
  seedBoms(state);
  seedPartnerData(state);
  state.movements = [];
  for (const item of state.rawMaterials) {
    state.movements.push({ id: id('MOV'), timestamp: now(), type: 'opening', itemType: 'raw',
      itemId: item.id, itemName: item.name, delta: item.stock, balance: item.stock,
      unit: item.unit, note: 'Namunaviy boshlang‘ich qoldiq', actor: 'Tizim' });
  }
  for (const item of state.finishedGoods) {
    state.movements.push({ id: id('MOV'), timestamp: now(), type: 'opening', itemType: 'finished',
      itemId: item.id, itemName: item.name, delta: item.stock, balance: item.stock,
      unit: 'dona', note: 'Namunaviy boshlang‘ich qoldiq', actor: 'Tizim' });
  }
  return state;
}

function createStore(file = path.join(__dirname, '.data', 'erp.sqlite')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, display_name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username), expires_at INTEGER NOT NULL);`);
  if (!db.prepare('SELECT id FROM app_state WHERE id=1').get()) {
    db.prepare('INSERT INTO app_state(id,data) VALUES(1,?)').run(JSON.stringify(demoState()));
    const accounts = [
      ['admin', 'Administrator', 'admin', process.env.ERP_ADMIN_PASSWORD || 'Demo-2026!'],
      ['ombor', 'Omborchi', 'warehouse', process.env.ERP_WAREHOUSE_PASSWORD || 'Ombor-2026!'],
      ['sex', 'Sex boshlig‘i', 'production', process.env.ERP_PRODUCTION_PASSWORD || 'Sex-2026!']
    ];
    for (const [username, displayName, role, password] of accounts) {
      db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(username, displayName, role, hashPassword(password));
    }
  }

  function readState() {
    const state = JSON.parse(db.prepare('SELECT data FROM app_state WHERE id=1').get().data);
    let migrated = false;
    if (!Array.isArray(state.boms)) { seedBoms(state); migrated = true; }
    if (!Array.isArray(state.partners)) {
      seedPartnerData(state);
      migrated = true;
      for (const movement of state.movements || []) {
        if (movement.type === 'opening' && movement.itemType === 'finished') {
          const item = state.finishedGoods.find(goods => goods.id === movement.itemId);
          if (item) { movement.delta = item.stock; movement.balance = item.stock; }
        }
      }
    }
    if (migrated) db.prepare('UPDATE app_state SET data=? WHERE id=1').run(JSON.stringify(state));
    return state;
  }
  function userForToken(token) {
    if (!token) return null;
    const row = db.prepare(`SELECT u.username, u.display_name AS displayName, u.role FROM sessions s
      JOIN users u ON u.username=s.username WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash(token), Date.now());
    return row || null;
  }
  function login(username, password) {
    const row = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || ''));
    if (!row || !passwordMatches(String(password || ''), row.password_hash)) fail('Login yoki parol noto‘g‘ri', 401);
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token), row.username, Date.now() + 7 * 86400000);
    return { token, user: { username: row.username, displayName: row.display_name, role: row.role } };
  }
  function logout(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token)); }
  function hasDefaultPasswords() {
    return [['admin', 'Demo-2026!'], ['ombor', 'Ombor-2026!'], ['sex', 'Sex-2026!']]
      .some(([username, password]) => {
        const row = db.prepare('SELECT password_hash FROM users WHERE username=?').get(username);
        return row && passwordMatches(password, row.password_hash);
      });
  }
  function listUsers(actor) {
    if (actor.role !== 'admin') fail('Bu amal uchun ruxsat yo‘q', 403);
    return db.prepare('SELECT username, display_name AS displayName, role FROM users ORDER BY username').all();
  }
  function saveUser(input, actor) {
    if (actor.role !== 'admin') fail('Bu amal uchun ruxsat yo‘q', 403);
    const username = clean(input.username, 'Login', 32).toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) fail('Login 3–32 ta lotin harfi yoki raqamdan iborat bo‘lsin');
    const displayName = clean(input.displayName, 'Xodim ismi');
    const role = clean(input.role, 'Rol', 20);
    if (!PERMISSIONS[role]) fail('Rol noto‘g‘ri');
    if (username === actor.username && role !== 'admin') fail('O‘z administrator rolini olib tashlab bo‘lmaydi');
    const existing = db.prepare('SELECT username FROM users WHERE username=?').get(username);
    const password = String(input.password || '');
    if (!existing && password.length < 10) fail('Yangi xodim paroli kamida 10 belgi bo‘lsin');
    if (password && password.length < 10) fail('Parol kamida 10 belgi bo‘lsin');
    if (existing) {
      if (password) db.prepare('UPDATE users SET display_name=?, role=?, password_hash=? WHERE username=?')
        .run(displayName, role, hashPassword(password), username);
      else db.prepare('UPDATE users SET display_name=?, role=? WHERE username=?').run(displayName, role, username);
    } else db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(username, displayName, role, hashPassword(password));
    return listUsers(actor);
  }
  function movement(state, item, itemType, delta, type, note, actor) {
    state.movements.unshift({ id: id('MOV'), timestamp: now(), type, itemType,
      itemId: item.id, itemName: item.name, delta: round(delta), balance: round(item.stock),
      unit: itemType === 'finished' ? 'dona' : item.unit, note, actor });
  }
  function log(state, action, description, actor) {
    state.historyLogs.unshift({ id: id('LOG'), timestamp: now(), action, description, user: actor });
  }
  function raw(state, itemId) {
    const item = state.rawMaterials.find(x => x.id === itemId);
    if (!item) fail('Xomashyo topilmadi', 404);
    return item;
  }
  function roll(state, rollId) {
    const item = state.rolls.find(x => x.id === rollId);
    if (!item) fail('Rulon topilmadi', 404);
    return item;
  }
  function consume(state, item, amount, note, actor) {
    if (!item || item.stock + 0.000001 < amount) fail(`${item?.name || 'Xomashyo'} zaxirasi yetarli emas`);
    item.stock = round(item.stock - amount);
    item.updatedAt = now();
    movement(state, item, 'raw', -amount, 'consume', note, actor);
  }
  function apply(type, payload, user) {
    if (!PERMISSIONS[user.role]?.includes(type)) fail('Bu amal uchun ruxsat yo‘q', 403);
    db.exec('BEGIN IMMEDIATE');
    try {
      let state = readState();
      if (type !== 'reset_demo' && Number(payload.version) !== state.version) fail('Ma’lumot yangilangan. Sahifani yangilab qayta urinib ko‘ring', 409);
      const actor = user.displayName;
      if (type === 'reset_demo') {
        state = demoState();
      } else if (type === 'save_bom') {
        const sku = clean(payload.sku, 'SKU', 50);
        const name = clean(payload.name, 'Model nomi');
        const size = clean(payload.size, 'Olcham', 30);
        const color = clean(payload.color, 'Rang', 60);
        const decorType = clean(payload.decorType || 'Klassik', 'Bezak turi', 60);
        if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 30) fail('BoM uchun materiallarni kiriting');
        const items = payload.items.map(line => {
          const material = raw(state, line.materialId);
          const stage = clean(line.stage, 'Ishlab chiqarish bosqichi', 30);
          if (!['cutting', 'sewing_stone', 'ironing', 'packaging'].includes(stage)) fail('BoM bosqichi noto\'g\'ri');
          if (material.category === 'fabric' && stage !== 'cutting') fail('Mato bichuv bosqichida sarflanishi kerak');
          if (material.category !== 'fabric' && stage === 'cutting') fail('Bichuv bosqichida mato turi kerak');
          return { materialId: material.id, quantityPerUnit: number(line.quantityPerUnit, 'Dona boshiga sarf', { min: 0.000001 }), stage };
        });
        if (items.filter(line => raw(state, line.materialId).category === 'fabric').length !== 1) fail('BoM tarkibida bitta mato turi bo\'lishi kerak');
        const keys = items.map(line => `${line.materialId}:${line.stage}`);
        if (new Set(keys).size !== keys.length) fail('Bir materialni bir bosqichga ikki marta qo\'shib bo\'lmaydi');
        if (state.boms.some(item => item.sku.toLowerCase() === sku.toLowerCase() && item.id !== payload.bomId)) fail('Bu SKU uchun BoM mavjud');
        const bom = { id: payload.bomId || id('BOM'), sku, name, size, color, decorType,
          price: number(payload.price, 'Sotuv narxi'), costPrice: number(payload.costPrice, 'Tannarx'),
          items, active: true, updatedAt: now() };
        const index = state.boms.findIndex(item => item.id === bom.id);
        if (index >= 0) state.boms[index] = bom;
        else state.boms.unshift(bom);
        log(state, 'bom_save', `${bom.sku}: ${bom.name} BoM saqlandi (${items.length} material)`, actor);
      } else if (type === 'create_partner') {
        const partner = { id: id('PARTNER'), name: clean(payload.name, 'Hamkor nomi'),
          phone: String(payload.phone || '').trim().slice(0, 40), notes: String(payload.notes || '').trim().slice(0, 240),
          balance: 0, createdAt: now() };
        if (state.partners.some(x => x.name.toLowerCase() === partner.name.toLowerCase())) fail('Bu hamkor mavjud');
        state.partners.unshift(partner);
        log(state, 'partner_add', `${partner.name}: hamkor qo'shildi`, actor);
      } else if (type === 'sale_invoice') {
        const partner = state.partners.find(x => x.id === payload.partnerId);
        if (!partner) fail('Hamkor topilmadi', 404);
        if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 30) fail('Sotuv mahsulotlarini kiriting');
        const quantities = new Map();
        const items = payload.items.map(line => {
          const item = state.finishedGoods.find(x => x.id === line.goodsId);
          if (!item) fail('Tayyor mahsulot topilmadi', 404);
          const quantity = number(line.quantity, 'Sotuv soni', { min: 1, integer: true });
          const unitPrice = number(line.unitPrice, 'Sotuv narxi');
          quantities.set(item.id, (quantities.get(item.id) || 0) + quantity);
          return { goodsId: item.id, sku: item.sku, name: item.name, size: item.size, color: item.color,
            quantity, unitPrice, lineTotal: round(quantity * unitPrice) };
        });
        for (const [goodsId, quantity] of quantities) {
          const item = state.finishedGoods.find(x => x.id === goodsId);
          if (item.stock < quantity) fail(`${item.name}: omborda ${item.stock} dona, ${quantity} dona so'raldi`);
        }
        const total = round(items.reduce((sum, item) => sum + item.lineTotal, 0));
        const paid = number(payload.paid || 0, 'Boshlang' + String.fromCharCode(8216) + 'ich to' + String.fromCharCode(8216) + 'lov');
        if (paid > total) fail('Boshlang' + String.fromCharCode(8216) + 'ich to' + String.fromCharCode(8216) + 'lov sotuv summasidan oshmasin');
        const invoice = { id: id('SALE'), number: `S-${String((state.sales || []).length + 1).padStart(4, '0')}`,
          partnerId: partner.id, timestamp: now(), items, total, paid, balance: round(total - paid),
          note: String(payload.note || '').trim().slice(0, 240), actor };
        state.sales.unshift(invoice);
        for (const [goodsId, quantity] of quantities) {
          const item = state.finishedGoods.find(x => x.id === goodsId);
          item.stock -= quantity;
          movement(state, item, 'finished', -quantity, 'outbound', `${invoice.number} · ${partner.name}`, actor);
        }
        partner.balance = round(partner.balance + total - paid);
        state.partnerTransactions.unshift({ id: id('TXN'), partnerId: partner.id, type: 'sale', amount: total,
          timestamp: invoice.timestamp, saleId: invoice.id, note: invoice.number, balanceAfter: round(partner.balance + paid), actor });
        if (paid > 0) state.partnerTransactions.unshift({ id: id('TXN'), partnerId: partner.id, type: 'payment', amount: -paid,
          timestamp: invoice.timestamp, saleId: invoice.id, note: `${invoice.number} uchun boshlang'ich to'lov`, balanceAfter: partner.balance, actor });
        log(state, 'sale_invoice', `${invoice.number}: ${partner.name}, ${total.toLocaleString('uz-UZ')} so'm; qarz ${invoice.balance.toLocaleString('uz-UZ')} so'm`, actor);
      } else if (type === 'partner_payment') {
        const partner = state.partners.find(x => x.id === payload.partnerId);
        if (!partner) fail('Hamkor topilmadi', 404);
        const amount = number(payload.amount, 'To' + String.fromCharCode(8216) + 'lov summasi', { min: 1 });
        partner.balance = round(partner.balance - amount);
        state.partnerTransactions.unshift({ id: id('TXN'), partnerId: partner.id, type: 'payment', amount: -amount,
          timestamp: now(), saleId: null, note: String(payload.note || 'Qarz to\'lovi').trim().slice(0, 240), balanceAfter: partner.balance, actor });
        log(state, 'partner_payment', `${partner.name}: ${amount.toLocaleString('uz-UZ')} so'm to'lov; qoldiq ${partner.balance.toLocaleString('uz-UZ')} so'm`, actor);
      } else if (type === 'inbound_raw') {
        const qty = number(payload.quantity, 'Miqdor', { min: 0.001 });
        let item;
        if (payload.materialId === 'new') {
          const category = clean(payload.category, 'Toifa');
          if (!['fabric', 'accessory', 'packaging'].includes(category)) fail('Toifa noto‘g‘ri');
          item = { id: id('RAW'), name: clean(payload.name, 'Xomashyo nomi'), category,
            unit: category === 'fabric' ? 'metr' : clean(payload.unit, 'Birlik', 20),
            stock: 0, minStock: number(payload.minStock, 'Minimal qoldiq'),
            consumptionPerUnit: number(payload.consumptionPerUnit, 'Sarf normasi', { min: 0.001 }),
            price: number(payload.price, 'Birlik narxi'), color: clean(payload.color, 'Rang', 60), updatedAt: now() };
          state.rawMaterials.push(item);
        } else {
          item = raw(state, payload.materialId);
        }
        if (item.category === 'fabric') {
          const code = clean(payload.rollCode, 'Rulon kodi', 40);
          if (state.rolls.some(x => x.code.toLowerCase() === code.toLowerCase())) fail('Bu rulon kodi mavjud');
          state.rolls.push({ id: id('ROLL'), code, materialId: item.id,
            initialMeters: qty, remainingMeters: qty, widthCm: number(payload.widthCm, 'Mato eni', { min: 1 }),
            supplier: clean(payload.supplier, 'Yetkazib beruvchi'), receivedAt: now() });
        }
        item.stock = round(item.stock + qty);
        item.updatedAt = now();
        movement(state, item, 'raw', qty, 'inbound', `${item.category === 'fabric' ? `Rulon ${payload.rollCode}: ${qty} m; ` : ''}${payload.supplier || 'Kirim'}`, actor);
        log(state, 'raw_in', `${item.name}: +${qty} ${item.unit} kirim`, actor);
      } else if (type === 'adjust_stock') {
        if (!['roll', 'raw', 'finished'].includes(payload.itemType)) fail('Mahsulot turi noto‘g‘ri');
        const counted = number(payload.counted, 'Sanab chiqilgan qoldiq');
        const reason = clean(payload.reason, 'Tuzatish sababi', 240);
        if (payload.itemType === 'roll') {
          const r = roll(state, payload.itemId);
          const item = raw(state, r.materialId);
          const delta = round(counted - r.remainingMeters);
          r.remainingMeters = counted;
          item.stock = round(item.stock + delta);
          item.updatedAt = now();
          movement(state, item, 'raw', delta, 'adjust', `${r.code}: ${reason}; rulonda ${counted} m`, actor);
        } else {
          const items = payload.itemType === 'finished' ? state.finishedGoods : state.rawMaterials;
          const item = items.find(x => x.id === payload.itemId);
          if (!item) fail('Mahsulot topilmadi', 404);
          if (item.category === 'fabric') fail('Mato qoldig‘ini rulon bo‘yicha sanang');
          const delta = round(counted - item.stock);
          item.stock = counted;
          item.updatedAt = now();
          movement(state, item, payload.itemType === 'finished' ? 'finished' : 'raw', delta, 'adjust', reason, actor);
        }
        log(state, 'adjust', `Inventarizatsiya: ${reason}`, actor);
      } else if (type === 'new_batch') {
        let bom = state.boms.find(item => item.id === payload.bomId && item.active !== false);
        if (!bom && payload.bomId) fail('BoM retsepti topilmadi');
        const r = roll(state, payload.rollId);
        const fabric = raw(state, r.materialId);
        if (!bom) {
          const legacyItems = [{ materialId: fabric.id, quantityPerUnit: number(fabric.consumptionPerUnit, 'Mato sarfi', { min: 0.001 }), stage: 'cutting' }];
          if (payload.stoneId) legacyItems.push({ materialId: payload.stoneId,
            quantityPerUnit: number(raw(state, payload.stoneId).consumptionPerUnit, 'Tosh sarfi', { min: 0.001 }), stage: 'sewing_stone' });
          const thread = state.rawMaterials.find(item => item.category === 'accessory' && item.unit === 'bobina');
          const label = state.rawMaterials.find(item => item.category === 'packaging' && /etiket/i.test(item.name));
          const packet = state.rawMaterials.find(item => item.category === 'packaging' && /paket|upakovka/i.test(item.name));
          if (thread) legacyItems.push({ materialId: thread.id, quantityPerUnit: thread.consumptionPerUnit, stage: 'sewing_stone' });
          if (label) legacyItems.push({ materialId: label.id, quantityPerUnit: 1, stage: 'packaging' });
          if (packet) legacyItems.push({ materialId: packet.id, quantityPerUnit: 1, stage: 'packaging' });
          bom = { id: `legacy-${payload.sku}`, sku: clean(payload.sku, 'SKU', 50), name: clean(payload.name, 'Model nomi'),
            size: clean(payload.size, 'Olcham', 30), color: clean(payload.color, 'Rang', 60),
            decorType: clean(payload.decorType, 'Bezak turi', 60), price: number(payload.price, 'Sotuv narxi'),
            costPrice: number(payload.costPrice, 'Tannarx'), items: legacyItems };
        }
        const bomItems = bom.items.map(line => ({ ...line, material: raw(state, line.materialId) }));
        const fabricLine = bomItems.find(line => line.material.category === 'fabric');
        if (!fabricLine) fail('BoM tarkibida mato topilmadi');
        if (fabric.id !== fabricLine.materialId) fail('Tanlangan rulon BoM dagi mato turiga mos emas');
        const quantity = number(payload.quantity, 'Dona soni', { min: 1, integer: true });
        const needed = round(quantity * fabricLine.quantityPerUnit);
        if (r.remainingMeters + 0.000001 < needed) fail(`${r.code} rulonida ${needed} metr mato yo‘q`);
        const stoneId = bomItems.find(line => line.material.category === 'accessory' && line.material.unit === 'dona')?.materialId || null;
        if (stoneId) {
          const stone = raw(state, stoneId);
          if (stone.category !== 'accessory' || stone.unit !== 'dona') fail('Tosh turi noto‘g‘ri');
        }
        const sku = bom.sku;
        const name = bom.name;
        const size = bom.size;
        const color = bom.color;
        const decorType = bom.decorType;
        const price = bom.price;
        const costPrice = bom.costPrice;
        const existing = state.finishedGoods.find(g => g.sku.toLowerCase() === sku.toLowerCase());
        if (existing && (existing.name !== name || existing.size !== size || existing.color !== color ||
            existing.decorType !== decorType || existing.price !== price || existing.costPrice !== costPrice)) {
          fail('SKU boshqa model yoki narxga biriktirilgan');
        }
        r.remainingMeters = round(r.remainingMeters - needed);
        consume(state, fabric, needed, `${r.code} → bichuv; rulonda ${r.remainingMeters} m qoldi`, actor);
        const bomSnapshot = { bomId: bom.id, sku: bom.sku, items: bomItems.map(line => ({ materialId: line.materialId,
          materialName: line.material.name, unit: line.material.unit, quantityPerUnit: line.quantityPerUnit, stage: line.stage })) };
        const batch = { id: id('BATCH'), name, size, color, decorType, sku, price, costPrice, bomId: bom.id, bomSnapshot,
          quantity, plannedQuantity: quantity, defective: 0, currentStage: 'cutting', fabricId: fabric.id,
          rollId: r.id, stoneId, startDate: now().slice(0, 10), notes: '', stagesHistory: {
            cutting: { completed: false, date: now(), operator: actor },
            sewing_stone: { completed: false, date: null, operator: null },
            ironing: { completed: false, date: null, operator: null },
            packaging: { completed: false, date: null, operator: null }
          } };
        state.batches.unshift(batch);
        log(state, 'batch_start', `${batch.id}: ${name}, ${quantity} dona bichuvga yuborildi`, actor);
      } else if (type === 'advance_stage') {
        const batch = state.batches.find(b => b.id === payload.batchId);
        if (!batch || batch.currentStage === 'completed') fail('Faol partiya topilmadi', 404);
        const accepted = number(payload.accepted, 'Qabul qilingan son', { min: 1, integer: true });
        const defective = number(payload.defective || 0, 'Brak soni', { integer: true });
        const rework = number(payload.rework || 0, 'Qayta ishlash soni', { integer: true });
        if (accepted + defective + rework !== batch.quantity) fail('Qabul + brak + qayta ishlash soni partiya soniga teng bo‘lishi kerak');
        const currentStage = batch.currentStage;
        const nextStage = STAGES[STAGES.indexOf(currentStage) + 1];
        const requirements = [];
        if (batch.bomSnapshot) {
          for (const line of batch.bomSnapshot.items.filter(item => item.stage === nextStage)) {
            requirements.push([raw(state, line.materialId), round(accepted * line.quantityPerUnit)]);
          }
        } else {
        if (nextStage === 'sewing_stone') {
          if (batch.stoneId) {
            const stone = raw(state, batch.stoneId);
            requirements.push([stone, round(accepted * stone.consumptionPerUnit)]);
          }
          const thread = state.rawMaterials.find(x => x.category === 'accessory' && x.unit === 'bobina');
          if (thread) requirements.push([thread, round(accepted * thread.consumptionPerUnit)]);
        }
        if (nextStage === 'packaging') {
          const label = state.rawMaterials.find(x => x.category === 'packaging' && /etiket/i.test(x.name));
          const packet = state.rawMaterials.find(x => x.category === 'packaging' && /paket|upakovka/i.test(x.name));
          if (!label || !packet) fail('Etiketka va paket xomashyosi kerak');
          requirements.push([label, accepted], [packet, accepted]);
        }
        }
        for (const [item, qty] of requirements) if (item.stock + 0.000001 < qty) fail(`${item.name}: ${qty} ${item.unit} kerak, ${item.stock} mavjud`);
        for (const [item, qty] of requirements) consume(state, item, qty, `${batch.id} → ${nextStage}`, actor);
        if (rework) {
          const clone = JSON.parse(JSON.stringify(batch));
          clone.id = id('BATCH');
          clone.quantity = rework;
          clone.plannedQuantity = rework;
          clone.defective = 0;
          clone.reworkOf = batch.id;
          clone.notes = `${batch.id} dan qayta ishlashga qaytdi`;
          state.batches.unshift(clone);
        }
        batch.defective = (batch.defective || 0) + defective;
        batch.quantity = accepted;
        batch.stagesHistory[currentStage] = { ...(batch.stagesHistory[currentStage] || {}), completed: true, date: now(), operator: actor,
          accepted, defective, rework };
        batch.currentStage = nextStage;
        if (nextStage !== 'completed') {
          batch.stagesHistory[nextStage] = { completed: false, date: now(), operator: actor };
        } else {
          let goods = state.finishedGoods.find(g => g.sku === batch.sku);
          if (!goods) {
            goods = { id: id('FG'), name: batch.name, sku: batch.sku, size: batch.size,
              color: batch.color, decorType: batch.decorType, stock: 0, price: batch.price,
              costPrice: batch.costPrice, lastProduced: now().slice(0, 10) };
            state.finishedGoods.push(goods);
          }
          goods.stock += accepted;
          goods.lastProduced = now().slice(0, 10);
          movement(state, goods, 'finished', accepted, 'complete', batch.id, actor);
        }
        log(state, nextStage === 'completed' ? 'batch_complete' : 'stage_move',
          `${batch.id}: ${accepted} dona ${nextStage}; brak ${defective}, qayta ishlash ${rework}`, actor);
      } else if (type === 'sale_out') {
        const item = state.finishedGoods.find(g => g.id === payload.goodsId);
        if (!item) fail('Mahsulot topilmadi', 404);
        const quantity = number(payload.quantity, 'Chiqim soni', { min: 1, integer: true });
        if (item.stock < quantity) fail('Tayyor omborda qoldiq yetarli emas');
        item.stock -= quantity;
        const recipient = clean(payload.recipient, 'Qabul qiluvchi');
        movement(state, item, 'finished', -quantity, 'outbound', recipient, actor);
        log(state, 'sale_out', `${item.name}: ${quantity} dona ${recipient} ga chiqim`, actor);
      } else fail('Noma’lum amal');
      state.version = (state.version || 0) + 1;
      db.prepare('UPDATE app_state SET data=? WHERE id=1').run(JSON.stringify(state));
      db.exec('COMMIT');
      return state;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return { readState, userForToken, login, logout, listUsers, saveUser, hasDefaultPasswords, apply, close: () => db.close() };
}

module.exports = { createStore };

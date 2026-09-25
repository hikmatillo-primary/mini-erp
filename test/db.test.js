const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../db');

const admin = { role: 'admin', displayName: 'Test admin' };
const production = { role: 'production', displayName: 'Test sex' };
function action(store, type, payload = {}, user = admin) {
  return store.apply(type, { ...payload, version: store.readState().version }, user);
}

test('rulon kirimi alohida saqlanadi va inventarizatsiya umumiy qoldiqni yangilaydi', () => {
  const store = createStore(':memory:');
  try {
    const before = store.readState().rawMaterials.find(x => x.id === 'raw-1').stock;
    let state = action(store, 'inbound_raw', { materialId: 'raw-1', quantity: 60,
      rollCode: 'R-NEW', widthCm: 160, supplier: 'Sinov ta’minotchisi' });
    const roll = state.rolls.find(x => x.code === 'R-NEW');
    assert.equal(roll.remainingMeters, 60);
    assert.equal(state.rawMaterials.find(x => x.id === 'raw-1').stock, before + 60);
    state = action(store, 'adjust_stock', { itemType: 'roll', itemId: roll.id, counted: 58, reason: 'Qayta o‘lchandi' });
    assert.equal(state.rawMaterials.find(x => x.id === 'raw-1').stock, before + 58);
    assert.equal(state.movements[0].delta, -2);
  } finally { store.close(); }
});

test('yetarli mato bo‘lmasa partiya ochilmaydi va qoldiq o‘zgarmaydi', () => {
  const store = createStore(':memory:');
  try {
    const before = store.readState();
    assert.throws(() => action(store, 'new_batch', { rollId: before.rolls[0].id, quantity: 10000 }), /rulonida/);
    assert.equal(store.readState().version, before.version);
    assert.equal(store.readState().rolls[0].remainingMeters, before.rolls[0].remainingMeters);
  } finally { store.close(); }
});

test('qabul, brak va qayta ishlash bo‘linadi; etiketka va paket alohida sarflanadi', () => {
  const store = createStore(':memory:');
  try {
    const rollId = store.readState().rolls[0].id;
    let state = action(store, 'new_batch', { rollId, name: 'Test ro‘mol', size: '100x100 sm',
      quantity: 10, sku: 'TEST-001', color: 'Qora', decorType: 'Kristall',
      price: 100000, costPrice: 50000, stoneId: 'raw-5' });
    const batchId = state.batches[0].id;
    state = action(store, 'advance_stage', { batchId, accepted: 8, defective: 1, rework: 1 }, production);
    assert.equal(state.batches.find(x => x.id === batchId).quantity, 8);
    assert.equal(state.batches.find(x => x.reworkOf === batchId).quantity, 1);
    assert.equal(state.batches.find(x => x.id === batchId).defective, 1);
    state = action(store, 'advance_stage', { batchId, accepted: 8 });
    const labelBefore = state.rawMaterials.find(x => x.id === 'raw-8').stock;
    const packetBefore = state.rawMaterials.find(x => x.id === 'raw-9').stock;
    state = action(store, 'advance_stage', { batchId, accepted: 8 });
    assert.equal(state.rawMaterials.find(x => x.id === 'raw-8').stock, labelBefore - 8);
    assert.equal(state.rawMaterials.find(x => x.id === 'raw-9').stock, packetBefore - 8);
    state = action(store, 'advance_stage', { batchId, accepted: 8 });
    assert.equal(state.finishedGoods.find(x => x.sku === 'TEST-001').stock, 8);
    assert.equal(state.finishedGoods.find(x => x.sku === 'TEST-001').price, 100000);
  } finally { store.close(); }
});

test('qadoq zaxirasi yetmasa bosqich atomik rad etiladi va rol tekshiriladi', () => {
  const store = createStore(':memory:');
  try {
    const label = store.readState().rawMaterials.find(x => x.id === 'raw-8');
    action(store, 'adjust_stock', { itemType: 'raw', itemId: label.id, counted: 0, reason: 'Sanash' });
    const before = store.readState();
    assert.throws(() => action(store, 'advance_stage', { batchId: 'BATCH-103', accepted: 150 }), /etiketka/i);
    assert.equal(store.readState().version, before.version);
    assert.equal(store.readState().batches.find(x => x.id === 'BATCH-103').currentStage, 'ironing');
    assert.throws(() => action(store, 'inbound_raw', { materialId: 'raw-8', quantity: 5 }, production), /ruxsat/);
  } finally { store.close(); }
});

test('administrator xodim yaratadi va rol serverda tekshiriladi', () => {
  const store = createStore(':memory:');
  try {
    const owner = store.login('admin', 'Demo-2026!').user;
    const users = store.saveUser({ username: 'tikuvchi', displayName: 'Sinov tikuvchi',
      role: 'production', password: 'StrongDemo12!' }, owner);
    assert.ok(users.some(x => x.username === 'tikuvchi' && x.role === 'production'));
    const worker = store.login('tikuvchi', 'StrongDemo12!').user;
    assert.throws(() => store.listUsers(worker), /ruxsat/);
    assert.throws(() => action(store, 'adjust_stock', { itemType: 'raw', itemId: 'raw-7', counted: 5, reason: 'Sinov' }, worker), /ruxsat/);
  } finally { store.close(); }
});

/**
 * Ro'mol ishlab chiqarish mini-ERP
 * Toza bo'sh baza (Foydalanuvchi mustaqil kiritib sinashi uchun)
 */

const DEFAULT_DATA = {
  rawMaterials: [],
  boms: [],
  batches: [],
  finishedGoods: [],
  financials: {
    monthlySalesVolume: 0,
    monthlyRevenue: 0,
    totalRawMaterialsCost: 0,
    totalLaborCost: 0,
    totalOverheadCost: 0,
    netProfit: 0,
    profitMargin: 0
  },
  historyLogs: []
};

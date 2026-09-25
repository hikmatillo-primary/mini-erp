/**
 * Ro'mol ishlab chiqarish mini-ERP
 * Mijozga tushuntirish uchun qulay, real va namunaviy baza (DEFAULT_DATA)
 */

const DEFAULT_DATA = {
  rawMaterials: [
    {
      id: "raw-1",
      name: "Shifon 'Zumrad' keng rulon",
      category: "fabric",
      unit: "metr",
      stock: 420,
      minStock: 100,
      price: 22000,
      color: "Yashil / Zumrad",
      yieldPerMeter: 3,
      updatedAt: "2026-09-25 10:30"
    },
    {
      id: "raw-2",
      name: "Shoyi 'Atlas Gullik' rulon",
      category: "fabric",
      unit: "metr",
      stock: 180,
      minStock: 50,
      price: 26000,
      color: "Qizil / Gullik",
      yieldPerMeter: 3,
      updatedAt: "2026-09-25 11:15"
    },
    {
      id: "raw-3",
      name: "Swarovski DMS bezak toshlari",
      category: "accessory",
      unit: "dona",
      stock: 4800,
      minStock: 1000,
      price: 120,
      color: "Yaltiroq billur",
      yieldPerMeter: null,
      updatedAt: "2026-09-24 16:40"
    },
    {
      id: "raw-4",
      name: "Overlog tikuv iplari (Yashil/Oq)",
      category: "accessory",
      unit: "bobina",
      stock: 18,
      minStock: 5,
      price: 14000,
      color: "Yashil / Oq",
      yieldPerMeter: null,
      updatedAt: "2026-09-24 15:20"
    },
    {
      id: "raw-5",
      name: "Brend to'qima etiketkasi",
      category: "packaging",
      unit: "dona",
      stock: 850,
      minStock: 200,
      price: 700,
      color: "Zarhal logotip",
      yieldPerMeter: null,
      updatedAt: "2026-09-23 09:00"
    },
    {
      id: "raw-6",
      name: "Logotipli polietilen salafan paket",
      category: "packaging",
      unit: "dona",
      stock: 920,
      minStock: 200,
      price: 500,
      color: "Shaffof / Oltin",
      yieldPerMeter: null,
      updatedAt: "2026-09-23 09:00"
    }
  ],
  boms: [
    {
      id: "BOM-01",
      name: "Klassik Zumrad Shifon",
      size: "100x100 sm",
      fabricId: "raw-1",
      yieldPerMeter: 3,
      stoneId: "raw-3",
      stonesPerPiece: 25,
      threadCost: 360,
      labelCost: 700,
      packageCost: 500,
      laborCost: 5000,
      overheadCost: 1200,
      sellingPrice: 45000,
      retailPrice: 75000,
      notes: "Burchaklariga Swarovski tosh teriladi, yonlari zich overlog"
    },
    {
      id: "BOM-02",
      name: "Atlas Gullik Shifon",
      size: "95x95 sm",
      fabricId: "raw-2",
      yieldPerMeter: 3,
      stoneId: null,
      stonesPerPiece: 0,
      threadCost: 360,
      labelCost: 700,
      packageCost: 500,
      laborCost: 4000,
      overheadCost: 1200,
      sellingPrice: 38000,
      retailPrice: 65000,
      notes: "Milliy naqshli, toshsiz, yengil ipak mato"
    }
  ],
  batches: [
    {
      id: "BATCH-101",
      bomId: "BOM-01",
      name: "Klassik Zumrad Shifon",
      size: "100x100 sm",
      rollNumber: "RULON-#ZUM-01",
      fabricMetersCut: 20,
      yieldPerMeter: 3,
      quantity: 60,
      currentStage: "sewing",
      fabricId: "raw-1",
      stoneId: "raw-3",
      startDate: "2026-09-25",
      operator: "Dilnoza Tikuvchi",
      notes: "Overlog tikuv mashinasida yonlari tikilmoqda"
    },
    {
      id: "BATCH-102",
      bomId: "BOM-01",
      name: "Klassik Zumrad Shifon",
      size: "100x100 sm",
      rollNumber: "RULON-#ZUM-02",
      fabricMetersCut: 30,
      yieldPerMeter: 3,
      quantity: 90,
      currentStage: "stone",
      fabricId: "raw-1",
      stoneId: "raw-3",
      startDate: "2026-09-25",
      operator: "Nodira Termopresschi",
      notes: "Termopressda Swarovski toshlar yopishtirilmoqda"
    },
    {
      id: "BATCH-103",
      bomId: "BOM-02",
      name: "Atlas Gullik Shifon",
      size: "95x95 sm",
      rollNumber: "RULON-#ATL-01",
      fabricMetersCut: 20,
      yieldPerMeter: 3,
      quantity: 60,
      currentStage: "ironing",
      fabricId: "raw-2",
      stoneId: null,
      startDate: "2026-09-24",
      operator: "Malika Dazmolchi",
      notes: "Dazmollash va sifat nazorati stolidan o'tmoqda"
    },
    {
      id: "BATCH-104",
      bomId: "BOM-01",
      name: "Klassik Zumrad Shifon",
      size: "100x100 sm",
      rollNumber: "RULON-#ZUM-03",
      fabricMetersCut: 20,
      yieldPerMeter: 3,
      quantity: 60,
      currentStage: "cutting",
      fabricId: "raw-1",
      stoneId: "raw-3",
      startDate: "2026-09-25",
      operator: "Anvar Bichuvchi",
      notes: "Bichuv stolida 20 metr rulon kesilmoqda"
    }
  ],
  finishedGoods: [
    {
      id: "FG-201",
      name: "Klassik Zumrad Shifon",
      sku: "ROMOL-ZUM-100",
      size: "100x100 sm",
      color: "Zumrad Yashil",
      decorType: "Swarovski Toshli",
      stock: 140,
      price: 45000,
      costPrice: 18100,
      lastProduced: "2026-09-25"
    },
    {
      id: "FG-202",
      name: "Atlas Gullik Shifon",
      sku: "ROMOL-ATL-95",
      size: "95x95 sm",
      color: "Milliy Naqshli",
      decorType: "Toshsiz",
      stock: 95,
      price: 38000,
      costPrice: 15400,
      lastProduced: "2026-09-24"
    }
  ],
  financials: {
    monthlySalesVolume: 1150,
    monthlyRevenue: 48500000,
    totalRawMaterialsCost: 12850000,
    totalLaborCost: 5600000,
    totalOverheadCost: 3500000,
    netProfit: 26550000,
    profitMargin: 54.7
  },
  historyLogs: [
    {
      id: "LOG-1001",
      timestamp: "2026-09-25 15:20",
      action: "sale_out",
      description: "Chiqim: 50 dona \"Klassik Zumrad Shifon\" ('Chorsu Bozor' do'koni) ga sotildi. Jami: 2,250,000 so'm.",
      user: "Seh boshlig'i"
    },
    {
      id: "LOG-1002",
      timestamp: "2026-09-25 14:10",
      action: "batch_complete",
      description: "#BATCH-099 to'liq salafanlandi va 80 dona tayyor omborga qabul qilindi!",
      user: "Salafanlovchi"
    },
    {
      id: "LOG-1003",
      timestamp: "2026-09-25 11:30",
      action: "stage_move",
      description: "#BATCH-102 \"Tosh yopishtirish\" bosqichiga o'tkazildi (2,250 dona tosh sarflandi).",
      user: "Termopresschi"
    },
    {
      id: "LOG-1004",
      timestamp: "2026-09-25 10:00",
      action: "batch_start",
      description: "Yangi partiya #BATCH-104 (RULON-#ZUM-03, 60 dona) Bichuvga berildi. 20m rulon ochildi.",
      user: "Anvar Bichuvchi"
    },
    {
      id: "LOG-1005",
      timestamp: "2026-09-25 09:15",
      action: "raw_in",
      description: "Xomashyo kirimi: +150 metr \"Shifon 'Zumrad' keng rulon\" (22,000 so'mdan). Yangi o'rtacha tannarx: 22,000 so'm/metr.",
      user: "Omborchi"
    }
  ]
};

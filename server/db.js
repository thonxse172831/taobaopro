import { MongoClient } from 'mongodb'

export async function openDb(rawUri, dbName = 'taobaopro') {
  if (!rawUri) throw new Error('Thiếu biến môi trường MONGODB_URI (chuỗi kết nối MongoDB Atlas)')
  const uri = String(rawUri).trim().replace(/^MONGODB_URI\s*=\s*/i, '').replace(/^["']+|["']+$/g, '').trim()
  if (!/^mongodb(\+srv)?:\/\/.+/.test(uri)) {
    throw new Error(`MONGODB_URI không hợp lệ: phải bắt đầu bằng mongodb+srv:// (hiện bắt đầu bằng "${uri.slice(0, 12)}", dài ${uri.length} ký tự)`)
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 })
  await client.connect()
  const db = client.db(dbName)
  const kv = db.collection('kv')
  const orders = db.collection('orders')
  await orders.createIndex({ tracking: 1 }, { sparse: true })
  await orders.createIndex({ trackCode: 1 }, { sparse: true })
  await orders.createIndex({ createdAt: -1, insertedAt: -1 })
  const users = db.collection('users')
  await orders.createIndex({ owner: 1 }, { sparse: true })
  await orders.createIndex({ status: 1 })
  const payments = db.collection('payments')
  await payments.createIndex({ at: -1 })
  const now = () => new Date().toISOString()

  return {
    getUser: async (username) => users.findOne({ _id: username }),
    createUser: async (u) => { await users.insertOne({ _id: u.username, ...u, createdAt: now() }) },
    setUserPassword: async (username, passHash) => { await users.updateOne({ _id: username }, { $set: { passHash } }) },
    updateUser: async (username, patch) => { await users.updateOne({ _id: username }, { $set: { ...patch, updatedAt: now() } }) },
    ordersByOwner: async (owner) => (await orders.find({ owner }).sort({ createdAt: -1, insertedAt: -1 }).toArray()).map((r) => r.data),
    getKv: async (key) => (await kv.findOne({ _id: key }))?.value,
    allKv: async () => Object.fromEntries((await kv.find().toArray()).map((r) => [r._id, r.value])),
    setKv: async (key, value) => { await kv.updateOne({ _id: key }, { $set: { value, updatedAt: now() } }, { upsert: true }) },
    listOrders: async () => (await orders.find().sort({ createdAt: -1, insertedAt: -1 }).toArray()).map((r) => r.data),
    getOrder: async (id) => (await orders.findOne({ _id: id }))?.data,
    ordersByStatus: async (status) => (await orders.find({ status }).toArray()).map((r) => r.data),
    // Ghi nhận giao dịch ngân hàng; trả false nếu giao dịch này đã xử lý (webhook gửi lại)
    addPayment: async (p) => {
      try {
        await payments.insertOne({ ...p, at: now() })
        return true
      } catch (e) {
        if (e?.code === 11000) return false
        throw e
      }
    },
    // Gắn giao dịch vào đơn một lần duy nhất (chống gán trùng khi bấm 2 lần / 2 admin cùng lúc)
    claimPayment: async (id, orderId) => (await payments.updateOne({ _id: id, orderId: null }, { $set: { orderId } })).modifiedCount === 1,
    getPayment: async (id) => payments.findOne({ _id: id }),
    listPayments: async (limit = 50) => payments.find().sort({ at: -1 }).limit(limit).toArray(),
    orderByTracking: async (t) => (await orders.findOne({ tracking: t }))?.data,
    orderByTrackCode: async (c) => (await orders.findOne({ trackCode: c }))?.data,
    saveOrder: async (o) => {
      await orders.updateOne({ _id: o.id }, {
        $set: { data: o, status: o.status || '', tracking: o.tracking || null, trackCode: o.trackCode || null, owner: o.owner || null, createdAt: o.createdAt || now().slice(0, 10), updatedAt: now() },
        $setOnInsert: { insertedAt: now() },
      }, { upsert: true })
    },
    deleteOrder: async (id) => { await orders.deleteOne({ _id: id }) },
    close: () => client.close(),
  }
}

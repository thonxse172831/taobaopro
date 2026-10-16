import { MongoClient } from 'mongodb'

export async function openDb(uri, dbName = 'taobaopro') {
  if (!uri) throw new Error('Thiếu biến môi trường MONGODB_URI (chuỗi kết nối MongoDB Atlas)')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 })
  await client.connect()
  const db = client.db(dbName)
  const kv = db.collection('kv')
  const orders = db.collection('orders')
  await orders.createIndex({ tracking: 1 }, { sparse: true })
  await orders.createIndex({ createdAt: -1, insertedAt: -1 })
  const now = () => new Date().toISOString()

  return {
    getKv: async (key) => (await kv.findOne({ _id: key }))?.value,
    allKv: async () => Object.fromEntries((await kv.find().toArray()).map((r) => [r._id, r.value])),
    setKv: async (key, value) => { await kv.updateOne({ _id: key }, { $set: { value, updatedAt: now() } }, { upsert: true }) },
    listOrders: async () => (await orders.find().sort({ createdAt: -1, insertedAt: -1 }).toArray()).map((r) => r.data),
    getOrder: async (id) => (await orders.findOne({ _id: id }))?.data,
    orderByTracking: async (t) => (await orders.findOne({ tracking: t }))?.data,
    saveOrder: async (o) => {
      await orders.updateOne({ _id: o.id }, {
        $set: { data: o, status: o.status || '', tracking: o.tracking || null, createdAt: o.createdAt || now().slice(0, 10), updatedAt: now() },
        $setOnInsert: { insertedAt: now() },
      }, { upsert: true })
    },
    deleteOrder: async (id) => { await orders.deleteOne({ _id: id }) },
    close: () => client.close(),
  }
}

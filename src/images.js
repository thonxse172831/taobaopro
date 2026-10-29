import { api } from './api'

export const MAX_IMAGES = 10

// Danh sách ảnh của mẫu (mẫu cũ chỉ có trường image vẫn dùng được)
export const productImages = (p) => (p?.images?.length ? p.images : p?.image ? [p.image] : [])

// Nén ảnh trên máy trước khi tải lên: cạnh dài tối đa 1600px, JPEG ~0.85 (ảnh chụp điện thoại vài MB còn ~200KB)
export async function compressImage(file, max = 1600, quality = 0.85) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error(`Không đọc được ảnh "${file.name}"`))
      i.src = url
    })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k)
    c.height = Math.round(img.naturalHeight * k)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff' // ảnh PNG nền trong suốt → nền trắng khi chuyển JPEG
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Nén + tải lên server, trả về đường dẫn ảnh /api/img/...
export async function uploadImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" không phải tệp ảnh`)
  const data = await compressImage(file)
  return (await api('/admin/images', { method: 'POST', body: { data } })).url
}

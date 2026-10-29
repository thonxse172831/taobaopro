// Video của mẫu: link YouTube (watch / youtu.be / shorts) hoặc file video (tải lên shop hoặc link .mp4 https)
export const MAX_VIDEOS = 5
export const MAX_VIDEO_MB = 30

export function youtubeId(url) {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(String(url || ''))
  return m ? m[1] : ''
}
export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export const youtubeEmbed = (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`

// Link video hợp lệ: YouTube, video shop tải lên, hoặc file .mp4/.webm/.mov qua https
export const isVideoUrl = (u) => !!youtubeId(u) || /^\/api\/video\/[a-f0-9]{24}$/.test(u) || /^https:\/\/\S+\.(mp4|webm|mov)(\?\S*)?$/i.test(u)

// Ảnh + video thành một danh sách để hiển thị (video lên trước như Shopee)
export function mediaOf(p) {
  const images = p?.images?.length ? p.images : p?.image ? [p.image] : []
  const videos = (p?.videos || []).filter(isVideoUrl)
  return [...videos.map((src) => ({ type: 'video', src, yt: youtubeId(src) })), ...images.map((src) => ({ type: 'image', src }))]
}

// Tải file video lên (gửi thẳng file, có báo % tiến độ)
export function uploadVideo(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) return reject(new Error('Chỉ nhận video MP4, MOV hoặc WebM'))
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) return reject(new Error(`Video tối đa ${MAX_VIDEO_MB}MB — video dài nên đăng YouTube rồi dán link`))
    const x = new XMLHttpRequest()
    x.open('POST', '/api/admin/videos')
    x.setRequestHeader('Content-Type', file.type)
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    x.onload = () => {
      let d = {}
      try { d = JSON.parse(x.responseText) } catch { /* bỏ qua */ }
      if (x.status >= 200 && x.status < 300 && d.url) resolve(d.url)
      else reject(new Error(d.error || `Tải video lỗi (${x.status})`))
    }
    x.onerror = () => reject(new Error('Mất kết nối khi tải video'))
    x.send(file)
  })
}

import { useEffect, useRef, useState } from 'react'
import { MAX_IMAGES, uploadImage } from './images'
import { MAX_VIDEOS, MAX_VIDEO_MB, isVideoUrl, uploadVideo, youtubeId, youtubeThumb } from './media'

// Quản lý bộ ảnh của một mẫu: tải nhiều ảnh (chọn / kéo thả / dán link), xếp thứ tự, chọn ảnh chính, xóa
// onBusy(n): báo số ảnh đang tải để form khóa nút Lưu
export default function ImageManager({ images, onChange, onBusy }) {
  const file = useRef(null)
  const [busy, setBusy] = useState(0) // số ảnh đang tải
  useEffect(() => { onBusy?.(busy) }, [busy, onBusy])
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const [link, setLink] = useState('')
  const [dragIdx, setDragIdx] = useState(-1)
  const room = MAX_IMAGES - images.length

  const addFiles = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room)
    if (!list.length) return setErr(room <= 0 ? `Tối đa ${MAX_IMAGES} ảnh mỗi mẫu` : 'Hãy chọn tệp ảnh (JPG, PNG, WebP…)')
    setErr(files.length > room ? `Chỉ thêm được ${room} ảnh nữa (tối đa ${MAX_IMAGES})` : '')
    setBusy((n) => n + list.length)
    // Tải song song, giữ đúng thứ tự khách chọn
    const results = await Promise.allSettled(list.map(uploadImage))
    setBusy((n) => n - list.length)
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
    const bad = results.filter((r) => r.status === 'rejected')
    if (bad.length) setErr(`${bad.length} ảnh lỗi: ${bad[0].reason?.message || 'không tải lên được'}`)
    if (ok.length) onChange((cur) => [...cur, ...ok].slice(0, MAX_IMAGES))
  }
  const addLink = () => {
    const u = link.trim()
    if (!/^https:\/\/\S+$/i.test(u)) return setErr('Link ảnh phải bắt đầu bằng https://')
    if (room <= 0) return setErr(`Tối đa ${MAX_IMAGES} ảnh mỗi mẫu`)
    onChange((cur) => (cur.includes(u) ? cur : [...cur, u]))
    setLink('')
    setErr('')
  }
  const move = (from, to) => onChange((cur) => {
    if (to < 0 || to >= cur.length || from === to) return cur
    const a = [...cur]
    const [x] = a.splice(from, 1)
    a.splice(to, 0, x)
    return a
  })

  return (
    <div className="img-manager">
      <div className="img-manager-head">
        <b>Ảnh mẫu <small className="muted">({images.length}/{MAX_IMAGES}) · ảnh đầu tiên là ảnh chính, kéo để đổi thứ tự</small></b>
      </div>
      <div
        className={'img-grid' + (drag ? ' drag' : '')}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) } }}
      >
        {images.map((src, i) => (
          <div
            key={src}
            className={'img-tile' + (i === 0 ? ' main' : '') + (dragIdx === i ? ' dragging' : '')}
            draggable
            onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => { if (dragIdx >= 0) e.preventDefault() }}
            onDrop={(e) => { if (dragIdx >= 0) { e.preventDefault(); e.stopPropagation(); move(dragIdx, i); setDragIdx(-1) } }}
            onDragEnd={() => setDragIdx(-1)}
          >
            <img src={src} alt={`Ảnh ${i + 1}`} loading="lazy" />
            {i === 0 && <span className="img-badge">★ Ảnh chính</span>}
            <div className="img-tools">
              {i > 0 && <button type="button" title="Đặt làm ảnh chính" onClick={() => move(i, 0)}>★</button>}
              {i > 0 && <button type="button" title="Lên trước" onClick={() => move(i, i - 1)}>←</button>}
              {i < images.length - 1 && <button type="button" title="Ra sau" onClick={() => move(i, i + 1)}>→</button>}
              <button type="button" className="img-del" title="Xóa ảnh" onClick={() => onChange((cur) => cur.filter((x) => x !== src))}>✕</button>
            </div>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => <div key={'b' + i} className="img-tile loading" aria-label="Đang tải ảnh"><span className="spinner" /></div>)}
        {room > 0 && (
          <button type="button" className="img-add" onClick={() => file.current?.click()}>
            <span aria-hidden="true">＋</span>
            <small>Thêm ảnh<br />(chọn nhiều / kéo thả)</small>
          </button>
        )}
      </div>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      <div className="img-link">
        <input type="url" placeholder="Hoặc dán link ảnh https://…" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }} />
        <button type="button" onClick={addLink} disabled={!link.trim()}>Thêm link</button>
      </div>
      {err && <small className="err">{err}</small>}
    </div>
  )
}

// Video của mẫu: dán link YouTube / .mp4, hoặc tải file video lên (tối đa 30MB)
export function VideoManager({ videos, onChange, onBusy }) {
  const file = useRef(null)
  const [link, setLink] = useState('')
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState(null) // % đang tải, null = không tải
  useEffect(() => { onBusy?.(progress != null ? 1 : 0) }, [progress, onBusy])
  const room = MAX_VIDEOS - videos.length

  const addLink = () => {
    const u = link.trim()
    if (!isVideoUrl(u)) return setErr('Dán link YouTube (youtube.com, youtu.be, shorts) hoặc link file .mp4 https')
    if (room <= 0) return setErr(`Tối đa ${MAX_VIDEOS} video mỗi mẫu`)
    onChange((cur) => (cur.includes(u) ? cur : [...cur, u]))
    setLink('')
    setErr('')
  }
  const upload = async (f) => {
    if (!f) return
    if (room <= 0) return setErr(`Tối đa ${MAX_VIDEOS} video mỗi mẫu`)
    setErr('')
    setProgress(0)
    try {
      const url = await uploadVideo(f, setProgress)
      onChange((cur) => [...cur, url].slice(0, MAX_VIDEOS))
    } catch (x) {
      setErr(x.message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="img-manager video-manager">
      <div className="img-manager-head"><b>Video mẫu <small className="muted">({videos.length}/{MAX_VIDEOS}) · hiện trước ảnh ở trang sản phẩm</small></b></div>
      {videos.length > 0 && (
        <div className="video-list">
          {videos.map((v, i) => {
            const yt = youtubeId(v)
            return (
              <div className="video-item" key={v}>
                {yt ? <img src={youtubeThumb(yt)} alt="" /> : <video src={v} preload="metadata" muted />}
                <span className="video-play" aria-hidden="true">▶</span>
                <small className="video-src">{yt ? 'YouTube' : v.startsWith('/api/video/') ? 'Video tải lên' : 'Link video'}</small>
                <div className="img-tools">
                  {i > 0 && <button type="button" title="Lên trước" onClick={() => onChange((cur) => { const a = [...cur]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a })}>←</button>}
                  <button type="button" className="img-del" title="Xóa video" onClick={() => onChange((cur) => cur.filter((x) => x !== v))}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {progress != null && <div className="upload-bar"><span style={{ width: `${progress}%` }} /><small>Đang tải video… {progress}%</small></div>}
      {room > 0 && (
        <div className="img-link">
          <input type="url" placeholder="Dán link YouTube / Shorts hoặc link .mp4…" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }} />
          <button type="button" onClick={addLink} disabled={!link.trim()}>Thêm link</button>
          <button type="button" onClick={() => file.current?.click()} disabled={progress != null}>⬆ Tải video (≤{MAX_VIDEO_MB}MB)</button>
        </div>
      )}
      <input ref={file} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
      {err && <small className="err">{err}</small>}
    </div>
  )
}

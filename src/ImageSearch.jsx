import { useEffect, useState } from 'react'
import { searchProductsByImage } from './imagehash.js'
import { vnd } from './lib'

const MAX_FILE_SIZE = 12 * 1024 * 1024

export default function ImageSearch({ products, onSelect }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const chooseFile = (next) => {
    setResult(null)
    setError('')
    if (!next) return
    if (!next.type.startsWith('image/')) {
      setFile(null)
      setPreview('')
      setError('Vui lòng chọn tệp hình ảnh.')
      return
    }
    if (next.size > MAX_FILE_SIZE) {
      setFile(null)
      setPreview('')
      setError('Ảnh vượt quá 12 MB. Vui lòng chọn ảnh nhỏ hơn.')
      return
    }
    setFile(next)
    setPreview(URL.createObjectURL(next))
  }

  const scan = async () => {
    if (!file || busy) return
    setBusy(true)
    setProgress(0)
    setResult(null)
    setError('')
    try {
      const found = await searchProductsByImage(preview, products, setProgress)
      setResult(found)
    } catch {
      setError('Không đọc được ảnh này. Hãy thử ảnh JPG, PNG hoặc WebP khác.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="image-search card" aria-labelledby="image-search-title">
      <div className="image-search-heading">
        <div>
          <span className="image-search-kicker">TÌM MẪU NHANH</span>
          <h2 id="image-search-title">Tìm kiếm bằng hình ảnh</h2>
          <p>Chọn ảnh từ thư viện, hệ thống sẽ so khớp với ảnh sản phẩm trong shop.</p>
        </div>
        <span className="image-search-icon" aria-hidden="true">⌕</span>
      </div>

      <div className="image-search-body">
        <label className="image-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
          e.preventDefault()
          chooseFile(e.dataTransfer.files[0])
        }}>
          <input type="file" accept="image/*" onChange={(e) => {
            chooseFile(e.target.files[0])
            e.target.value = ''
          }} />
          {preview
            ? <img className="image-search-preview" src={preview} alt="Ảnh đã chọn để tìm kiếm" />
            : <span className="image-drop-content">
              <span className="image-upload-icon" aria-hidden="true">↑</span>
              <strong>Chọn ảnh từ thư viện</strong>
              <small>hoặc kéo thả ảnh vào đây · tối đa 12 MB</small>
            </span>}
        </label>

        <div className="image-search-actions">
          {file && <p className="image-file-name">{file.name}</p>}
          <div className="row">
            <button className="primary image-scan-button" type="button" onClick={scan} disabled={!file || busy || !products.length}>
              {busy ? `Đang quét ${progress}/${products.length}…` : '⌕  Bắt đầu quét'}
            </button>
            {file && <button type="button" onClick={() => { setFile(null); setPreview(''); setResult(null); setError('') }}>Xóa ảnh</button>}
          </div>
          <small className="muted">Ảnh được xử lý ngay trên thiết bị, không tải lên máy chủ.</small>
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      </div>

      {result && (
        <div className="image-results" aria-live="polite">
          {result.matches.length > 0 ? (
            <>
              <h3>✨ Mẫu có thể phù hợp</h3>
              <div className="image-result-list">
                {result.matches.map(({ product, similarity }, i) => (
                  <article className={'image-result' + (i === 0 && result.best ? ' best' : '')} key={product.id}>
                    {product.image
                      ? <img src={product.image} alt="" />
                      : <span className="image-result-placeholder" aria-hidden="true">🛍</span>}
                    <div className="image-result-info">
                      <strong>{product.name}</strong>
                      <span>{vnd(product.priceVnd)} · Khớp {similarity}%{i === 0 && result.best ? ' · Giống nhất' : ''}</span>
                    </div>
                    <button className="primary" type="button" onClick={() => onSelect(product.id)}>Chọn mẫu</button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="image-no-match">Chưa tìm thấy mẫu đủ giống trong catalog. Bạn có thể thử ảnh rõ sản phẩm hơn hoặc tìm bằng tên mẫu.</p>
          )}
          {result.skipped > 0 && <small className="muted">Không thể đọc ảnh của {result.skipped} mẫu; một số ảnh ngoài domain không cho phép so khớp.</small>}
        </div>
      )}
    </section>
  )
}

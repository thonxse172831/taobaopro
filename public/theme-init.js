// Đặt giao diện sáng/tối trước khi trang vẽ ra, tránh nháy sáng rồi mới chuyển tối
(function () {
  var dark
  try { dark = JSON.parse(localStorage.getItem('tb_dark')) } catch (e) { /* bỏ qua */ }
  if (typeof dark !== 'boolean') dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()

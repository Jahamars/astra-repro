const UI = {
  badge(status) {
    if (!status) return '<span class="badge badge-PENDING">—</span>';
    const labels = {
      NOT_REPRODUCIBLE_CRITICAL: 'NR·CRIT',
      NOT_REPRODUCIBLE: 'NR',
      BUILD_FAILED: 'FAILED',
    };
    return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
  },

  severityBadge(s) {
    return `<span class="badge badge-${s}">${s}</span>`;
  },

  time(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  },

  duration(sec) {
    if (sec == null) return '—';
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  },

  hash(h, len = 10) {
    if (!h) return '—';
    return `<span title="${h}">${h.slice(0, len)}…</span>`;
  },

  toast(msg, type = 'info', dur = 2800) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show toast-${type}`;
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => el.classList.remove('show'), dur);
  },

  modal(html) {
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  spinner() {
    return '<span class="spinner"></span>';
  },

  err(msg) {
    return `<div class="empty err">${msg}</div>`;
  },

  empty(msg = 'No data') {
    return `<div class="empty">${msg}</div>`;
  },
};

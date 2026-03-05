const UI = (() => {
  const STATUS_LABEL = {
    NOT_REPRODUCIBLE_CRITICAL: 'NR·CRIT',
    NOT_REPRODUCIBLE:          'NR',
    BUILD_FAILED:              'FAILED',
  };

  let _toastTimer;

  return {
    badge(s) {
      if (!s) return `<span class="badge pending">—</span>`;
      return `<span class="badge ${s.toLowerCase()}">${STATUS_LABEL[s] || s}</span>`;
    },

    time(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    },

    dur(sec) {
      if (sec == null) return '—';
      return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
    },

    hash(h, n = 10) {
      if (!h) return '—';
      return `<span class="hash" title="${h}">${h.slice(0, n)}…</span>`;
    },

    toast(msg, type = 'ok') {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = `toast show ${type}`;
      clearTimeout(_toastTimer);
      _toastTimer = setTimeout(() => el.className = 'toast', 2500);
    },

    modal(html) {
      document.getElementById('modal-body').innerHTML = html;
      document.getElementById('modal-overlay').classList.remove('hidden');
    },

    closeModal() {
      document.getElementById('modal-overlay').classList.add('hidden');
    },

    spin() { return '<span class="spin"></span>'; },
    err(msg) { return `<div class="state err">${msg}</div>`; },
    empty(msg = 'No data') { return `<div class="state">${msg}</div>`; },
  };
})();

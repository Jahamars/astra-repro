const PackagesView = {
  page: 0,
  limit: 50,
  search: '',
  status: '',

  async render() {
    const el = document.getElementById('view-packages');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Packages</div>
          <div class="page-sub">all tracked packages</div>
        </div>
      </div>
      <div class="table-wrap">
        <div class="toolbar">
          <input type="search" id="pkg-search" placeholder="Search…" value="${this.search}" />
          <select id="pkg-status">
            <option value="">All statuses</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="NOT_REPRODUCIBLE">NOT_REPRODUCIBLE</option>
            <option value="NOT_REPRODUCIBLE_CRITICAL">NR_CRITICAL</option>
            <option value="PENDING">PENDING</option>
            <option value="BUILDING">BUILDING</option>
            <option value="BUILD_FAILED">BUILD_FAILED</option>
            <option value="UNVERIFIABLE">UNVERIFIABLE</option>
          </select>
          <button class="btn btn-sm" onclick="PackagesView.applyFilter()">Filter</button>
          <button class="btn btn-sm" onclick="PackagesView.reset()">Clear</button>
          <span class="toolbar-count muted" id="pkg-count"></span>
        </div>
        <table>
          <thead><tr>
            <th>Package</th><th>Version</th><th>Arch</th><th>Status</th>
            <th>Hash D</th><th>Hash R</th><th>Finished</th><th>Duration</th>
          </tr></thead>
          <tbody id="pkg-tbody"><tr><td colspan="8" class="empty">${UI.spinner()} Loading…</td></tr></tbody>
        </table>
        <div class="pagination" id="pkg-pagination"></div>
      </div>
    `;
    document.getElementById('pkg-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.applyFilter();
    });
    document.getElementById('pkg-status').value = this.status;
    await this.load();
  },

  applyFilter() {
    this.search = document.getElementById('pkg-search').value.trim();
    this.status = document.getElementById('pkg-status').value;
    this.page = 0;
    this.load();
  },

  reset() {
    this.search = '';
    this.status = '';
    this.page = 0;
    document.getElementById('pkg-search').value = '';
    document.getElementById('pkg-status').value = '';
    this.load();
  },

  async load() {
    const tbody = document.getElementById('pkg-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="empty">${UI.spinner()} Loading…</td></tr>`;

    let p = `?limit=${this.limit}&offset=${this.page * this.limit}`;
    if (this.search) p += `&search=${encodeURIComponent(this.search)}`;
    if (this.status) p += `&status=${this.status}`;

    try {
      const rows = await API.packages(p);
      const cnt = document.getElementById('pkg-count');
      if (cnt) cnt.textContent = `${rows.length} results`;

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty">No packages found</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(r => `
        <tr onclick="PackagesView.openPackage('${r.package_name}')">
          <td class="td-name">${r.package_name}</td>
          <td class="mono">${r.version || '—'}</td>
          <td class="mono">${r.arch || '—'}</td>
          <td>${UI.badge(r.status)}</td>
          <td class="mono">${r.hash_declared ? r.hash_declared.slice(0, 10) + '…' : '—'}</td>
          <td class="mono">${r.hash_rebuilt ? r.hash_rebuilt.slice(0, 10) + '…' : '—'}</td>
          <td>${UI.time(r.finished_at)}</td>
          <td class="mono">${UI.duration(r.build_duration_seconds)}</td>
        </tr>
      `).join('');

      this._pagination(rows.length);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty err">${e.message}</td></tr>`;
    }
  },

  _pagination(count) {
    const el = document.getElementById('pkg-pagination');
    if (!el) return;
    el.innerHTML = `
      <button class="btn btn-sm" onclick="PackagesView.prevPage()" ${this.page > 0 ? '' : 'disabled'}>← Prev</button>
      <span>Page ${this.page + 1}</span>
      <button class="btn btn-sm" onclick="PackagesView.nextPage()" ${count === this.limit ? '' : 'disabled'}>Next →</button>
    `;
  },

  prevPage() { if (this.page > 0) { this.page--; this.load(); } },
  nextPage() { this.page++; this.load(); },

  async openPackage(name) {
    UI.modal(`<div class="modal-title">Package: ${name}</div>${UI.spinner()}`);
    try {
      const [pkg, history] = await Promise.all([
        API.package(name),
        API.packageHistory(name).catch(() => []),
      ]);

      const versions = pkg.versions || [];
      UI.modal(`
        <div class="modal-title">Package: ${name}</div>

        <div class="section-title">Versions (${versions.length})</div>
        <table>
          <thead><tr><th>Version</th><th>Arch</th><th>Status</th><th>Finished</th></tr></thead>
          <tbody>
            ${versions.length ? versions.map(v => `
              <tr onclick="${v.run_id ? `RunsView.openModal('${v.run_id}')` : ''}">
                <td class="mono">${v.version}</td>
                <td class="mono">${v.arch}</td>
                <td>${UI.badge(v.status)}</td>
                <td>${UI.time(v.finished_at)}</td>
              </tr>
            `).join('') : '<tr><td colspan="4" class="empty">No versions</td></tr>'}
          </tbody>
        </table>

        <div class="section-title" style="margin-top:20px">Run History (${history.length})</div>
        <table>
          <thead><tr><th>Version</th><th>Status</th><th>Queued</th><th>Duration</th><th>Trigger</th></tr></thead>
          <tbody>
            ${history.length ? history.map(h => `
              <tr onclick="RunsView.openModal('${h.run_id}')">
                <td class="mono">${h.version} / ${h.arch}</td>
                <td>${UI.badge(h.status)}</td>
                <td>${UI.time(h.queued_at)}</td>
                <td class="mono">${UI.duration(h.build_duration_seconds)}</td>
                <td class="mono muted">${h.triggered_by}</td>
              </tr>
            `).join('') : '<tr><td colspan="5" class="empty">No history</td></tr>'}
          </tbody>
        </table>
      `);
    } catch (e) {
      UI.modal(`<div class="modal-title">Package: ${name}</div>${UI.err(e.message)}`);
    }
  },
};

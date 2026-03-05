const PackagesView = (() => {
  let page = 0, search = '', status = '';
  const LIMIT = 50;

  async function render() {
    const el = document.getElementById('view-packages');
    el.innerHTML = `
      <div class="ph">
        <div><span class="ph-title">Packages</span><span class="ph-sub">tracked</span></div>
      </div>
      <div class="tbl-wrap">
        <div class="toolbar">
          <input type="search" id="pkg-q" placeholder="Search…" value="${search}" style="width:160px" />
          <select id="pkg-st">
            <option value="">All</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="NOT_REPRODUCIBLE">NOT_REPRODUCIBLE</option>
            <option value="NOT_REPRODUCIBLE_CRITICAL">NR_CRITICAL</option>
            <option value="PENDING">PENDING</option>
            <option value="BUILDING">BUILDING</option>
            <option value="BUILD_FAILED">BUILD_FAILED</option>
            <option value="UNVERIFIABLE">UNVERIFIABLE</option>
          </select>
          <button class="btn sm" onclick="PackagesView.filter()">Filter</button>
          <button class="btn sm" onclick="PackagesView.reset()">Clear</button>
          <span class="toolbar-right" id="pkg-cnt"></span>
        </div>
        <table>
          <thead><tr>
            <th>Package</th><th>Version</th><th>Arch</th><th>Status</th>
            <th>Hash·D</th><th>Hash·R</th><th>Finished</th><th>Dur</th>
          </tr></thead>
          <tbody id="pkg-body"><tr><td colspan="8" class="state">${UI.spin()} Loading…</td></tr></tbody>
        </table>
        <div class="pager" id="pkg-pager"></div>
      </div>`;
    document.getElementById('pkg-q').addEventListener('keydown', e => { if (e.key === 'Enter') filter(); });
    document.getElementById('pkg-st').value = status;
    await load();
  }

  function filter() {
    search = document.getElementById('pkg-q').value.trim();
    status = document.getElementById('pkg-st').value;
    page = 0; load();
  }

  function reset() {
    search = ''; status = ''; page = 0;
    document.getElementById('pkg-q').value = '';
    document.getElementById('pkg-st').value = '';
    load();
  }

  async function load() {
    const tbody = document.getElementById('pkg-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="state">${UI.spin()}</td></tr>`;
    let q = `?limit=${LIMIT}&offset=${page * LIMIT}`;
    if (search) q += `&search=${encodeURIComponent(search)}`;
    if (status) q += `&status=${status}`;
    try {
      const rows = await API.packages(q);
      const cnt = document.getElementById('pkg-cnt');
      if (cnt) cnt.textContent = `${rows.length} results`;
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="8" class="state">No packages</td></tr>`; _pager(0); return; }
      tbody.innerHTML = rows.map(r => `
        <tr class="cl" onclick="PackagesView.open('${r.package_name}')">
          <td class="td-n">${r.package_name}</td>
          <td class="mono">${r.version || '—'}</td>
          <td class="mono">${r.arch || '—'}</td>
          <td>${UI.badge(r.status)}</td>
          <td class="mono">${UI.hash(r.hash_declared)}</td>
          <td class="mono">${UI.hash(r.hash_rebuilt)}</td>
          <td class="mono">${UI.time(r.finished_at)}</td>
          <td class="mono">${UI.dur(r.build_duration_seconds)}</td>
        </tr>`).join('');
      _pager(rows.length);
    } catch (e) { tbody.innerHTML = `<tr><td colspan="8" class="state err">${e.message}</td></tr>`; }
  }

  function _pager(count) {
    const el = document.getElementById('pkg-pager');
    if (!el) return;
    el.innerHTML = `
      <button class="btn sm" onclick="PackagesView.prev()" ${page > 0 ? '' : 'disabled'}>← Prev</button>
      <span>p.${page + 1}</span>
      <button class="btn sm" onclick="PackagesView.next()" ${count === LIMIT ? '' : 'disabled'}>Next →</button>`;
  }

  async function open(name) {
    UI.modal(`<div class="m-title">${name}</div>${UI.spin()}`);
    try {
      const [pkg, hist] = await Promise.all([
        API.package(name),
        API.pkgHistory(name).catch(() => []),
      ]);
      const versions = pkg.versions || [];
      UI.modal(`
        <div class="m-title">${name}</div>
        <div class="sec">Versions (${versions.length})</div>
        <table>
          <thead><tr><th>Version</th><th>Arch</th><th>Status</th><th>Finished</th></tr></thead>
          <tbody>${versions.length
            ? versions.map(v => `
              <tr class="${v.run_id ? 'cl' : ''}" onclick="${v.run_id ? `RunsView.modal('${v.run_id}')` : ''}">
                <td class="mono">${v.version}</td><td class="mono">${v.arch}</td>
                <td>${UI.badge(v.status)}</td><td class="mono">${UI.time(v.finished_at)}</td>
              </tr>`).join('')
            : '<tr><td colspan="4" class="state">No versions</td></tr>'
          }</tbody>
        </table>
        <div class="sec" style="margin-top:16px">Run History (${hist.length})</div>
        <table>
          <thead><tr><th>Version/Arch</th><th>Status</th><th>Queued</th><th>Dur</th><th>Trigger</th></tr></thead>
          <tbody>${hist.length
            ? hist.map(h => `
              <tr class="cl" onclick="RunsView.modal('${h.run_id}')">
                <td class="mono">${h.version}/${h.arch}</td>
                <td>${UI.badge(h.status)}</td>
                <td class="mono">${UI.time(h.queued_at)}</td>
                <td class="mono">${UI.dur(h.build_duration_seconds)}</td>
                <td class="mono muted">${h.triggered_by}</td>
              </tr>`).join('')
            : '<tr><td colspan="5" class="state">No history</td></tr>'
          }</tbody>
        </table>`);
    } catch (e) { UI.modal(`<div class="m-title">${name}</div>${UI.err(e.message)}`); }
  }

  return { render, filter, reset, prev: () => { if (page > 0) { page--; load(); } }, next: () => { page++; load(); }, open };
})();

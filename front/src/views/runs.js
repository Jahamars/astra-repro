const RunsView = (() => {
  let page = 0, status = '';
  const LIMIT = 50;

  async function render() {
    const el = document.getElementById('view-runs');
    el.innerHTML = `
      <div class="ph">
        <div><span class="ph-title">Runs</span><span class="ph-sub">pipeline builds</span></div>
        <div class="ph-act"><button class="btn sm" onclick="RunsView.render()">↻</button></div>
      </div>
      <div class="tbl-wrap">
        <div class="toolbar">
          <select id="run-st" onchange="RunsView.setStatus(this.value)">
            <option value="">All</option>
            <option value="PENDING">PENDING</option>
            <option value="BUILDING">BUILDING</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="NOT_REPRODUCIBLE">NOT_REPRODUCIBLE</option>
            <option value="NOT_REPRODUCIBLE_CRITICAL">NR_CRITICAL</option>
            <option value="BUILD_FAILED">BUILD_FAILED</option>
            <option value="UNVERIFIABLE">UNVERIFIABLE</option>
          </select>
          <span class="toolbar-right" id="run-cnt"></span>
        </div>
        <table>
          <thead><tr><th>Package</th><th>Version</th><th>Arch</th><th>Status</th><th>Queued</th><th>Duration</th><th>Trigger</th></tr></thead>
          <tbody id="run-body"><tr><td colspan="7" class="state">${UI.spin()}</td></tr></tbody>
        </table>
        <div class="pager" id="run-pager"></div>
      </div>`;
    document.getElementById('run-st').value = status;
    await load();
  }

  function setStatus(v) { status = v; page = 0; load(); }

  async function load() {
    const tbody = document.getElementById('run-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="state">${UI.spin()}</td></tr>`;
    let q = `?limit=${LIMIT}&offset=${page * LIMIT}`;
    if (status) q += `&status=${status}`;
    try {
      const rows = await API.runs(q);
      const cnt = document.getElementById('run-cnt');
      if (cnt) cnt.textContent = `${rows.length} runs`;
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="7" class="state">No runs</td></tr>`; _pager(0); return; }
      tbody.innerHTML = rows.map(r => `
        <tr class="cl" onclick="RunsView.modal('${r.id}')">
          <td class="td-n">${r.package_name}</td>
          <td class="mono">${r.version}</td>
          <td class="mono">${r.arch}</td>
          <td>${UI.badge(r.status)}</td>
          <td class="mono">${UI.time(r.queued_at)}</td>
          <td class="mono">${UI.dur(r.build_duration_seconds)}</td>
          <td class="mono muted">${r.triggered_by}</td>
        </tr>`).join('');
      _pager(rows.length);
    } catch (e) { tbody.innerHTML = `<tr><td colspan="7" class="state err">${e.message}</td></tr>`; }
  }

  function _pager(count) {
    const el = document.getElementById('run-pager');
    if (!el) return;
    el.innerHTML = `
      <button class="btn sm" onclick="RunsView.prev()" ${page > 0 ? '' : 'disabled'}>← Prev</button>
      <span>p.${page + 1}</span>
      <button class="btn sm" onclick="RunsView.next()" ${count === LIMIT ? '' : 'disabled'}>Next →</button>`;
  }

  async function modal(id) {
    UI.modal(`<div class="m-title">Run</div>${UI.spin()}`);
    try {
      const r = await API.run(id);
      const mc = r.hashes_match === true ? 'ok' : r.hashes_match === false ? 'no' : '';
      UI.modal(`
        <div class="m-title">${r.package_name} <span class="muted">· ${r.version}/${r.arch}</span> ${UI.badge(r.status)}</div>
        <div class="dg">
          <div class="dr"><div class="dl">Run ID</div><div class="dv mono">${r.id}</div></div>
          <div class="dr"><div class="dl">Trigger</div><div class="dv mono">${r.triggered_by}</div></div>
          <div class="dr"><div class="dl">Queued</div><div class="dv">${UI.time(r.queued_at)}</div></div>
          <div class="dr"><div class="dl">Started</div><div class="dv">${UI.time(r.started_at)}</div></div>
          <div class="dr"><div class="dl">Finished</div><div class="dv">${UI.time(r.finished_at)}</div></div>
          <div class="dr"><div class="dl">Duration</div><div class="dv mono">${UI.dur(r.build_duration_seconds)}</div></div>
          ${r.source_date_epoch ? `<div class="dr"><div class="dl">SDE</div><div class="dv mono">${r.source_date_epoch}</div></div>` : ''}
          ${r.failure_reason ? `<div class="dr full"><div class="dl">Failure</div><div class="dv red">${r.failure_reason}</div></div>` : ''}
        </div>
        <div class="sec">Hashes</div>
        <div class="hc">
          <div class="hbox ${mc}"><div class="hl">Declared</div><div class="hv">${r.hash_declared_at_run || '—'}</div></div>
          <div class="hbox ${mc}"><div class="hl">Rebuilt</div><div class="hv">${r.hash_rebuilt || '—'}</div></div>
        </div>
        ${r.hashes_match !== null ? `<div class="hverdict ${r.hashes_match ? 'green' : 'red'}">${r.hashes_match ? '✓ match' : '✕ mismatch'}</div>` : ''}
        ${r.diffs?.length ? `
          <div class="sec">Diffs (${r.diffs.length})</div>
          ${r.diffs.map(d => `
            <div class="diff">
              ${UI.badge(d.severity)}
              <div class="diff-b">
                <div class="diff-f">${d.file_path || '—'}${d.section_name ? ` <span class="ac">· ${d.section_name}</span>` : ''}</div>
                <div class="diff-c">${d.cause}${d.description ? ' · ' + d.description : ''}</div>
              </div>
            </div>`).join('')}` : ''}
        ${r.build_log ? `<div class="sec">Log</div><pre class="log">${r.build_log.replace(/</g, '&lt;')}</pre>` : ''}`);
    } catch (e) { UI.modal(`<div class="m-title">Run</div>${UI.err(e.message)}`); }
  }

  return { render, setStatus, prev: () => { if (page > 0) { page--; load(); } }, next: () => { page++; load(); }, modal };
})();

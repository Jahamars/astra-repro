const RunsView = {
  async render() {
    const el = document.getElementById('view-runs');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Runs</div>
          <div class="page-sub">verification queue</div>
        </div>
        <button class="btn" onclick="RunsView.render()">↻ Refresh</button>
      </div>

      <div class="section-title" style="margin-top:0">Next Pending</div>
      <div id="runs-pending">${UI.spinner()}</div>

      <div class="section-title">Lookup Run by ID</div>
      <div class="row-gap">
        <input type="text" id="run-id-input" placeholder="UUID…" style="flex:1;max-width:400px" />
        <button class="btn btn-primary" onclick="RunsView.lookup()">Look up</button>
      </div>
    `;
    await this.loadPending();
  },

  async loadPending() {
    const el = document.getElementById('runs-pending');
    if (!el) return;
    try {
      const run = await API.pendingRun();
      if (!run) {
        el.innerHTML = UI.empty('Queue is empty');
        return;
      }
      el.innerHTML = `
        <div class="table-wrap" style="margin-bottom:20px">
          <table>
            <thead><tr><th>ID</th><th>Package</th><th>Version</th><th>Arch</th><th>Status</th><th>Queued</th><th>Actions</th></tr></thead>
            <tbody>
              <tr>
                <td class="mono">${run.id.slice(0, 8)}…</td>
                <td class="td-name">${run.package_name}</td>
                <td class="mono">${run.version}</td>
                <td class="mono">${run.arch}</td>
                <td>${UI.badge(run.status)}</td>
                <td>${UI.time(run.queued_at)}</td>
                <td class="row-gap-sm">
                  <button class="btn btn-sm" onclick="RunsView.openModal('${run.id}')">Details</button>
                  ${run.status === 'PENDING' ? `
                    <button class="btn btn-sm btn-primary" onclick="RunsView.startRun('${run.id}')">▶ Mark BUILDING</button>
                  ` : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="hint">▶ Mark BUILDING — переводит статус PENDING → BUILDING в БД. Реальную сборку запускает внешний builder-сервис, который поллит /runs/pending.</div>
      `;
    } catch (e) {
      el.innerHTML = UI.err(e.message);
    }
  },

  async startRun(id) {
    try {
      await API.startRun(id);
      UI.toast('Статус → BUILDING', 'ok');
      this.loadPending();
    } catch (e) {
      UI.toast(e.message, 'err');
    }
  },

  async lookup() {
    const id = document.getElementById('run-id-input').value.trim();
    if (!id) return;
    this.openModal(id);
  },

  async openModal(id) {
    UI.modal(`<div class="modal-title">Run Details</div>${UI.spinner()}`);
    try {
      const run = await API.run(id);
      const matchCls = run.hashes_match === true ? 'match' : run.hashes_match === false ? 'mismatch' : '';

      UI.modal(`
        <div class="modal-title">
          ${run.package_name}
          <span class="muted"> · ${run.version} / ${run.arch}</span>
          ${UI.badge(run.status)}
        </div>

        <div class="detail-grid">
          <div class="detail-row"><div class="detail-label">Run ID</div><div class="detail-val mono small">${run.id}</div></div>
          <div class="detail-row"><div class="detail-label">Triggered by</div><div class="detail-val mono">${run.triggered_by}</div></div>
          <div class="detail-row"><div class="detail-label">Queued</div><div class="detail-val">${UI.time(run.queued_at)}</div></div>
          <div class="detail-row"><div class="detail-label">Started</div><div class="detail-val">${UI.time(run.started_at)}</div></div>
          <div class="detail-row"><div class="detail-label">Finished</div><div class="detail-val">${UI.time(run.finished_at)}</div></div>
          <div class="detail-row"><div class="detail-label">Duration</div><div class="detail-val mono">${UI.duration(run.build_duration_seconds)}</div></div>
          ${run.build_path ? `<div class="detail-row"><div class="detail-label">Build Path</div><div class="detail-val mono">${run.build_path}</div></div>` : ''}
          ${run.source_date_epoch ? `<div class="detail-row"><div class="detail-label">SOURCE_DATE_EPOCH</div><div class="detail-val mono">${run.source_date_epoch}</div></div>` : ''}
          ${run.failure_reason ? `<div class="detail-row full-col"><div class="detail-label">Failure Reason</div><div class="detail-val red">${run.failure_reason}</div></div>` : ''}
        </div>

        <div class="section-title">Hash Comparison</div>
        <div class="hash-compare">
          <div class="hash-box ${matchCls}">
            <div class="hash-label">Declared (D) — from mirror</div>
            <div class="hash-val mono">${run.hash_declared_at_run || '—'}</div>
          </div>
          <div class="hash-box ${matchCls}">
            <div class="hash-label">Rebuilt (R) — by builder</div>
            <div class="hash-val mono">${run.hash_rebuilt || 'not yet'}</div>
          </div>
        </div>
        ${run.hashes_match !== null ? `
          <div class="hash-verdict ${run.hashes_match ? 'green' : 'red'}">
            ${run.hashes_match ? '✓ Hashes match — REPRODUCIBLE' : '✕ Hashes differ — NOT REPRODUCIBLE'}
          </div>
        ` : ''}

        ${run.diffs && run.diffs.length ? `
          <div class="section-title">Diffs (${run.diffs.length})</div>
          ${run.diffs.map(d => `
            <div class="diff-item">
              ${UI.severityBadge(d.severity)}
              <div class="diff-body">
                <div class="diff-name mono">${d.file_path || '—'} ${d.section_name ? `<span class="accent">· ${d.section_name}</span>` : ''}</div>
                <div class="diff-cause">${d.cause}${d.description ? ' · ' + d.description : ''}</div>
              </div>
            </div>
          `).join('')}
        ` : ''}

        ${run.build_log ? `
          <div class="section-title">Build Log</div>
          <pre class="log-box">${run.build_log.replace(/</g, '&lt;')}</pre>
        ` : ''}
      `);
    } catch (e) {
      UI.modal(`<div class="modal-title">Run Details</div>${UI.err(e.message)}`);
    }
  },
};

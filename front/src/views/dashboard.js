const Dashboard = {
  async render() {
    const el = document.getElementById('view-dashboard');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-sub">reproducible builds overview</div>
        </div>
        <button class="btn" onclick="Dashboard.render()">↻ Refresh</button>
      </div>
      <div id="dash-stats">${UI.spinner()} Loading…</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px">
        <div>
          <div class="section-title">Recent Issues</div>
          <div id="dash-issues">${UI.spinner()}</div>
        </div>
        <div>
          <div class="section-title">Snapshot History</div>
          <div id="dash-snaps">${UI.spinner()}</div>
        </div>
      </div>
    `;
    await Promise.all([this._stats(), this._issues(), this._snaps()]);
  },

  async _stats() {
    const el = document.getElementById('dash-stats');
    try {
      const s = await API.stats();
      const m = {};
      s.by_status.forEach(r => { m[r.status] = r; });
      const n = k => m[k]?.total || 0;
      const total = s.total_runs || 1;

      const seg = (count, color) => {
        const pct = (count / total * 100).toFixed(1);
        return `<div class="bar-seg" style="width:${pct}%;background:${color};min-width:${count > 0 ? 2 : 0}px" title="${count} (${pct}%)"></div>`;
      };

      el.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">Packages</div><div class="stat-val">${s.total_packages}</div></div>
          <div class="stat-card"><div class="stat-label">Versions</div><div class="stat-val">${s.total_versions}</div></div>
          <div class="stat-card"><div class="stat-label">Total Runs</div><div class="stat-val">${s.total_runs}</div></div>
          <div class="stat-card"><div class="stat-label">Verified</div><div class="stat-val green">${n('VERIFIED')}</div></div>
          <div class="stat-card"><div class="stat-label">Not Repro</div><div class="stat-val yellow">${n('NOT_REPRODUCIBLE')}</div></div>
          <div class="stat-card"><div class="stat-label">Critical</div><div class="stat-val red">${n('NOT_REPRODUCIBLE_CRITICAL')}</div></div>
          <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-val red">${n('BUILD_FAILED')}</div></div>
          <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-val">${n('PENDING') + n('BUILDING')}</div></div>
        </div>
        <div class="status-bar">
          ${seg(n('VERIFIED'), 'var(--green)')}
          ${seg(n('NOT_REPRODUCIBLE'), 'var(--yellow)')}
          ${seg(n('NOT_REPRODUCIBLE_CRITICAL'), 'var(--red)')}
          ${seg(n('BUILD_FAILED'), '#6e3130')}
          ${seg(n('UNVERIFIABLE'), 'var(--purple)')}
          ${seg(n('PENDING') + n('BUILDING'), 'var(--border2)')}
        </div>
        <div class="bar-legend">${s.by_status.map(r => `${r.status}: ${r.percentage}%`).join(' · ')}</div>
      `;
    } catch (e) {
      el.innerHTML = UI.err(e.message);
    }
  },

  async _issues() {
    const el = document.getElementById('dash-issues');
    try {
      const list = await API.issues('?limit=5');
      if (!list.length) { el.innerHTML = UI.empty('No critical issues'); return; }
      el.innerHTML = list.map(i => `
        <div class="diff-item clickable" onclick="RunsView.openModal('${i.run_id}')">
          ${UI.severityBadge(i.severity)}
          <div class="diff-body">
            <div class="diff-name">${i.package_name} <span class="muted">${i.version}</span></div>
            <div class="diff-path">${i.file_path || ''} ${i.section_name ? '· ' + i.section_name : ''}</div>
            <div class="diff-cause">${i.cause}${i.description ? ' · ' + i.description : ''}</div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = UI.err(e.message);
    }
  },

  async _snaps() {
    const el = document.getElementById('dash-snaps');
    try {
      const list = await API.snapshots();
      if (!list.length) { el.innerHTML = UI.empty('No snapshots'); return; }
      el.innerHTML = list.slice(0, 5).map(s => `
        <div class="snap-card">
          <div class="snap-header">
            <span class="snap-ref">${s.git_ref}</span>
            <span class="muted">${new Date(s.snapshot_created_at).toLocaleDateString()}</span>
          </div>
          <div class="snap-sha muted">${s.git_commit_sha.slice(0, 12)}</div>
          <div class="snap-counts">
            <span class="green">✓ ${s.verified}</span>
            <span class="yellow">! ${s.not_reproducible}</span>
            <span class="red">✕ ${s.critical}</span>
            <span class="muted">⏳ ${s.pending + s.building}</span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = UI.err(e.message);
    }
  },
};

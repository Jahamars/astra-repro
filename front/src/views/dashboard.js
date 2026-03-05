const Dashboard = (() => {
  async function render() {
    const el = document.getElementById('view-dashboard');
    el.innerHTML = `
      <div class="ph">
        <div><span class="ph-title">Dashboard</span><span class="ph-sub">overview</span></div>
        <div class="ph-act"><button class="btn sm" onclick="Dashboard.render()">↻</button></div>
      </div>
      <div id="d-stats">${UI.spin()} Loading…</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">
        <div><div class="sec">Recent Issues</div><div id="d-issues">${UI.spin()}</div></div>
        <div><div class="sec">Snapshots</div><div id="d-snaps">${UI.spin()}</div></div>
      </div>`;
    await Promise.all([_stats(), _issues(), _snaps()]);
  }

  async function _stats() {
    const el = document.getElementById('d-stats');
    try {
      const s = await API.stats();
      const m = Object.fromEntries(s.by_status.map(r => [r.status, r]));
      const n = k => m[k]?.total || 0;
      const total = s.total_runs || 1;
      const seg = (v, c) => {
        const pct = (v / total * 100).toFixed(1);
        return `<div class="bar-seg" style="width:${pct}%;background:${c};min-width:${v > 0 ? 2 : 0}px" title="${v} (${pct}%)"></div>`;
      };
      el.innerHTML = `
        <div class="stat-row">
          <div class="stat"><div class="stat-l">Packages</div><div class="stat-v">${s.total_packages}</div></div>
          <div class="stat"><div class="stat-l">Versions</div><div class="stat-v">${s.total_versions}</div></div>
          <div class="stat"><div class="stat-l">Runs</div><div class="stat-v">${s.total_runs}</div></div>
          <div class="stat"><div class="stat-l">Verified</div><div class="stat-v green">${n('VERIFIED')}</div></div>
          <div class="stat"><div class="stat-l">NR</div><div class="stat-v yellow">${n('NOT_REPRODUCIBLE')}</div></div>
          <div class="stat"><div class="stat-l">Critical</div><div class="stat-v red">${n('NOT_REPRODUCIBLE_CRITICAL')}</div></div>
          <div class="stat"><div class="stat-l">Failed</div><div class="stat-v red">${n('BUILD_FAILED')}</div></div>
          <div class="stat"><div class="stat-l">Pending</div><div class="stat-v">${n('PENDING') + n('BUILDING')}</div></div>
        </div>
        <div class="bar">
          ${seg(n('VERIFIED'),                  'var(--green)')}
          ${seg(n('NOT_REPRODUCIBLE'),          'var(--yellow)')}
          ${seg(n('NOT_REPRODUCIBLE_CRITICAL'), 'var(--red)')}
          ${seg(n('BUILD_FAILED'),              '#5a2a2a')}
          ${seg(n('UNVERIFIABLE'),              'var(--purple)')}
          ${seg(n('PENDING') + n('BUILDING'),   'var(--border2)')}
        </div>
        <div class="bar-leg">${s.by_status.map(r => `${r.status} ${r.percentage}%`).join(' · ')}</div>`;
    } catch (e) { el.innerHTML = UI.err(e.message); }
  }

  async function _issues() {
    const el = document.getElementById('d-issues');
    try {
      const list = await API.issues('?limit=5');
      if (!list.length) { el.innerHTML = UI.empty('No issues'); return; }
      el.innerHTML = list.map(i => `
        <div class="issue" onclick="RunsView.modal('${i.run_id}')">
          ${UI.badge(i.severity)}
          <div class="issue-body">
            <div class="issue-pkg">${i.package_name} <span class="muted">${i.version}</span></div>
            <div class="issue-path">${i.file_path || ''}${i.section_name ? ' · ' + i.section_name : ''}</div>
            <div class="issue-cause">${i.cause}${i.description ? ' · ' + i.description : ''}</div>
          </div>
        </div>`).join('');
    } catch (e) { el.innerHTML = UI.err(e.message); }
  }

  async function _snaps() {
    const el = document.getElementById('d-snaps');
    try {
      const list = await API.snapshots();
      if (!list.length) { el.innerHTML = UI.empty('No snapshots'); return; }
      el.innerHTML = list.slice(0, 5).map(s => `
        <div class="snap">
          <div class="snap-head">
            <span class="snap-ref">${s.git_ref}</span>
            <span class="muted" style="font-size:10px">${new Date(s.snapshot_created_at).toLocaleDateString('ru-RU')}</span>
          </div>
          <div class="snap-sha">${s.git_commit_sha.slice(0, 12)}</div>
          <div class="snap-nums">
            <span class="green">✓ ${s.verified}</span>
            <span class="yellow">! ${s.not_reproducible}</span>
            <span class="red">✕ ${s.critical}</span>
            <span class="muted">⏳ ${s.pending + s.building}</span>
          </div>
        </div>`).join('');
    } catch (e) { el.innerHTML = UI.err(e.message); }
  }

  return { render };
})();

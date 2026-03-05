const IssuesView = {
  severity: '',

  async render() {
    const el = document.getElementById('view-issues');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Issues</div>
          <div class="page-sub">critical and moderate diffs</div>
        </div>
        <button class="btn" onclick="IssuesView.load()">↻ Refresh</button>
      </div>
      <div class="table-wrap">
        <div class="toolbar">
          <select id="issue-sev" onchange="IssuesView.severity=this.value;IssuesView.load()">
            <option value="">All severities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="MODERATE">MODERATE</option>
          </select>
          <span class="toolbar-count muted" id="issue-count"></span>
        </div>
        <table>
          <thead><tr>
            <th>Package</th><th>Version</th><th>Arch</th>
            <th>Severity</th><th>Cause</th><th>File</th><th>Section</th><th>Finished</th>
          </tr></thead>
          <tbody id="issue-tbody"><tr><td colspan="8" class="empty">${UI.spinner()} Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    await this.load();
  },

  async load() {
    const tbody = document.getElementById('issue-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="empty">${UI.spinner()} Loading…</td></tr>`;

    let p = '?limit=100';
    if (this.severity) p += `&severity=${this.severity}`;

    try {
      const list = await API.issues(p);
      const cnt = document.getElementById('issue-count');
      if (cnt) cnt.textContent = `${list.length} issues`;

      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty">No issues found</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(i => `
        <tr onclick="RunsView.openModal('${i.run_id}')">
          <td class="td-name">${i.package_name}</td>
          <td class="mono">${i.version}</td>
          <td class="mono">${i.arch}</td>
          <td>${UI.severityBadge(i.severity)}</td>
          <td class="mono">${i.cause}</td>
          <td class="mono td-truncate" title="${i.file_path || ''}">${i.file_path || '—'}</td>
          <td class="mono">${i.section_name || '—'}</td>
          <td>${UI.time(i.finished_at)}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty err">${e.message}</td></tr>`;
    }
  },
};

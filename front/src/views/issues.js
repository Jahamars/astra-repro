const IssuesView = (() => {
  let severity = '';

  async function render() {
    const el = document.getElementById('view-issues');
    el.innerHTML = `
      <div class="ph">
        <div><span class="ph-title">Issues</span><span class="ph-sub">diffs · tampered</span></div>
        <div class="ph-act"><button class="btn sm" onclick="IssuesView.load()">↻</button></div>
      </div>
      <div class="tbl-wrap">
        <div class="toolbar">
          <select id="iss-sev" onchange="IssuesView.setSev(this.value)">
            <option value="">All</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="MODERATE">MODERATE</option>
            <option value="NOISE">NOISE</option>
          </select>
          <span class="toolbar-right" id="iss-cnt"></span>
        </div>
        <table>
          <thead><tr><th>Package</th><th>Version</th><th>Arch</th><th>Sev</th><th>Cause</th><th>File</th><th>Section</th><th>Finished</th></tr></thead>
          <tbody id="iss-body"><tr><td colspan="8" class="state">${UI.spin()}</td></tr></tbody>
        </table>
      </div>`;
    document.getElementById('iss-sev').value = severity;
    await load();
  }

  function setSev(v) { severity = v; load(); }

  async function load() {
    const tbody = document.getElementById('iss-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="state">${UI.spin()}</td></tr>`;
    let q = '?limit=100';
    if (severity) q += `&severity=${severity}`;
    try {
      const list = await API.issues(q);
      const cnt = document.getElementById('iss-cnt');
      if (cnt) cnt.textContent = `${list.length} issues`;
      if (!list.length) { tbody.innerHTML = `<tr><td colspan="8" class="state">No issues</td></tr>`; return; }
      tbody.innerHTML = list.map(i => `
        <tr class="cl" onclick="RunsView.modal('${i.run_id}')">
          <td class="td-n">${i.package_name}</td>
          <td class="mono">${i.version}</td>
          <td class="mono">${i.arch}</td>
          <td>${UI.badge(i.severity)}</td>
          <td class="mono">${i.cause}</td>
          <td class="mono td-clip" title="${i.file_path || ''}">${i.file_path || '—'}</td>
          <td class="mono">${i.section_name || '—'}</td>
          <td class="mono">${UI.time(i.finished_at)}</td>
        </tr>`).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="8" class="state err">${e.message}</td></tr>`; }
  }

  return { render, setSev, load };
})();

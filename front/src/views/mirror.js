const MirrorView = {
  async render() {
    const el = document.getElementById('view-mirror');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Mirror</div>
          <div class="page-sub">sync log · package ingestion</div>
        </div>
        <button class="btn" onclick="MirrorView.render()">↻ Refresh</button>
      </div>

      <div class="section-title" style="margin-top:0">Ingest Package Version</div>
      <div class="card" style="margin-bottom:24px">
        <div class="form-grid">
          <div class="form-field">
            <label>source_name</label>
            <input type="text" id="f-source" placeholder="curl" />
          </div>
          <div class="form-field">
            <label>version</label>
            <input type="text" id="f-version" placeholder="8.1.2-1astra1" />
          </div>
          <div class="form-field">
            <label>arch</label>
            <input type="text" id="f-arch" placeholder="amd64" value="amd64" />
          </div>
          <div class="form-field">
            <label>filename (pool/…)</label>
            <input type="text" id="f-filename" placeholder="pool/main/c/curl/curl_8.1.2-1_amd64.deb" />
          </div>
          <div class="form-field full-col">
            <label>hash_declared (SHA256, 64 chars)</label>
            <input type="text" id="f-hash" placeholder="a3f9c1d2…" class="mono" maxlength="64" />
          </div>
        </div>
        <button class="btn btn-primary" onclick="MirrorView.ingest()">Ingest & Create Run</button>
        <div id="ingest-result" class="ingest-result"></div>
      </div>

      <div class="section-title">Sync Log</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>ID</th><th>Synced At</th><th>Total</th><th>New</th><th>Updated</th><th>GPG</th><th>Error</th>
          </tr></thead>
          <tbody id="sync-tbody"><tr><td colspan="7" class="empty">${UI.spinner()} Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    await this.loadSyncs();
  },

  async loadSyncs() {
    const tbody = document.getElementById('sync-tbody');
    if (!tbody) return;
    try {
      const list = await API.mirrorSyncs();
      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty">No syncs yet</td></tr>`;
        return;
      }
      tbody.innerHTML = list.map(s => `
        <tr>
          <td class="mono">${s.id}</td>
          <td>${UI.time(s.synced_at)}</td>
          <td class="mono">${s.packages_total ?? '—'}</td>
          <td class="mono green">${s.packages_new}</td>
          <td class="mono yellow">${s.packages_updated}</td>
          <td>${s.gpg_valid ? '<span class="green">✓</span>' : '<span class="red">✕</span>'}</td>
          <td class="red small">${s.error_message || ''}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty err">${e.message}</td></tr>`;
    }
  },

  async ingest() {
    const out = document.getElementById('ingest-result');
    const body = {
      source_name:   document.getElementById('f-source').value.trim(),
      version:       document.getElementById('f-version').value.trim(),
      arch:          document.getElementById('f-arch').value.trim() || 'amd64',
      filename:      document.getElementById('f-filename').value.trim(),
      hash_declared: document.getElementById('f-hash').value.trim(),
    };

    if (!body.source_name || !body.version || !body.filename || !body.hash_declared) {
      out.innerHTML = `<span class="red">Заполните все обязательные поля</span>`;
      return;
    }
    if (body.hash_declared.length !== 64) {
      out.innerHTML = `<span class="red">hash_declared должен быть ровно 64 символа</span>`;
      return;
    }

    out.innerHTML = `${UI.spinner()} Ingesting…`;
    try {
      const pv = await API.createVersion(body);
      out.innerHTML = `<span class="green">✓ Version id=${pv.id}</span> → creating run…`;

      const run = await API.createRun({ package_version_id: pv.id, triggered_by: 'manual' });
      out.innerHTML = `
        <span class="green">✓ Run created</span>
        · id: <span class="mono accent">${run.id}</span>
        · status: ${UI.badge(run.status)}
        <button class="btn btn-sm" style="margin-left:8px" onclick="RunsView.openModal('${run.id}')">View</button>
      `;
    } catch (e) {
      out.innerHTML = `<span class="red">✕ ${e.message}</span>`;
      if (e.message.includes('404') || e.message.includes('mirror')) {
        out.innerHTML += `<div class="hint" style="margin-top:6px">Нет активного зеркала в БД. Выполните INSERT в таблицу mirror (см. bd/main.sql).</div>`;
      }
    }
  },
};

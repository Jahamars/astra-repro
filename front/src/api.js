const API = {
  base: localStorage.getItem('repro_api') || ENV.API_URL,

  setBase(url) {
    this.base = url.replace(/\/$/, '');
    localStorage.setItem('repro_api', this.base);
  },

  async get(path) {
    const r = await fetch(this.base + path);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },

  async post(path, body) {
    const r = await fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `${r.status}`);
    return data;
  },

  async put(path) {
    const r = await fetch(this.base + path, { method: 'PUT' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `${r.status}`);
    return data;
  },

  health:         ()       => API.get('/health'),
  stats:          ()       => API.get('/stats'),
  issues:         (p='')   => API.get('/stats/issues' + p),
  snapshots:      ()       => API.get('/stats/snapshots'),
  packages:       (p='')   => API.get('/packages' + p),
  package:        (name)   => API.get(`/packages/${name}`),
  packageHistory: (name)   => API.get(`/packages/${name}/history`),
  pendingRun:     ()       => API.get('/runs/pending'),
  run:            (id)     => API.get(`/runs/${id}`),
  mirrorSyncs:    ()       => API.get('/mirror/syncs'),
  startRun:       (id)     => API.put(`/runs/${id}/start`),
  createRun:      (body)   => API.post('/runs', body),
  createVersion:  (body)   => API.post('/packages/versions', body),
};

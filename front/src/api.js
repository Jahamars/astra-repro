const API = (() => {
  const base = () => localStorage.getItem('repro_api') || ENV.API_URL;

  const req = async (method, path, body) => {
    const r = await fetch(base() + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `${r.status} ${r.statusText}`);
    return data;
  };

  return {
    get:      path       => req('GET',  path),
    health:   ()         => req('GET',  '/health'),
    stats:    ()         => req('GET',  '/stats'),
    issues:   (q = '')   => req('GET',  '/stats/issues' + q),
    snapshots:()         => req('GET',  '/stats/snapshots'),
    packages: (q = '')   => req('GET',  '/packages' + q),
    package:  name       => req('GET',  `/packages/${name}`),
    pkgHistory: name     => req('GET',  `/packages/${name}/history`),
    runs:     (q = '')   => req('GET',  '/runs' + q),
    run:      id         => req('GET',  `/runs/${id}`),
  };
})();

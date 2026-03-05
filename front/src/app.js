const App = (() => {
  const VIEWS = {
    dashboard: { el: 'view-dashboard', mod: () => Dashboard },
    packages:  { el: 'view-packages',  mod: () => PackagesView },
    runs:      { el: 'view-runs',      mod: () => RunsView },
    issues:    { el: 'view-issues',    mod: () => IssuesView },
  };

  let _hTimer;

  function navigate(name) {
    if (!VIEWS[name]) return;
    for (const [k, v] of Object.entries(VIEWS))
      document.getElementById(v.el).classList.toggle('hidden', k !== name);
    document.querySelectorAll('.nav-link').forEach(a =>
      a.classList.toggle('active', a.dataset.view === name));
    VIEWS[name].mod().render();
  }

  async function health() {
    const dot = document.getElementById('api-dot');
    try { await API.health(); dot.className = 'dot ok'; }
    catch { dot.className = 'dot err'; }
  }

  function init() {
    document.getElementById('api-url').textContent =
      (localStorage.getItem('repro_api') || ENV.API_URL).replace(/https?:\/\//, '');

    document.querySelectorAll('.nav-link').forEach(a =>
      a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.view); }));

    document.getElementById('modal-close').addEventListener('click', UI.closeModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target.id === 'modal-overlay') UI.closeModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeModal(); });

    health();
    _hTimer = setInterval(health, 30_000);
    navigate('dashboard');
  }

  return { init, navigate };
})();

document.addEventListener('DOMContentLoaded', App.init);

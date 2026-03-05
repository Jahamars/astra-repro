const VIEWS = {
  dashboard: { el: 'view-dashboard', render: () => Dashboard.render() },
  packages:  { el: 'view-packages',  render: () => PackagesView.render() },
  runs:      { el: 'view-runs',      render: () => RunsView.render() },
  issues:    { el: 'view-issues',    render: () => IssuesView.render() },
  mirror:    { el: 'view-mirror',    render: () => MirrorView.render() },
};

function navigate(name) {
  if (!VIEWS[name]) return;
  Object.keys(VIEWS).forEach(k => {
    document.getElementById(VIEWS[k].el).classList.toggle('hidden', k !== name);
  });
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === name);
  });
  VIEWS[name].render();
}

async function checkHealth() {
  const dot = document.getElementById('api-status');
  try {
    await API.health();
    dot.className = 'status-dot ok';
  } catch {
    dot.className = 'status-dot err';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('api-url-display').textContent =
    API.base.replace(/https?:\/\//, '');

  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.view); });
  });

  document.getElementById('modal-close').addEventListener('click', UI.closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') UI.closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeModal(); });

  checkHealth();
  setInterval(checkHealth, 30000);
  navigate('dashboard');
});

(async () => {
  const user = await App.init('reports');
  if (!user) return;

  const charts = {};

  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function buildQuery() {
    const params = new URLSearchParams();
    const sheet = document.getElementById('filter-sheet').value;
    const owner = document.getElementById('filter-owner').value;
    const status = document.getElementById('filter-status').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;
    if (sheet) params.set('sheet', sheet);
    if (owner) params.set('owner', owner);
    if (status) params.set('status', status);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return params.toString();
  }

  // --- Tabs ---
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      loadTab(btn.dataset.tab);
    });
  });

  async function loadTab(tab) {
    const qs = buildQuery();
    if (tab === 'pipeline') return loadPipeline(qs);
    if (tab === 'winloss') return loadWinLoss(qs);
    if (tab === 'geography') return loadGeography(qs);
    if (tab === 'owners') return loadOwners(qs);
    if (tab === 'timeline') return loadTimeline(qs);
    if (tab === 'value') return loadValue(qs);
  }

  async function loadPipeline(qs) {
    const res = await App.api(`/reports/pipeline?${qs}`);
    destroyChart('pipeline');
    const ctx = document.getElementById('chart-pipeline');
    charts.pipeline = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: res.groups.map((g) => I18N.t('phase.' + g.phase)),
        datasets: [
          { label: I18N.t('common.total'), data: res.groups.map((g) => g.count), backgroundColor: '#3C3C3C' },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
    document.getElementById('pipeline-tbody').innerHTML = res.groups.map((g) => `
      <tr><td>${I18N.t('phase.' + g.phase)}</td><td>${g.count}</td><td>€ ${App.fmtMoney(g.total_value_eur)}</td></tr>
    `).join('');
  }

  async function loadWinLoss(qs) {
    const res = await App.api(`/reports/winloss?${qs}`);
    destroyChart('winloss');
    const ctx = document.getElementById('chart-winloss');
    const labels = Object.keys(res.counts);
    charts.winloss = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels.map((s) => I18N.t('status.' + s)),
        datasets: [{
          data: labels.map((s) => res.counts[s]),
          backgroundColor: ['#8A8C8E', '#2563AC', '#2E7D32', '#C0272D', '#B98300'],
        }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
    document.getElementById('winloss-summary').innerHTML = `
      <div><strong>${I18N.t('dashboard.kpi.avgWinProb')}:</strong> ${res.avg_win_probability !== null ? Math.round(res.avg_win_probability) + '%' : '-'}</div>
      <div><strong>${I18N.t('common.total')}:</strong> ${res.total}</div>
    `;
  }

  async function loadGeography(qs) {
    const res = await App.api(`/reports/geography?${qs}`);
    destroyChart('geography');
    const top10 = res.countries.slice(0, 10);
    const ctx = document.getElementById('chart-geography');
    charts.geography = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map((c) => c.country),
        datasets: [{ label: I18N.t('dashboard.table.price'), data: top10.map((c) => c.total_value_eur), backgroundColor: '#C0272D' }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
    document.getElementById('geography-tbody').innerHTML = res.countries.map((c) => `
      <tr><td>${c.country}</td><td>${c.count}</td><td>€ ${App.fmtMoney(c.total_value_eur)}</td><td>${c.avg_win_probability !== null ? Math.round(c.avg_win_probability) + '%' : '-'}</td></tr>
    `).join('');
  }

  async function loadOwners(qs) {
    const res = await App.api(`/reports/owners?${qs}`);
    destroyChart('owners');
    const ctx = document.getElementById('chart-owners');
    charts.owners = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: res.owners.map((o) => o.owner),
        datasets: [{ label: I18N.t('dashboard.table.price'), data: res.owners.map((o) => o.total_value_eur), backgroundColor: '#3C3C3C' }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
    document.getElementById('owners-tbody').innerHTML = res.owners.map((o) => `
      <tr><td>${o.owner}</td><td>${o.count}</td><td>€ ${App.fmtMoney(o.total_value_eur)}</td><td>${o.avg_win_probability !== null ? Math.round(o.avg_win_probability) + '%' : '-'}</td><td>${o.won}</td><td>${o.lost}</td></tr>
    `).join('');
  }

  async function loadTimeline(qs) {
    const res = await App.api(`/reports/timeline?${qs}`);
    destroyChart('timeline');
    const ctx = document.getElementById('chart-timeline');
    charts.timeline = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: res.timeline.map((t) => t.period),
        datasets: [
          { label: I18N.t('common.total'), data: res.timeline.map((t) => t.count), backgroundColor: '#2563AC', yAxisID: 'y' },
          { label: I18N.t('dashboard.table.price'), data: res.timeline.map((t) => t.total_value_eur), backgroundColor: '#C0272D', yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left' },
          y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } },
        },
      },
    });
    document.getElementById('overdue-tbody').innerHTML = res.overdue.length
      ? res.overdue.map((p) => `
          <tr><td>${p.project_code}</td><td>${p.project_name || ''}</td><td>${p.estimated_decision_date}</td><td>${p.owner || ''}</td></tr>
        `).join('')
      : `<tr><td colspan="4" class="text-muted" style="text-align:center;">${I18N.t('common.noData')}</td></tr>`;
  }

  async function loadValue(qs) {
    const res = await App.api(`/reports/pipeline-value?${qs}`);
    destroyChart('value');
    const ctx = document.getElementById('chart-value');
    charts.value = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: res.regions.map((r) => r.region),
        datasets: [{ label: I18N.t('dashboard.table.price'), data: res.regions.map((r) => r.total_value_eur), backgroundColor: '#3C3C3C' }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
    document.getElementById('value-tbody').innerHTML = res.regions.map((r) => `
      <tr><td>${r.region}</td><td>${r.count}</td><td>€ ${App.fmtMoney(r.total_value_eur)} ${r.projects_without_price ? `(${r.projects_without_price} w/o price)` : ''}</td></tr>
    `).join('');
  }

  document.getElementById('export-csv').addEventListener('click', () => {
    window.location.href = `/api/reports/export?format=csv&${buildQuery()}`;
  });
  document.getElementById('export-xlsx').addEventListener('click', () => {
    window.location.href = `/api/reports/export?format=xlsx&${buildQuery()}`;
  });

  ['filter-sheet', 'filter-owner', 'filter-status', 'filter-date-from', 'filter-date-to'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
      loadTab(activeTab);
    });
  });

  // Populate owner filter
  const meta = await App.api('/projects/meta');
  const ownerSelect = document.getElementById('filter-owner');
  meta.owners.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    ownerSelect.appendChild(opt);
  });

  loadPipeline(buildQuery());
})();

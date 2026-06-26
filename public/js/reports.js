(async () => {
  const user = await App.init('reports');
  if (!user) return;
  const hidePrices = user.role === 'mea_sales';

  const YELLOW = '#FFC600';
  const DARK = '#2A2A2A';
  const GREY = '#8A8C8E';
  const GREEN = '#2E7D32';
  const RED = '#C0272D';
  const LIGHT_YELLOW = '#FFF8E1';
  const PALETTE = ['#FFC600','#2A2A2A','#8A8C8E','#E6B200','#555','#BDBDBD','#D4A800','#666','#999','#FFD54F','#333','#AAA',
    '#C8A200','#777','#BBB','#E0C200','#444','#CCC','#B8960A','#888'];

  const charts = {};
  function kill(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
  function fmt(v) { return App.fmtMoney(v); }
  function pct(v) { return v != null ? Math.round(v) + '%' : '-'; }

  function buildQuery() {
    const p = new URLSearchParams();
    const owner = document.getElementById('f-owner').value;
    const status = document.getElementById('f-status').value;
    const country = document.getElementById('f-country').value;
    if (owner) p.set('owner', owner);
    if (status) p.set('status', status);
    if (country) p.set('country', country);
    return p.toString();
  }

  // Tabs
  document.querySelectorAll('.report-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.report-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('sec-' + btn.dataset.tab).classList.add('active');
      loadTab(btn.dataset.tab);
    });
  });

  // Filters
  ['f-owner','f-status','f-country'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      const tab = document.querySelector('.report-tab.active').dataset.tab;
      loadTab(tab);
    });
  });

  function loadTab(tab) {
    const qs = buildQuery();
    if (tab === 'overview') loadOverview(qs);
    if (tab === 'geography') loadGeography(qs);
    if (tab === 'owners') loadOwners(qs);
    if (tab === 'forecast') loadForecast(qs);
    if (tab === 'timeline') loadTimeline(qs);
    if (tab === 'activity') loadActivity(qs);
  }

  // ==================== OVERVIEW ====================
  async function loadOverview(qs) {
    const [pipeline, winloss] = await Promise.all([
      App.api('/reports/pipeline?' + qs),
      App.api('/reports/winloss?' + qs),
    ]);
    const sec = document.getElementById('sec-overview');

    const statsHtml = hidePrices ? `
      <div class="report-grid">
        <div class="stat-card"><div class="stat-label">Total Projects</div><div class="stat-value">${winloss.total}</div></div>
        <div class="stat-card"><div class="stat-label">Active</div><div class="stat-value yellow">${winloss.counts.active}</div></div>
        <div class="stat-card"><div class="stat-label">Won</div><div class="stat-value green">${winloss.counts.won}</div></div>
        <div class="stat-card"><div class="stat-label">Lost</div><div class="stat-value red">${winloss.counts.lost}</div></div>
      </div>
    ` : `
      <div class="report-grid">
        <div class="stat-card"><div class="stat-label">Total Projects</div><div class="stat-value">${winloss.total}</div></div>
        <div class="stat-card"><div class="stat-label">Active Pipeline</div><div class="stat-value yellow">€ ${fmt(winloss.activeValue)}</div></div>
        <div class="stat-card"><div class="stat-label">Won Value</div><div class="stat-value green">€ ${fmt(winloss.wonValue)}</div></div>
        <div class="stat-card"><div class="stat-label">Lost Value</div><div class="stat-value red">€ ${fmt(winloss.lostValue)}</div></div>
      </div>
      <div class="report-grid">
        <div class="stat-card"><div class="stat-label">Avg Win Probability</div><div class="stat-value">${pct(winloss.avg_win_probability)}</div></div>
        <div class="stat-card"><div class="stat-label">Win Rate</div><div class="stat-value green">${(winloss.counts.won + winloss.counts.lost) > 0 ? Math.round(winloss.counts.won / (winloss.counts.won + winloss.counts.lost) * 100) + '%' : '-'}</div></div>
        <div class="stat-card"><div class="stat-label">Active</div><div class="stat-value">${winloss.counts.active}</div></div>
        <div class="stat-card"><div class="stat-label">Won / Lost</div><div class="stat-value">${winloss.counts.won} / ${winloss.counts.lost}</div></div>
      </div>
    `;

    sec.innerHTML = statsHtml + `
      <div class="report-grid">
        <div class="chart-card"><h4>Projects by Status</h4><div class="chart-wrap"><canvas id="ch-status"></canvas></div></div>
        <div class="chart-card"><h4>Pipeline by Phase</h4><div class="chart-wrap"><canvas id="ch-phase"></canvas></div></div>
      </div>
    `;

    kill('status');
    charts.status = new Chart(document.getElementById('ch-status'), {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Won', 'Lost'],
        datasets: [{ data: [winloss.counts.active, winloss.counts.won, winloss.counts.lost], backgroundColor: [YELLOW, GREEN, RED], borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });

    kill('phase');
    const phaseLabels = pipeline.groups.map(g => g.phase.replace('project_stage', 'Project Stage').replace('tender', 'Tender').replace('order', 'Order').replace('delivery', 'Delivery'));
    const phaseColors = ['#90CAF9', '#FFC600', '#FF8F00', '#2E7D32'];
    charts.phase = new Chart(document.getElementById('ch-phase'), {
      type: 'bar',
      data: {
        labels: phaseLabels,
        datasets: hidePrices
          ? [{ label: 'Projects', data: pipeline.groups.map(g => g.count), backgroundColor: phaseColors, borderRadius: 4 }]
          : [{ label: 'Value €', data: pipeline.groups.map(g => g.value), backgroundColor: phaseColors, borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { callback: v => v >= 1000 ? (v/1000) + 'k' : v } } },
      },
    });
  }

  // ==================== GEOGRAPHY ====================
  async function loadGeography(qs) {
    const res = await App.api('/reports/geography?' + qs);
    const sec = document.getElementById('sec-geography');
    const top = res.countries.slice(0, 15);
    const maxVal = Math.max(...top.map(c => c.value), 1);

    sec.innerHTML = `
      <div class="chart-card" style="margin-bottom:16px;"><h4>Pipeline by Country</h4><div class="chart-wrap" style="height:${Math.max(280, top.length * 32)}px;"><canvas id="ch-geo"></canvas></div></div>
      <div class="chart-card">
        <h4>All Countries</h4>
        <div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Country</th><th class="num">Projects</th>${hidePrices ? '' : '<th class="money">Value EUR</th>'}<th class="num">Won</th><th class="num">Lost</th><th class="num">Win Rate</th><th class="num">Avg Win%</th></tr></thead>
            <tbody>${res.countries.map(c => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td class="num">${c.count}</td>
                ${hidePrices ? '' : `<td class="money">€ ${fmt(c.value)}</td>`}
                <td class="num">${c.won}</td>
                <td class="num">${c.lost}</td>
                <td class="num">${c.win_rate != null ? c.win_rate + '%' : '-'}</td>
                <td class="num">${pct(c.avg_prob)}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      </div>
    `;

    kill('geo');
    charts.geo = new Chart(document.getElementById('ch-geo'), {
      type: 'bar',
      data: {
        labels: top.map(c => c.name),
        datasets: hidePrices
          ? [{ label: 'Projects', data: top.map(c => c.count), backgroundColor: YELLOW, borderRadius: 4 }]
          : [{ label: 'Value €', data: top.map(c => c.value), backgroundColor: YELLOW, borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: '#f0f0f0' } }, y: { grid: { display: false } } },
      },
    });
  }

  // ==================== OWNERS ====================
  async function loadOwners(qs) {
    const res = await App.api('/reports/owners?' + qs);
    const sec = document.getElementById('sec-owners');

    sec.innerHTML = `
      <div class="report-grid">
        <div class="chart-card"><h4>${hidePrices ? 'Projects by Owner' : 'Pipeline Value by Owner'}</h4><div class="chart-wrap"><canvas id="ch-own-val"></canvas></div></div>
        <div class="chart-card"><h4>Win / Loss by Owner</h4><div class="chart-wrap"><canvas id="ch-own-wl"></canvas></div></div>
      </div>
      <div class="chart-card">
        <h4>Owner Performance</h4>
        <div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Owner</th><th class="num">Active</th><th class="num">Won</th><th class="num">Lost</th>${hidePrices ? '' : '<th class="money">Value EUR</th>'}<th class="num">Win Rate</th><th class="num">Avg Win%</th></tr></thead>
            <tbody>${res.owners.map(o => `
              <tr>
                <td><strong>${o.owner}</strong></td>
                <td class="num">${o.active}</td>
                <td class="num" style="color:${GREEN}">${o.won}</td>
                <td class="num" style="color:${RED}">${o.lost}</td>
                ${hidePrices ? '' : `<td class="money">€ ${fmt(o.value)}</td>`}
                <td class="num">${o.win_rate != null ? o.win_rate + '%' : '-'}</td>
                <td class="num">${pct(o.avg_prob)}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      </div>
    `;

    kill('own-val');
    charts['own-val'] = new Chart(document.getElementById('ch-own-val'), {
      type: 'bar',
      data: {
        labels: res.owners.map(o => o.owner),
        datasets: hidePrices
          ? [{ label: 'Projects', data: res.owners.map(o => o.count), backgroundColor: YELLOW, borderRadius: 4 }]
          : [{ label: 'Value €', data: res.owners.map(o => o.value), backgroundColor: YELLOW, borderRadius: 4 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } } },
    });

    kill('own-wl');
    charts['own-wl'] = new Chart(document.getElementById('ch-own-wl'), {
      type: 'bar',
      data: {
        labels: res.owners.map(o => o.owner),
        datasets: [
          { label: 'Won', data: res.owners.map(o => o.won), backgroundColor: GREEN, borderRadius: 4 },
          { label: 'Lost', data: res.owners.map(o => o.lost), backgroundColor: RED, borderRadius: 4 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: '#f0f0f0' } } } },
    });
  }

  // ==================== FORECAST ====================
  async function loadForecast(qs) {
    const res = await App.api('/reports/forecast?' + qs);
    const sec = document.getElementById('sec-forecast');
    const totalValue = res.forecast.reduce((s, f) => s + f.value, 0);
    const totalWeighted = res.forecast.reduce((s, f) => s + f.weighted, 0);

    sec.innerHTML = (hidePrices ? '' : `
      <div class="report-grid">
        <div class="stat-card"><div class="stat-label">Total Active Pipeline</div><div class="stat-value yellow">€ ${fmt(totalValue)}</div></div>
        <div class="stat-card"><div class="stat-label">Weighted Forecast</div><div class="stat-value green">€ ${fmt(totalWeighted)}</div></div>
      </div>
    `) + `
      <div class="chart-card" style="margin-bottom:16px;"><h4>Weighted Forecast by Month</h4><div class="chart-wrap"><canvas id="ch-forecast"></canvas></div></div>
      <div class="chart-card">
        <h4>Forecast Detail</h4>
        <div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Month</th><th class="num">Projects</th>${hidePrices ? '' : '<th class="money">Pipeline</th><th class="money">Weighted</th>'}</tr></thead>
            <tbody>${res.forecast.map(f => `
              <tr>
                <td><strong>${f.month}</strong></td>
                <td class="num">${f.count}</td>
                ${hidePrices ? '' : `<td class="money">€ ${fmt(f.value)}</td><td class="money" style="color:${GREEN}">€ ${fmt(Math.round(f.weighted))}</td>`}
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      </div>
    `;

    kill('forecast');
    charts.forecast = new Chart(document.getElementById('ch-forecast'), {
      type: 'bar',
      data: {
        labels: res.forecast.map(f => f.month),
        datasets: hidePrices
          ? [{ label: 'Projects', data: res.forecast.map(f => f.count), backgroundColor: YELLOW, borderRadius: 4 }]
          : [
              { label: 'Pipeline', data: res.forecast.map(f => f.value), backgroundColor: YELLOW + '88', borderRadius: 4 },
              { label: 'Weighted', data: res.forecast.map(f => Math.round(f.weighted)), backgroundColor: GREEN, borderRadius: 4 },
            ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } } },
    });
  }

  // ==================== TIMELINE ====================
  async function loadTimeline(qs) {
    const res = await App.api('/reports/timeline?' + qs);
    const sec = document.getElementById('sec-timeline');

    sec.innerHTML = `
      <div class="chart-card" style="margin-bottom:16px;"><h4>Projects by Decision Month</h4><div class="chart-wrap"><canvas id="ch-timeline"></canvas></div></div>
      ${res.overdue.length ? `
        <div class="chart-card">
          <h4>Overdue Projects <span class="overdue-tag">${res.overdue.length}</span></h4>
          <div class="table-wrap">
            <table class="report-table">
              <thead><tr><th>Code</th><th>Project</th><th>Decision Date</th><th>Owner</th></tr></thead>
              <tbody>${res.overdue.map(p => `
                <tr style="cursor:pointer" onclick="window.location='/project-detail.html?id=${p.id}'">
                  <td>${p.project_code}</td><td>${p.project_name || ''}</td><td class="overdue-tag">${p.estimated_decision_date}</td><td>${p.owner || ''}</td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;

    kill('timeline');
    charts.timeline = new Chart(document.getElementById('ch-timeline'), {
      type: 'bar',
      data: {
        labels: res.timeline.map(t => t.period),
        datasets: hidePrices
          ? [{ label: 'Projects', data: res.timeline.map(t => t.count), backgroundColor: YELLOW, borderRadius: 4 }]
          : [{ label: 'Value €', data: res.timeline.map(t => t.value), backgroundColor: YELLOW, borderRadius: 4 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } } },
    });
  }

  // ==================== ACTIVITY ====================
  async function loadActivity(qs) {
    const res = await App.api('/reports/activity?' + qs);
    const sec = document.getElementById('sec-activity');

    sec.innerHTML = `
      <div class="report-grid">
        <div class="stat-card"><div class="stat-label">Total Comments</div><div class="stat-value">${res.monthly.reduce((s, m) => s + m.count, 0)}</div></div>
        <div class="stat-card"><div class="stat-label">Stale Projects (30+ days)</div><div class="stat-value red">${res.stale.length}</div></div>
      </div>
      <div class="chart-card" style="margin-bottom:16px;"><h4>Comments per Month</h4><div class="chart-wrap"><canvas id="ch-activity"></canvas></div></div>
      ${res.stale.length ? `
        <div class="chart-card">
          <h4>Stale Projects <span class="stale-tag">No comments for 30+ days</span></h4>
          <div class="table-wrap">
            <table class="report-table">
              <thead><tr><th>Code</th><th>Project</th><th>Owner</th><th>Last Comment</th></tr></thead>
              <tbody>${res.stale.map(p => `
                <tr style="cursor:pointer" onclick="window.location='/project-detail.html?id=${p.id}'">
                  <td>${p.project_code}</td><td>${p.project_name || ''}</td><td>${p.owner || ''}</td><td>${p.last_comment ? App.fmtDateTime(p.last_comment) : '<span class="stale-tag">Never</span>'}</td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;

    kill('activity');
    if (res.monthly.length) {
      charts.activity = new Chart(document.getElementById('ch-activity'), {
        type: 'bar',
        data: {
          labels: res.monthly.map(m => m.month),
          datasets: [{ label: 'Comments', data: res.monthly.map(m => m.count), backgroundColor: YELLOW, borderRadius: 4 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#f0f0f0' }, beginAtZero: true }, x: { grid: { display: false } } } },
      });
    }
  }

  // ==================== INIT ====================
  const meta = await App.api('/projects/meta');
  const ownerSelect = document.getElementById('f-owner');
  meta.owners.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; ownerSelect.appendChild(opt); });
  const countrySelect = document.getElementById('f-country');
  meta.countries.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; countrySelect.appendChild(opt); });

  loadOverview(buildQuery());
})();

(async () => {
  const user = await App.init('reports');
  if (!user) return;
  if (user.role === 'mea_sales') { window.location.href = '/dashboard.html'; return; }
  const hidePrices = user.role === 'mea_sales';

  const t = (key) => I18N.t(key);

  const CN = {
    en: { TR:'Türkiye',AZ:'Azerbaijan',UZ:'Uzbekistan',KZ:'Kazakhstan',GE:'Georgia',SY:'Syria',IQ:'Iraq',TM:'Turkmenistan',MN:'Mongolia',EG:'Egypt',MA:'Morocco',DZ:'Algeria',LY:'Libya',TN:'Tunisia',TZ:'Tanzania',UG:'Uganda',KW:'Kuwait',AE:'UAE',OM:'Oman',JO:'Jordan',NC:'Northern Cyprus',BY:'Belarus',RU:'Russia',KG:'Kyrgyzstan',TJ:'Tajikistan',QA:'Qatar',SA:'Saudi Arabia',GR:'Greece',BG:'Bulgaria',AL:'Albania',MK:'North Macedonia',RS:'Serbia',UA:'Ukraine',CA:'Canada',OT:'Other' },
    cs: { TR:'Türkiye',AZ:'Ázerbájdžán',UZ:'Uzbekistán',KZ:'Kazachstán',GE:'Gruzie',SY:'Sýrie',IQ:'Irák',TM:'Turkmenistán',MN:'Mongolsko',EG:'Egypt',MA:'Maroko',DZ:'Alžírsko',LY:'Libye',TN:'Tunisko',TZ:'Tanzanie',UG:'Uganda',KW:'Kuvajt',AE:'SAE',OM:'Omán',JO:'Jordánsko',NC:'Severní Kypr',BY:'Bělorusko',RU:'Rusko',KG:'Kyrgyzstán',TJ:'Tádžikistán',QA:'Katar',SA:'Saúdská Arábie',GR:'Řecko',BG:'Bulharsko',AL:'Albánie',MK:'Severní Makedonie',RS:'Srbsko',UA:'Ukrajina',CA:'Kanada',OT:'Ostatní' },
  };
  function cName(code) { const map = CN[I18N.getLang()] || CN.en; return map[code] || code || ''; }
  const CC = { TR:'#EF9A9A',AZ:'#90CAF9',UZ:'#A5D6A7',KZ:'#FFF59D',GE:'#CE93D8',SY:'#BCAAA4',IQ:'#80CBC4',TM:'#FFAB91',MN:'#9FA8DA',EG:'#E6EE9C',MA:'#F48FB1',DZ:'#80DEEA',LY:'#FFE082',TN:'#B39DDB',TZ:'#C5E1A5',UG:'#F8BBD0',KW:'#80CBC4',AE:'#B39DDB',OM:'#FFCC80',JO:'#C8E6C9',NC:'#BBDEFB',BY:'#B0BEC5',RU:'#EF9A9A',CA:'#F8BBD0',KG:'#A5D6A7',TJ:'#90CAF9',QA:'#FFCC80',SA:'#C5E1A5',GR:'#90CAF9',BG:'#FFF59D',AL:'#EF9A9A',MK:'#CE93D8',RS:'#B39DDB',UA:'#FFE082' };
  CC['OT'] = '#E0E0E0';
  function cColor(code) { return CC[code] || '#8A8C8E'; }
  const OC = { Cem:'#90CAF9', Hakan:'#A5D6A7', Sefa:'#FFAB91', Ogün:'#CE93D8', Okan:'#FFF59D', Monika:'#F48FB1', Pavla:'#80DEEA', Petr:'#FFE082' };
  function oColor(name) { return OC[name] || '#B0BEC5'; }
  const PASTEL_SEQ = ['#EF9A9A','#90CAF9','#A5D6A7','#FFF59D','#CE93D8','#FFAB91','#80DEEA','#F48FB1','#FFE082','#B39DDB','#C5E1A5','#FFCC80'];

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
    const year = document.getElementById('f-year').value;
    if (owner) p.set('owner', owner);
    if (status) p.set('status', status);
    if (country) p.set('country', country);
    if (year) p.set('year', year);
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
  const REPORT_FILTER_IDS = ['f-owner','f-status','f-country','f-year'];

  function updateFilterHighlights() {
    REPORT_FILTER_IDS.forEach((id) => {
      const el = document.getElementById(id);
      const active = el.value !== '';
      el.classList.toggle('filter-active', active);
      el.closest('.form-group').classList.toggle('filter-active', active);
    });
  }

  REPORT_FILTER_IDS.forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      updateFilterHighlights();
      App.saveFilters('reports', REPORT_FILTER_IDS);
      const tab = document.querySelector('.report-tab.active').dataset.tab;
      loadTab(tab);
    });
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    REPORT_FILTER_IDS.forEach((id) => { document.getElementById(id).value = ''; });
    updateFilterHighlights();
    App.clearFilters('reports');
    const tab = document.querySelector('.report-tab.active').dataset.tab;
    loadTab(tab);
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
        <div class="stat-card"><div class="stat-label">${t('reports.stat.totalProjects')}</div><div class="stat-value">${winloss.total}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.active')}</div><div class="stat-value yellow">${winloss.counts.active}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.won')}</div><div class="stat-value green">${winloss.counts.won}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.lost')}</div><div class="stat-value red">${winloss.counts.lost}</div></div>
      </div>
    ` : `
      <div class="report-grid">
        <div class="stat-card"><div class="stat-label">${t('reports.stat.totalProjects')}</div><div class="stat-value">${winloss.total}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.activePipeline')}</div><div class="stat-value yellow">€ ${fmt(winloss.activeValue)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.wonValue')}</div><div class="stat-value green">€ ${fmt(winloss.wonValue)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.lostValue')}</div><div class="stat-value red">€ ${fmt(winloss.lostValue)}</div></div>
      </div>
      <div class="report-grid">
        <div class="stat-card"><div class="stat-label">${t('reports.stat.avgWinProb')}</div><div class="stat-value">${pct(winloss.avg_win_probability)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.avgAiProb')}</div><div class="stat-value">🤖 ${pct(winloss.avg_ai_probability)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.winRate')}</div><div class="stat-value green">${(winloss.counts.won + winloss.counts.lost) > 0 ? Math.round(winloss.counts.won / (winloss.counts.won + winloss.counts.lost) * 100) + '%' : '-'}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.active')}</div><div class="stat-value">${winloss.counts.active}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.stat.wonLost')}</div><div class="stat-value">${winloss.counts.won} / ${winloss.counts.lost}</div></div>
      </div>
    `;

    sec.innerHTML = statsHtml + `
      <div class="report-grid">
        <div class="chart-card"><h4>${t('reports.chart.projectsByStatus')}</h4><div class="chart-wrap"><canvas id="ch-status"></canvas></div></div>
        <div class="chart-card"><h4>${t('reports.chart.pipelineByPhase')}</h4><div class="chart-wrap"><canvas id="ch-phase"></canvas></div></div>
      </div>
    `;

    kill('status');
    charts.status = new Chart(document.getElementById('ch-status'), {
      type: 'doughnut',
      data: {
        labels: [t('status.active'), t('status.won'), t('status.lost')],
        datasets: [{ data: [winloss.counts.active, winloss.counts.won, winloss.counts.lost], backgroundColor: ['#FFE082', '#A5D6A7', '#EF9A9A'], borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });

    kill('phase');
    const phaseLabels = pipeline.groups.map(g => t('phase.' + g.phase));
    const phaseColors = ['#90CAF9', '#FFF59D', '#FFCC80', '#A5D6A7'];
    charts.phase = new Chart(document.getElementById('ch-phase'), {
      type: 'bar',
      data: {
        labels: phaseLabels,
        datasets: hidePrices
          ? [{ label: t('reports.legend.projects'), data: pipeline.groups.map(g => g.count), backgroundColor: phaseColors, borderRadius: 4 }]
          : [{ label: t('reports.legend.value'), data: pipeline.groups.map(g => g.value), backgroundColor: phaseColors, borderRadius: 4 }],
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
    res.countries.forEach(c => { c.name = cName(c.code); });
    const top = res.countries.slice(0, 15);

    sec.innerHTML = `
      <div class="chart-card" style="margin-bottom:16px;"><h4>${t('reports.chart.pipelineByCountry')}</h4><div class="chart-wrap" style="height:${Math.max(280, top.length * 32)}px;"><canvas id="ch-geo"></canvas></div></div>
      <div class="chart-card">
        <h4>${t('reports.chart.allCountries')}</h4>
        <div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>${t('reports.table.country')}</th><th class="num">${t('reports.table.projects')}</th>${hidePrices ? '' : `<th class="money">${t('reports.table.valueEur')}</th>`}<th class="num">${t('reports.table.won')}</th><th class="num">${t('reports.table.lost')}</th><th class="num">${t('reports.table.winRate')}</th><th class="num">${t('reports.table.avgWin')}</th><th class="num">${t('reports.table.avgAi')}</th></tr></thead>
            <tbody>${res.countries.map(c => `
              <tr>
                <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cColor(c.code)};margin-right:6px;vertical-align:middle;"></span><strong>${c.name}</strong></td>
                <td class="num">${c.count}</td>
                ${hidePrices ? '' : `<td class="money">€ ${fmt(c.value)}</td>`}
                <td class="num">${c.won}</td>
                <td class="num">${c.lost}</td>
                <td class="num">${c.win_rate != null ? c.win_rate + '%' : '-'}</td>
                <td class="num">${pct(c.avg_prob)}</td>
                <td class="num">${pct(c.avg_ai_prob)}</td>
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
          ? [{ label: t('reports.legend.projects'), data: top.map(c => c.count), backgroundColor: top.map(c => cColor(c.code)), borderRadius: 4 }]
          : [{ label: t('reports.legend.value'), data: top.map(c => c.value), backgroundColor: top.map(c => cColor(c.code)), borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: '#f0f0f0' }, title: { display: true, text: 'EUR', color: '#999', font: { size: 11 } } }, y: { grid: { display: false } } },
      },
    });
  }

  // ==================== OWNERS ====================
  async function loadOwners(qs) {
    const res = await App.api('/reports/owners?' + qs);
    const sec = document.getElementById('sec-owners');

    sec.innerHTML = `
      <div class="report-grid">
        <div class="chart-card"><h4>${hidePrices ? t('reports.chart.projectsByOwner') : t('reports.chart.pipelineByOwner')}</h4><div class="chart-wrap"><canvas id="ch-own-val"></canvas></div></div>
        <div class="chart-card"><h4>${t('reports.chart.winLossByOwner')}</h4><div class="chart-wrap"><canvas id="ch-own-wl"></canvas></div></div>
      </div>
      <div class="chart-card">
        <h4>${t('reports.chart.ownerPerformance')}</h4>
        <div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>${t('reports.table.owner')}</th><th class="num">${t('reports.table.active')}</th><th class="num">${t('reports.table.won')}</th><th class="num">${t('reports.table.lost')}</th>${hidePrices ? '' : `<th class="money">${t('reports.table.valueEur')}</th>`}<th class="num">${t('reports.table.winRate')}</th><th class="num">${t('reports.table.avgWin')}</th><th class="num">${t('reports.table.avgAi')}</th></tr></thead>
            <tbody>${res.owners.map(o => `
              <tr>
                <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${oColor(o.owner)};margin-right:6px;vertical-align:middle;"></span><strong>${o.owner}</strong></td>
                <td class="num">${o.active}</td>
                <td class="num" style="color:${GREEN}">${o.won}</td>
                <td class="num" style="color:${RED}">${o.lost}</td>
                ${hidePrices ? '' : `<td class="money">€ ${fmt(o.value)}</td>`}
                <td class="num">${o.win_rate != null ? o.win_rate + '%' : '-'}</td>
                <td class="num">${pct(o.avg_prob)}</td>
                <td class="num">${pct(o.avg_ai_prob)}</td>
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
          ? [{ label: t('reports.legend.projects'), data: res.owners.map(o => o.count), backgroundColor: res.owners.map(o => oColor(o.owner)), borderRadius: 4 }]
          : [{ label: t('reports.legend.value'), data: res.owners.map(o => o.value), backgroundColor: res.owners.map(o => oColor(o.owner)), borderRadius: 4 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } } },
    });

    kill('own-wl');
    charts['own-wl'] = new Chart(document.getElementById('ch-own-wl'), {
      type: 'bar',
      data: {
        labels: res.owners.map(o => o.owner),
        datasets: [
          { label: t('status.won'), data: res.owners.map(o => o.won), backgroundColor: '#A5D6A7', borderRadius: 4 },
          { label: t('status.lost'), data: res.owners.map(o => o.lost), backgroundColor: '#EF9A9A', borderRadius: 4 },
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
        <div class="stat-card"><div class="stat-label">${t('reports.chart.totalActivePipeline')}</div><div class="stat-value yellow">€ ${fmt(totalValue)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.chart.weightedForecastLabel')}</div><div class="stat-value green">€ ${fmt(totalWeighted)}</div></div>
      </div>
    `) + `
      <div class="chart-card" style="margin-bottom:16px;"><h4>${t('reports.chart.weightedForecast')}</h4><div class="chart-wrap"><canvas id="ch-forecast"></canvas></div></div>
      <div class="chart-card">
        <h4>${t('reports.chart.forecastDetail')}</h4>
        <div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>${t('reports.table.month')}</th><th class="num">${t('reports.table.projects')}</th>${hidePrices ? '' : `<th class="money">${t('reports.table.pipeline')}</th><th class="money">${t('reports.table.weighted')}</th>`}</tr></thead>
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
          ? [{ label: t('reports.legend.projects'), data: res.forecast.map(f => f.count), backgroundColor: res.forecast.map((f,i) => PASTEL_SEQ[i % PASTEL_SEQ.length]), borderRadius: 4 }]
          : [
              { label: t('reports.table.pipeline'), data: res.forecast.map(f => f.value), backgroundColor: res.forecast.map((f,i) => PASTEL_SEQ[i % PASTEL_SEQ.length] + '88'), borderRadius: 4 },
              { label: t('reports.table.weighted'), data: res.forecast.map(f => Math.round(f.weighted)), backgroundColor: res.forecast.map((f,i) => PASTEL_SEQ[i % PASTEL_SEQ.length]), borderRadius: 4 },
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
      <div class="chart-card" style="margin-bottom:16px;"><h4>${t('reports.chart.projectsByMonth')}</h4><div class="chart-wrap"><canvas id="ch-timeline"></canvas></div></div>
      ${res.overdue.length ? `
        <div class="chart-card">
          <h4>${t('reports.chart.overdueProjects')} <span class="overdue-tag">${res.overdue.length}</span></h4>
          <div class="table-wrap">
            <table class="report-table">
              <thead><tr><th>${t('reports.table.code')}</th><th>${t('reports.table.project')}</th><th>${t('reports.table.decisionDate')}</th><th>${t('reports.table.owner')}</th></tr></thead>
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
          ? [{ label: t('reports.legend.projects'), data: res.timeline.map(tl => tl.count), backgroundColor: res.timeline.map(tl => { const y = tl.period.slice(0,4); return y === '2026' ? '#90CAF9' : y === '2027' ? '#A5D6A7' : y === '2028' ? '#FFE082' : '#B0BEC5'; }), borderRadius: 4 }]
          : [{ label: t('reports.legend.value'), data: res.timeline.map(tl => tl.value), backgroundColor: res.timeline.map(tl => { const y = tl.period.slice(0,4); return y === '2026' ? '#90CAF9' : y === '2027' ? '#A5D6A7' : y === '2028' ? '#FFE082' : '#B0BEC5'; }), borderRadius: 4 }],
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
        <div class="stat-card"><div class="stat-label">${t('reports.chart.totalComments')}</div><div class="stat-value">${res.monthly.reduce((s, m) => s + m.count, 0)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('reports.chart.staleProjects')}</div><div class="stat-value red">${res.stale.length}</div></div>
      </div>
      <div class="chart-card" style="margin-bottom:16px;"><h4>${t('reports.chart.commentsPerMonth')}</h4><div class="chart-wrap"><canvas id="ch-activity"></canvas></div></div>
      ${res.stale.length ? `
        <div class="chart-card">
          <h4>${t('reports.chart.staleProjects')} <span class="stale-tag">${t('reports.chart.noCommentsTag')}</span></h4>
          <div class="table-wrap">
            <table class="report-table">
              <thead><tr><th>${t('reports.table.code')}</th><th>${t('reports.table.project')}</th><th>${t('reports.table.owner')}</th><th>${t('reports.table.lastComment')}</th></tr></thead>
              <tbody>${res.stale.map(p => `
                <tr style="cursor:pointer" onclick="window.location='/project-detail.html?id=${p.id}'">
                  <td>${p.project_code}</td><td>${p.project_name || ''}</td><td>${p.owner || ''}</td><td>${p.last_comment ? App.fmtDateTime(p.last_comment) : `<span class="stale-tag">${t('reports.table.never')}</span>`}</td>
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
          datasets: [{ label: t('reports.legend.comments'), data: res.monthly.map(m => m.count), backgroundColor: res.monthly.map((m,i) => PASTEL_SEQ[i % PASTEL_SEQ.length]), borderRadius: 4 }],
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
  meta.countries.sort((a, b) => cName(a).localeCompare(cName(b))).forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = cName(c); countrySelect.appendChild(opt); });

  App.restoreFilters('reports', REPORT_FILTER_IDS);
  updateFilterHighlights();

  loadOverview(buildQuery());
})();

(async () => {
  const user = await App.init('dashboard');
  if (!user) return;
  const hidePrices = user.role === 'mea_sales';

  const COUNTRY_NAMES = {
    cs: {
      'TR': 'Türkiye', 'AZ': 'Ázerbájdžán', 'UZ': 'Uzbekistán', 'KZ': 'Kazachstán',
      'GE': 'Gruzie', 'SY': 'Sýrie', 'IQ': 'Irák', 'TM': 'Turkmenistán',
      'MN': 'Mongolsko', 'EG': 'Egypt', 'MA': 'Maroko', 'DZ': 'Alžírsko',
      'LY': 'Libye', 'TN': 'Tunisko', 'TZ': 'Tanzanie', 'UG': 'Uganda',
      'KW': 'Kuvajt', 'AE': 'SAE', 'OM': 'Omán', 'JO': 'Jordánsko',
      'NC': 'Severní Kypr', 'BY': 'Bělorusko', 'RU': 'Rusko', 'CA': 'Kanada',
      'KG': 'Kyrgyzstán', 'TJ': 'Tádžikistán', 'QA': 'Katar', 'SA': 'Saúdská Arábie',
      'GR': 'Řecko', 'BG': 'Bulharsko', 'AL': 'Albánie', 'MK': 'Severní Makedonie',
      'RS': 'Srbsko', 'UA': 'Ukrajina',
    },
    en: {
      'TR': 'Türkiye', 'AZ': 'Azerbaijan', 'UZ': 'Uzbekistan', 'KZ': 'Kazakhstan',
      'GE': 'Georgia', 'SY': 'Syria', 'IQ': 'Iraq', 'TM': 'Turkmenistan',
      'MN': 'Mongolia', 'EG': 'Egypt', 'MA': 'Morocco', 'DZ': 'Algeria',
      'LY': 'Libya', 'TN': 'Tunisia', 'TZ': 'Tanzania', 'UG': 'Uganda',
      'KW': 'Kuwait', 'AE': 'United Arab Emirates', 'OM': 'Oman', 'JO': 'Jordan',
      'NC': 'Northern Cyprus', 'BY': 'Belarus', 'RU': 'Russia', 'CA': 'Canada',
      'KG': 'Kyrgyzstan', 'TJ': 'Tajikistan', 'QA': 'Qatar', 'SA': 'Saudi Arabia',
      'GR': 'Greece', 'BG': 'Bulgaria', 'AL': 'Albania', 'MK': 'North Macedonia',
      'RS': 'Serbia', 'UA': 'Ukraine',
    },
  };
  function countryName(c) {
    const map = COUNTRY_NAMES[I18N.getLang()] || COUNTRY_NAMES.cs;
    return map[c] || c || '';
  }

  let allProjects = [];
  let lastFiltered = [];
  let sortCol = 'id';
  let sortDir = 'desc';
  let activeRegion = '';

  function statusOf(p) {
    return p.status || 'active';
  }

  function winCell(p) {
    const manual = p.win_prob_manual_min;
    const ai = p.win_prob_ai;
    const main = manual !== null && manual !== undefined ? manual : ai;
    const cls = App.winBadgeClass(main);
    if (manual !== null && manual !== undefined && ai !== null && ai !== undefined) {
      return `<span class="${cls}">${manual}% / ${ai}%</span>`;
    }
    if (manual !== null && manual !== undefined) return `<span class="${cls}">${manual}%</span>`;
    if (ai !== null && ai !== undefined) return `<span class="${cls}">${ai}%</span>`;
    return '<span class="text-muted">-</span>';
  }

  function renderTable(projects) {
    const tbody = document.getElementById('projects-tbody');
    if (!projects.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="text-muted" style="text-align:center; padding:24px;">${I18N.t('common.noData')}</td></tr>`;
      return;
    }
    tbody.innerHTML = projects.map((p) => `
      <tr data-id="${p.id}">
        <td class="status-bar-cell"><span class="status-bar status-${statusOf(p)}"></span></td>
        <td>${p.project_name || ''}</td>
        <td>${p.company || ''}</td>
        <td>${countryName(p.country)}</td>
        ${hidePrices ? '' : `<td>${p.project_value_eur != null ? Number(p.project_value_eur).toLocaleString('de-DE', {maximumFractionDigits:0}) + ' €' : '-'}</td>`}
        <td>${p.win_prob_manual_min != null ? `<span class="${App.winBadgeClass(p.win_prob_manual_min)}">${p.win_prob_manual_min}%</span>` : '<span class="text-muted">-</span>'}</td>
        <td>${p.products_and_quantity || ''}</td>
        <td><span class="${App.statusBadgeClass(p.status)}">${I18N.t('status.' + (p.status || 'active'))}</span> <span class="text-muted">${p.phase ? I18N.t('phase.' + p.phase) : ''}</span></td>
        ${hidePrices ? '' : `<td>${p.ai_value_eur != null ? '🤖 ' + Number(p.ai_value_eur).toLocaleString('de-DE', {maximumFractionDigits:0}) + ' €' : '<span class="text-muted">-</span>'}</td>`}
        <td>${p.win_prob_ai != null ? `<span class="${App.winBadgeClass(p.win_prob_ai)}">${Math.round(p.win_prob_ai)}%</span>` : '<span class="text-muted">-</span>'}</td>
        <td>${p.estimated_decision_date ? String(p.estimated_decision_date).slice(0,7) : '-'}</td>
        <td class="text-muted">${p.created_at ? (() => { const d = new Date(p.created_at); return `${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`; })() : '-'}</td>
        <td class="text-muted">${p.updated_at ? (() => { const d = new Date(p.updated_at); return `${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`; })() : '-'}</td>
        <td>${p.owner || ''}</td>
        <td>${p.order_number || '<span class="text-muted">-</span>'}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const state = { region: activeRegion };
        FILTER_IDS.forEach((id) => { state[id] = document.getElementById(id).value; });
        sessionStorage.setItem('dashboardFilters', JSON.stringify(state));
        window.location.href = `/project-detail.html?id=${tr.dataset.id}`;
      });
    });
  }

  function fmtDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  }

  function renderCards(projects) {
    const wrap = document.getElementById('db-cards');
    if (!projects.length) {
      wrap.innerHTML = `<div class="text-muted" style="text-align:center; padding:24px;">${I18N.t('common.noData')}</div>`;
      return;
    }
    wrap.innerHTML = projects.map((p) => `
      <div class="db-card status-${statusOf(p)}" data-id="${p.id}">
        <div class="db-card-top">
          <span class="db-card-name">${p.project_name || p.company || '-'}</span>
          ${winCell(p)}
        </div>
        <div class="db-card-sub">${p.company || ''}${p.company && p.country ? ' · ' : ''}${countryName(p.country)}</div>
        <div class="db-card-row">
          <span><span class="${App.statusBadgeClass(p.status)}">${I18N.t('status.' + (p.status || 'active'))}</span> <span class="text-muted">${p.phase ? I18N.t('phase.' + p.phase) : ''}</span></span>
          ${hidePrices ? '' : `<span class="db-card-value">${p.project_value_eur != null ? Number(p.project_value_eur).toLocaleString('de-DE', {maximumFractionDigits:0}) + ' €' : '-'}</span>`}
        </div>
        <div class="db-card-meta">
          <span>${p.owner || ''}${p.order_number ? ' · #' + p.order_number : ''}</span>
          <span>${p.estimated_decision_date ? String(p.estimated_decision_date).slice(0,7) : fmtDate(p.created_at)}</span>
        </div>
      </div>
    `).join('');

    wrap.querySelectorAll('.db-card[data-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const state = { region: activeRegion };
        FILTER_IDS.forEach((id) => { state[id] = document.getElementById(id).value; });
        sessionStorage.setItem('dashboardFilters', JSON.stringify(state));
        window.location.href = `/project-detail.html?id=${card.dataset.id}`;
      });
    });
  }

  function renderKpis(projects) {
    document.getElementById('kpi-active').textContent = projects.length;

    const totalEur = projects.reduce((s, p) => s + (p.project_value_eur ?? p.ai_value_eur ?? 0), 0);
    document.getElementById('kpi-pipeline').textContent = '€ ' + App.fmtMoney(totalEur);

    const withProb = projects.filter((p) => p.win_prob_manual_min !== null && p.win_prob_manual_min !== undefined);
    const avgProb = withProb.length ? withProb.reduce((s, p) => s + p.win_prob_manual_min, 0) / withProb.length : null;
    document.getElementById('kpi-winprob').textContent = avgProb !== null ? Math.round(avgProb) + '%' : '-';
  }

  function applyFiltersAndRender() {
    const search = document.getElementById('filter-search').value.toLowerCase();
    const country = document.getElementById('filter-country').value;
    const win = document.getElementById('filter-win').value;
    const owner = document.getElementById('filter-owner').value;
    const status = document.getElementById('filter-status').value;
    const year = document.getElementById('filter-year').value;

    let filtered = allProjects.filter((p) => {
      if (country && p.country !== country) return false;
      if (win) {
        const prob = p.win_prob_manual_min;
        if (win === 'none' && prob != null) return false;
        if (win === 'low' && (prob == null || prob >= 30)) return false;
        if (win === 'mid' && (prob == null || prob < 30 || prob >= 70)) return false;
        if (win === 'high' && (prob == null || prob < 70)) return false;
      }
      if (owner && p.owner !== owner) return false;
      if (status && p.status !== status) return false;
      if (year && !(p.estimated_decision_date && String(p.estimated_decision_date).includes(year))) return false;
      if (search) {
        const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const haystack = norm(`${p.project_name || ''} ${p.company || ''} ${p.country || ''} ${p.owner || ''} ${p.products_and_quantity || ''}`);
        if (!haystack.includes(norm(search))) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      let av = a[sortCol];
      let bv = b[sortCol];
      if (av === null || av === undefined) av = '';
      if (bv === null || bv === undefined) bv = '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    lastFiltered = filtered;
    renderKpis(filtered);
    renderTable(filtered);
    renderCards(filtered);
  }

  function exportExcel() {
    const params = new URLSearchParams();
    const search = document.getElementById('filter-search').value;
    const country = document.getElementById('filter-country').value;
    const win = document.getElementById('filter-win').value;
    const status = document.getElementById('filter-status').value;
    const year = document.getElementById('filter-year').value;
    const owner = document.getElementById('filter-owner').value;
    if (search)  params.set('search', search);
    if (country) params.set('country', country);
    if (win)     params.set('win', win);
    if (status)  params.set('status', status);
    if (year)    params.set('year', year);
    if (owner)   params.set('owner', owner);
    window.location.href = `/api/projects/export?${params.toString()}`;
  }

  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);

  // Filters toggle (mobile)
  document.getElementById('filters-toggle').addEventListener('click', () => {
    const bar = document.getElementById('filters-bar');
    const btn = document.getElementById('filters-toggle');
    bar.classList.toggle('open');
    btn.innerHTML = (bar.classList.contains('open') ? '&#9650; ' : '&#9660; ') + I18N.t('dashboard.filters.toggle');
  });

  // Sorting
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      document.querySelectorAll('th[data-sort]').forEach((t) => t.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      applyFiltersAndRender();
    });
  });

  const FILTER_IDS = ['filter-search', 'filter-country', 'filter-win', 'filter-owner', 'filter-status', 'filter-year'];

  function updateFilterHighlights() {
    FILTER_IDS.forEach((id) => {
      const el = document.getElementById(id);
      const active = el.value !== '';
      el.classList.toggle('filter-active', active);
      el.closest('.form-group').classList.toggle('filter-active', active);
    });
  }

  FILTER_IDS.forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { updateFilterHighlights(); applyFiltersAndRender(); });
    el.addEventListener('change', () => { updateFilterHighlights(); applyFiltersAndRender(); });
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    FILTER_IDS.forEach((id) => { document.getElementById(id).value = ''; });
    updateFilterHighlights();
    applyFiltersAndRender();
  });

  // Load data
  try {
    const [projectsRes, metaRes] = await Promise.all([
      App.api('/projects'),
      App.api('/projects/meta'),
    ]);
    allProjects = projectsRes.projects;

    const countrySelect = document.getElementById('filter-country');
    const countries = [...new Set(allProjects.map(p => p.country).filter(Boolean))]
      .sort((a, b) => countryName(a).localeCompare(countryName(b)));
    countries.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = countryName(c);
      countrySelect.appendChild(opt);
    });

    const ownerSelect = document.getElementById('filter-owner');
    metaRes.owners.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      ownerSelect.appendChild(opt);
    });

    const saved = sessionStorage.getItem('dashboardFilters');
    if (saved) {
      const state = JSON.parse(saved);
      sessionStorage.removeItem('dashboardFilters');
      FILTER_IDS.forEach((id) => { if (state[id]) document.getElementById(id).value = state[id]; });
      updateFilterHighlights();
    }

    if (hidePrices) {
      document.querySelector('th[data-sort="project_value_eur"]')?.remove();
      document.querySelector('th[data-sort="ai_value_eur"]')?.remove();
      const pipelineCard = document.getElementById('kpi-pipeline')?.closest('.kpi-card');
      if (pipelineCard) pipelineCard.style.display = 'none';
    }

    applyFiltersAndRender();
    App.restoreScroll();
  } catch (err) {
    console.error(err);
    const tbody = document.getElementById('projects-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" style="color:red;padding:20px;text-align:center;">Loading error: ${err.message} (status: ${err.status || 'N/A'})</td></tr>`;
  }
})();

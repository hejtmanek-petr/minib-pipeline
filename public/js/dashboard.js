(async () => {
  const user = await App.init('dashboard');
  if (!user) return;

  const COUNTRY_NAMES = {
    cs: {
      'TR': 'Turecko', 'AZ': 'Ázerbájdžán', 'Az': 'Ázerbájdžán', 'GE': 'Gruzie',
      'KZ': 'Kazachstán', 'UZ': 'Uzbekistán', 'Mong': 'Mongolsko', 'CAN': 'Kanada',
      'CZ': 'Česko', 'SK': 'Slovensko',
      'Německo': 'Německo', 'Slovinsko': 'Slovinsko', 'Srbsko': 'Srbsko',
      'Itálie': 'Itálie', 'Rakousko': 'Rakousko', 'Rumunsko': 'Rumunsko',
      'Francie': 'Francie', 'USA': 'USA', 'Řecko': 'Řecko', 'Portugalsko': 'Portugalsko',
      'Kanada': 'Kanada', 'Arménie': 'Arménie',
    },
    en: {
      'TR': 'Turkey', 'AZ': 'Azerbaijan', 'Az': 'Azerbaijan', 'GE': 'Georgia',
      'KZ': 'Kazakhstan', 'UZ': 'Uzbekistan', 'Mong': 'Mongolia', 'CAN': 'Canada',
      'CZ': 'Czech Republic', 'SK': 'Slovakia',
      'Německo': 'Germany', 'Slovinsko': 'Slovenia', 'Srbsko': 'Serbia',
      'Itálie': 'Italy', 'Rakousko': 'Austria', 'Rumunsko': 'Romania',
      'Francie': 'France', 'USA': 'USA', 'Řecko': 'Greece', 'Portugalsko': 'Portugal',
      'Kanada': 'Canada', 'Arménie': 'Armenia',
    },
  };
  function countryName(c) {
    const map = COUNTRY_NAMES[I18N.getLang()] || COUNTRY_NAMES.cs;
    return map[c] || c || '';
  }

  const TUZEMSKO = new Set(['CZ', 'SK']);

  let allProjects = [];
  let sortCol = 'id';
  let sortDir = 'desc';
  let activeRegion = '';

  function statusOf(p) {
    return p.status || 'lead';
  }

  function winCell(p) {
    const manual = p.win_prob_manual_min;
    const ai = p.win_prob_ai;
    const parts = [];
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
      tbody.innerHTML = `<tr><td colspan="10" class="text-muted" style="text-align:center; padding:24px;">${I18N.t('common.noData')}</td></tr>`;
      return;
    }
    tbody.innerHTML = projects.map((p) => `
      <tr data-id="${p.id}">
        <td class="status-bar-cell"><span class="status-bar status-${statusOf(p)}"></span></td>
        <td>${p.project_name || ''}</td>
        <td>${p.company || ''}</td>
        <td>${countryName(p.country)}</td>
        <td>${p.project_value_eur != null ? Number(p.project_value_eur).toLocaleString('cs-CZ', {maximumFractionDigits:0}) + (TUZEMSKO.has(p.country) ? ' Kč' : ' €') : '-'}</td>
        <td>${p.project_value_local != null ? Number(p.project_value_local).toLocaleString('cs-CZ', {maximumFractionDigits:0}) + ' Kč' : '-'}</td>
        <td>${p.owner || ''}</td>
        <td><span class="${App.statusBadgeClass(p.status)}">${I18N.t('status.' + (p.status || 'lead'))}</span> <span class="text-muted">${p.phase ? I18N.t('phase.' + p.phase) : ''}</span></td>
        <td>${winCell(p)}</td>
        <td>${p.estimated_decision_date ? String(p.estimated_decision_date).slice(0,7) : '-'}</td>
        <td>${p.estimated_delivery_date ? String(p.estimated_delivery_date).slice(0,7) : '-'}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => {
        window.location.href = `/project-detail.html?id=${tr.dataset.id}`;
      });
    });
  }

  function renderKpis(projects) {
    const active = projects.filter((p) => p.status === 'active' || p.status === 'lead');
    document.getElementById('kpi-active').textContent = active.length;

    const withPrice = active.filter((p) => p.minib_price_eur !== null && p.minib_price_eur !== undefined);
    const withoutPrice = active.length - withPrice.length;
    const totalValue = withPrice.reduce((s, p) => s + p.minib_price_eur, 0);
    document.getElementById('kpi-pipeline').textContent = '€ ' + App.fmtMoney(totalValue);
    document.getElementById('kpi-pipeline-note').textContent = withoutPrice > 0
      ? I18N.t('dashboard.kpi.noPriceNote', { count: withoutPrice })
      : '';

    const withProb = projects.filter((p) => p.win_prob_manual_min !== null && p.win_prob_manual_min !== undefined);
    const avgProb = withProb.length ? withProb.reduce((s, p) => s + p.win_prob_manual_min, 0) / withProb.length : null;
    document.getElementById('kpi-winprob').textContent = avgProb !== null ? Math.round(avgProb) + '%' : '-';

    const trCount = projects.filter((p) => p.sheet === 'TR').length;
    const cisCount = projects.filter((p) => p.sheet === 'CIS').length;
    document.getElementById('kpi-region').textContent = `${trCount} / ${cisCount}`;
  }

  function applyFiltersAndRender() {
    const search = document.getElementById('filter-search').value.toLowerCase();
    const sheet = document.getElementById('filter-sheet').value;
    const country = document.getElementById('filter-country').value;
    const owner = document.getElementById('filter-owner').value;
    const status = document.getElementById('filter-status').value;
    const year = document.getElementById('filter-year').value;

    let filtered = allProjects.filter((p) => {
      if (activeRegion === 'tuzemsko' && !TUZEMSKO.has(p.country)) return false;
      if (activeRegion === 'mea' && TUZEMSKO.has(p.country)) return false;
      if (sheet && p.sheet !== sheet) return false;
      if (country && p.country !== country) return false;
      if (owner && p.owner !== owner) return false;
      if (status && p.status !== status) return false;
      if (year && !(p.estimated_decision_date && String(p.estimated_decision_date).includes(year))) return false;
      if (search) {
        const haystack = `${p.project_name || ''} ${p.company || ''} ${p.country || ''}`.toLowerCase();
        if (!haystack.includes(search)) return false;
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

    renderKpis(filtered);
    renderTable(filtered);
  }

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

  ['filter-search', 'filter-sheet', 'filter-country', 'filter-owner', 'filter-status', 'filter-year'].forEach((id) => {
    document.getElementById(id).addEventListener('input', applyFiltersAndRender);
    document.getElementById(id).addEventListener('change', applyFiltersAndRender);
  });

  document.querySelectorAll('.region-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRegion = btn.dataset.region;
      document.querySelectorAll('.region-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyFiltersAndRender();
    });
  });

  // Load data
  try {
    const [projectsRes, metaRes] = await Promise.all([
      App.api('/projects'),
      App.api('/projects/meta'),
    ]);
    allProjects = projectsRes.projects;

    const countrySelect = document.getElementById('filter-country');
    const countries = [...new Set(allProjects.map(p => p.country).filter(Boolean))].sort();
    countries.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      countrySelect.appendChild(opt);
    });

    const ownerSelect = document.getElementById('filter-owner');
    metaRes.owners.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      ownerSelect.appendChild(opt);
    });

    applyFiltersAndRender();
  } catch (err) {
    console.error(err);
  }
})();

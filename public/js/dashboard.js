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
      tbody.innerHTML = `<tr><td colspan="12" class="text-muted" style="text-align:center; padding:24px;">${I18N.t('common.noData')}</td></tr>`;
      return;
    }
    tbody.innerHTML = projects.map((p) => `
      <tr data-id="${p.id}">
        <td class="status-bar-cell"><span class="status-bar status-${statusOf(p)}"></span></td>
        <td>${p.project_name || ''}</td>
        <td>${p.company || ''}</td>
        <td>${countryName(p.country)}</td>
        <td>${!TUZEMSKO.has(p.country) && p.project_value_eur != null ? Number(p.project_value_eur).toLocaleString('cs-CZ', {maximumFractionDigits:0}) + ' €' : '-'}</td>
        <td>${TUZEMSKO.has(p.country) && p.project_value_eur != null ? Number(p.project_value_eur).toLocaleString('cs-CZ', {maximumFractionDigits:0}) + ' Kč' : (p.project_value_local != null ? Number(p.project_value_local).toLocaleString('cs-CZ', {maximumFractionDigits:0}) + ' Kč' : '-')}</td>
        <td>${p.products_and_quantity || ''}</td>
        <td><span class="${App.statusBadgeClass(p.status)}">${I18N.t('status.' + (p.status || 'lead'))}</span> <span class="text-muted">${p.phase ? I18N.t('phase.' + p.phase) : ''}</span></td>
        <td>${winCell(p)}</td>
        <td>${p.estimated_decision_date ? String(p.estimated_decision_date).slice(0,7) : '-'}</td>
        <td>${p.estimated_delivery_date ? String(p.estimated_delivery_date).slice(0,7) : '-'}</td>
        <td>${p.investor || ''}</td>
        <td>${p.general_contractor || ''}</td>
        <td>${p.installation_company || ''}</td>
        <td>${p.owner || ''}</td>
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

    const eurProjects = active.filter((p) => !TUZEMSKO.has(p.country) && p.project_value_eur != null);
    const totalEur = eurProjects.reduce((s, p) => s + p.project_value_eur, 0);
    document.getElementById('kpi-pipeline').textContent = '€ ' + App.fmtMoney(totalEur);

    const czkProjects = active.filter((p) => TUZEMSKO.has(p.country) && p.project_value_eur != null);
    const totalCzk = czkProjects.reduce((s, p) => s + p.project_value_eur, 0);
    document.getElementById('kpi-pipeline-czk').textContent = App.fmtMoney(totalCzk) + ' Kč';

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
      if (activeRegion === 'tuzemsko' && !TUZEMSKO.has(p.country)) return false;
      if (activeRegion === 'mea' && TUZEMSKO.has(p.country)) return false;
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
    activeRegion = '';
    document.querySelectorAll('.region-tab').forEach((b) => b.classList.remove('active'));
    document.querySelector('.region-tab[data-region=""]').classList.add('active');
    updateFilterHighlights();
    applyFiltersAndRender();
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

    applyFiltersAndRender();
  } catch (err) {
    console.error(err);
  }
})();

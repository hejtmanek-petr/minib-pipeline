(async () => {
  const user = await App.init('country-reports');
  if (!user) return;
  if (user.role === 'mea_sales') { window.location.href = '/dashboard.html'; return; }
  const hidePrices = user.role === 'mea_sales';

  const t = (key) => I18N.t(key);

  const COUNTRY_NAMES = {
    en: { TR:'Türkiye',AZ:'Azerbaijan',UZ:'Uzbekistan',KZ:'Kazakhstan',GE:'Georgia',SY:'Syria',IQ:'Iraq',TM:'Turkmenistan',MN:'Mongolia',EG:'Egypt',MA:'Morocco',DZ:'Algeria',LY:'Libya',TN:'Tunisia',TZ:'Tanzania',UG:'Uganda',KW:'Kuwait',AE:'UAE',OM:'Oman',JO:'Jordan',NC:'Northern Cyprus',BY:'Belarus',RU:'Russia',KG:'Kyrgyzstan',TJ:'Tajikistan',QA:'Qatar',SA:'Saudi Arabia',GR:'Greece',BG:'Bulgaria',AL:'Albania',MK:'North Macedonia',RS:'Serbia',UA:'Ukraine' },
    cs: { TR:'Türkiye',AZ:'Ázerbájdžán',UZ:'Uzbekistán',KZ:'Kazachstán',GE:'Gruzie',SY:'Sýrie',IQ:'Irák',TM:'Turkmenistán',MN:'Mongolsko',EG:'Egypt',MA:'Maroko',DZ:'Alžírsko',LY:'Libye',TN:'Tunisko',TZ:'Tanzanie',UG:'Uganda',KW:'Kuvajt',AE:'SAE',OM:'Omán',JO:'Jordánsko',NC:'Severní Kypr',BY:'Bělorusko',RU:'Rusko',KG:'Kyrgyzstán',TJ:'Tádžikistán',QA:'Katar',SA:'Saúdská Arábie',GR:'Řecko',BG:'Bulharsko',AL:'Albánie',MK:'Severní Makedonie',RS:'Srbsko',UA:'Ukrajina' },
  };
  function countryName(code) {
    const map = COUNTRY_NAMES[I18N.getLang()] || COUNTRY_NAMES.en;
    return map[code] || code;
  }

  // Real flag images (flagcdn.com) instead of Unicode flag emoji — Windows
  // (and so Edge/Chrome on Windows) has no built-in flag emoji glyphs for
  // most countries and renders blank, even though macOS/Safari does.
  // NC (Northern Cyprus) has no official ISO code/flag, so it gets a plain
  // gray placeholder instead of risking another unsupported glyph.
  function flagImg(code) {
    if (code === 'NC') return `<span class="flag-fallback">${code}</span>`;
    return `<img class="flag-img" src="https://flagcdn.com/${code.toLowerCase()}.svg" alt="${code}" onerror="this.outerHTML='<span class=&quot;flag-fallback&quot;>${code}</span>'">`;
  }

  function fmt(v) { return App.fmtMoney(v); }
  function pct(v) { return v != null ? Math.round(v) + '%' : '-'; }

  function trendBadge(trend) {
    if (!trend) return '<span class="text-muted">-</span>';
    const icon = trend === 'growing' ? '▲' : trend === 'declining' ? '▼' : '▬';
    return `<span class="trend-badge trend-${trend}">${icon} ${t('countryReports.trend.' + trend)}</span>`;
  }

  function contactsBadge(level) {
    if (!level) return '<span class="text-muted">-</span>';
    return `<span class="contacts-badge contacts-${level}">${t('countryReports.contacts.' + level)}</span>`;
  }

  function exclusivityBadge(code) {
    const level = exclusivityMap[code];
    if (!level) return '';
    return `<span class="exclusivity-badge exclusivity-${level}">${t('countryReports.exclusivity.' + level)}</span>`;
  }

  function initials(name) {
    return (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  let overview = [];
  let selectedCountry = null;
  let ownersList = [];
  let exclusivityMap = {};

  function renderOwnerChecks() {
    const wrap = document.getElementById('cr-form-owners');
    wrap.innerHTML = ownersList.map((name) => `
      <label class="cr-owner-check" data-owner="${name}">
        <input type="checkbox" value="${name}"> ${name}
      </label>
    `).join('');
    wrap.querySelectorAll('.cr-owner-check').forEach((label) => {
      const cb = label.querySelector('input');
      cb.addEventListener('change', () => label.classList.toggle('checked', cb.checked));
    });
  }

  function resetOwnerChecks() {
    document.querySelectorAll('#cr-form-owners input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
      cb.closest('.cr-owner-check').classList.remove('checked');
    });
  }

  function getCheckedOwners() {
    return [...document.querySelectorAll('#cr-form-owners input[type="checkbox"]:checked')].map((cb) => cb.value);
  }

  function ownersLine(owners) {
    if (!owners || !owners.length) return '';
    return `<div class="cr-opinion-owners"><b>${t('countryReports.field.responsibleOwners')}:</b> ${owners.join(', ')}</div>`;
  }

  async function loadOverview() {
    const res = await App.api('/country-reports/overview');
    overview = res.countries;
    renderRanking();
    renderGrid();
  }

  function scoreColor(score) {
    return score >= 2 ? '#2E7D32' : score >= 0 ? '#D4A800' : '#C0272D';
  }

  // Ranked list, best opportunity first — a plain score number says nothing
  // on its own, so every row also carries the pipeline value, win%, trend
  // and contacts level that make up that score.
  function renderRanking() {
    const sorted = [...overview].sort((a, b) => b.score - a.score);
    const maxScore = Math.max(1, ...sorted.map((c) => c.score));
    const minScore = Math.min(0, ...sorted.map((c) => c.score));
    const range = Math.max(0.1, maxScore - minScore);

    document.getElementById('cr-ranking').innerHTML = sorted.map((c, i) => {
      const barPct = Math.max(4, Math.round((c.score - minScore) / range * 100));
      return `
        <div class="cr-rank-row">
          <div class="cr-rank-num">#${i + 1}</div>
          <div class="cr-rank-flag">${flagImg(c.code)}</div>
          <div class="cr-rank-name">${countryName(c.code)}</div>
          <div class="cr-rank-bar-track"><div class="cr-rank-bar-fill" style="width:${barPct}%; background:${scoreColor(c.score)};"></div></div>
          <div class="cr-rank-stats">
            <span>${t('countryReports.table.projects')}: <b>${c.active_count}</b></span>
            ${hidePrices ? '' : `<span><b>€ ${fmt(c.pipeline_value_eur)}</b></span>`}
            <span>${t('countryReports.table.avgWin')}: <b>${pct(c.avg_win_prob)}</b></span>
            ${exclusivityBadge(c.code)}
            ${c.latest ? trendBadge(c.latest.trend) : ''}
            ${c.latest ? contactsBadge(c.latest.contacts_level) : ''}
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('#cr-ranking .cr-rank-row').forEach((row, i) => {
      row.addEventListener('click', () => openCountry(sorted[i].code));
      row.style.cursor = 'pointer';
    });
  }

  function renderGrid() {
    const grid = document.getElementById('cr-grid');
    grid.innerHTML = overview.map((c) => {
      const trendClass = c.latest && c.latest.trend ? `trend-${c.latest.trend}` : '';
      return `
        <div class="cr-card ${trendClass}${c.code === selectedCountry ? ' selected' : ''}" data-code="${c.code}">
          <div class="cr-card-flag">${flagImg(c.code)}</div>
          <div class="cr-card-name">${countryName(c.code)}</div>
          <div class="cr-card-stats">
            <span>${t('countryReports.table.projects')}: <b>${c.active_count}</b></span>
            ${hidePrices ? '' : `<span><b>€ ${fmt(c.pipeline_value_eur)}</b></span>`}
          </div>
          <div class="cr-card-badges">
            ${exclusivityBadge(c.code)}
            ${c.latest ? trendBadge(c.latest.trend) : ''}
            ${c.latest ? contactsBadge(c.latest.contacts_level) : ''}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.cr-card').forEach((card) => {
      card.addEventListener('click', () => openCountry(card.dataset.code));
    });
  }

  async function openCountry(code) {
    selectedCountry = code;
    renderGrid();

    const c = overview.find((x) => x.code === code);
    const detail = document.getElementById('cr-detail');
    detail.classList.add('open');
    document.getElementById('cr-detail-flag').innerHTML = flagImg(code);
    document.getElementById('cr-detail-title').textContent = countryName(code);
    document.getElementById('cr-detail-stats').innerHTML = `
      ${exclusivityBadge(code)}
      <span>${t('countryReports.table.projects')}: <b>${c.active_count}</b></span>
      ${hidePrices ? '' : `<span>${t('countryReports.table.pipelineValue')}: <b>€ ${fmt(c.pipeline_value_eur)}</b></span>`}
      <span>${t('countryReports.table.avgWin')}: <b>${pct(c.avg_win_prob)}</b></span>
    `;
    ['cr-form-trend', 'cr-form-contacts'].forEach((id) => document.getElementById(id).value = '');
    ['cr-form-political', 'cr-form-economic', 'cr-form-note'].forEach((id) => document.getElementById(id).value = '');
    resetOwnerChecks();

    await loadOpinions(code);
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadOpinions(code) {
    const res = await App.api(`/country-reports/${code}`);
    const el = document.getElementById('cr-opinions');
    if (!res.reports.length) {
      el.innerHTML = `<div class="cr-no-opinions">${t('countryReports.noHistory')}</div>`;
      return;
    }

    // Group by owner: the newest report per owner is the "headline" opinion,
    // older ones from the same person collapse under a toggle.
    const byOwner = new Map();
    for (const r of res.reports) {
      if (!byOwner.has(r.user_name)) byOwner.set(r.user_name, []);
      byOwner.get(r.user_name).push(r);
    }

    const isAdmin = user.role === 'admin';
    el.innerHTML = [...byOwner.entries()].map(([ownerName, entries]) => {
      const latest = entries[0];
      const older = entries.slice(1);
      const trendClass = latest.trend ? `trend-${latest.trend}` : '';
      return `
        <div class="cr-opinion-card ${trendClass}">
          <div class="cr-opinion-head">
            <div class="cr-opinion-avatar">${initials(ownerName)}</div>
            <div>
              <div class="cr-opinion-owner">${ownerName}</div>
              <div class="cr-opinion-date">${App.fmtDateTime(latest.created_at)}</div>
            </div>
            ${isAdmin ? `<button class="cr-del-btn" data-id="${latest.id}">${t('countryReports.delete')}</button>` : ''}
          </div>
          <div class="cr-opinion-badges">${trendBadge(latest.trend)}${contactsBadge(latest.contacts_level)}</div>
          ${ownersLine(latest.responsible_owners)}
          ${latest.political_situation ? `<div class="cr-opinion-text"><b>${t('countryReports.field.politicalSituation')}</b>${latest.political_situation}</div>` : ''}
          ${latest.economic_situation ? `<div class="cr-opinion-text"><b>${t('countryReports.field.economicSituation')}</b>${latest.economic_situation}</div>` : ''}
          ${latest.note ? `<div class="cr-opinion-text"><b>${t('countryReports.field.note')}</b>${latest.note}</div>` : ''}
          ${older.length ? `<button class="cr-opinion-more" data-owner="${ownerName}">${t('countryReports.olderReports').replace('{count}', older.length)}</button>` : ''}
          ${older.length ? `<div class="cr-opinion-older" id="older-${ownerName.replace(/\s+/g, '_')}">${older.map((o) => `
            <div class="cr-opinion-older-item">
              ${App.fmtDateTime(o.created_at)} — ${trendBadge(o.trend)} ${contactsBadge(o.contacts_level)}
              ${ownersLine(o.responsible_owners)}
              ${o.political_situation ? `<div>${t('countryReports.field.politicalSituation')}: ${o.political_situation}</div>` : ''}
              ${o.economic_situation ? `<div>${t('countryReports.field.economicSituation')}: ${o.economic_situation}</div>` : ''}
              ${o.note ? `<div>${t('countryReports.field.note')}: ${o.note}</div>` : ''}
              ${isAdmin ? `<button class="cr-del-btn" data-id="${o.id}">${t('countryReports.delete')}</button>` : ''}
            </div>
          `).join('')}</div>` : ''}
        </div>
      `;
    }).join('');

    el.querySelectorAll('.cr-opinion-more').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('older-' + btn.dataset.owner.replace(/\s+/g, '_')).classList.toggle('open');
      });
    });

    el.querySelectorAll('.cr-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('countryReports.confirmDelete'))) return;
        await App.api(`/country-reports/entry/${btn.dataset.id}`, { method: 'DELETE' });
        await loadOpinions(code);
        await loadOverview();
      });
    });
  }

  document.getElementById('cr-form-submit').addEventListener('click', async () => {
    if (!selectedCountry) return;
    const responsible_owners = getCheckedOwners();
    const body = {
      trend: document.getElementById('cr-form-trend').value || null,
      contacts_level: document.getElementById('cr-form-contacts').value || null,
      political_situation: document.getElementById('cr-form-political').value.trim() || null,
      economic_situation: document.getElementById('cr-form-economic').value.trim() || null,
      note: document.getElementById('cr-form-note').value.trim() || null,
      responsible_owners,
    };
    if (!body.trend && !body.contacts_level && !body.political_situation && !body.economic_situation && !body.note && !responsible_owners.length) return;

    const btn = document.getElementById('cr-form-submit');
    btn.disabled = true;
    try {
      await App.api(`/country-reports/${selectedCountry}`, { method: 'POST', body });
      ['cr-form-trend', 'cr-form-contacts'].forEach((id) => document.getElementById(id).value = '');
      ['cr-form-political', 'cr-form-economic', 'cr-form-note'].forEach((id) => document.getElementById(id).value = '');
      resetOwnerChecks();
      await loadOpinions(selectedCountry);
      await loadOverview();
    } catch (e) {
      alert(e.message || 'Error');
    } finally {
      btn.disabled = false;
    }
  });

  const EXCLUDED_OWNERS = new Set(['Monika', 'Petr', 'Pavla']);
  const meta = await App.api('/projects/meta');
  ownersList = (meta.owners || []).filter((name) => !EXCLUDED_OWNERS.has(name));
  exclusivityMap = meta.country_exclusivity || {};
  renderOwnerChecks();

  await loadOverview();
})();

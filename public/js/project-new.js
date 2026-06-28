(async () => {
  const user = await App.init('new-project');
  if (!user) return;

  const meta = await App.api('/projects/meta');

  const COUNTRY_NAMES = {
    cs: { 'TR':'Türkiye','AZ':'Ázerbájdžán','UZ':'Uzbekistán','KZ':'Kazachstán','GE':'Gruzie','SY':'Sýrie','IQ':'Irák','TM':'Turkmenistán','MN':'Mongolsko','EG':'Egypt','MA':'Maroko','DZ':'Alžírsko','LY':'Libye','TN':'Tunisko','TZ':'Tanzanie','UG':'Uganda','KW':'Kuvajt','AE':'SAE','OM':'Omán','JO':'Jordánsko','NC':'Severní Kypr','BY':'Bělorusko','RU':'Rusko' },
    en: { 'TR':'Türkiye','AZ':'Azerbaijan','UZ':'Uzbekistan','KZ':'Kazakhstan','GE':'Georgia','SY':'Syria','IQ':'Iraq','TM':'Turkmenistan','MN':'Mongolia','EG':'Egypt','MA':'Morocco','DZ':'Algeria','LY':'Libya','TN':'Tunisia','TZ':'Tanzania','UG':'Uganda','KW':'Kuwait','AE':'United Arab Emirates','OM':'Oman','JO':'Jordan','NC':'Northern Cyprus','BY':'Belarus','RU':'Russia' },
  };
  function countryLabel(code) {
    const map = COUNTRY_NAMES[I18N.getLang()] || COUNTRY_NAMES.cs;
    return map[code] || code || '';
  }

  function fillSelect(id, options, labelFn) {
    const sel = document.getElementById(id);
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '-';
    sel.appendChild(empty);
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = labelFn ? labelFn(opt) : opt;
      sel.appendChild(o);
    });
  }

  fillSelect('f-country', (meta.countries || []).sort((a, b) => countryLabel(a).localeCompare(countryLabel(b))), countryLabel);
  fillSelect('f-building_type', meta.building_types || []);
  fillSelect('f-owner', meta.owners || []);
  fillSelect('f-status', meta.statuses || [], (v) => I18N.t('status.' + v));
  fillSelect('f-phase', meta.phases || [], (v) => I18N.t('phase.' + v));

  // Month/year dropdowns
  function buildMonthDropdown(wrapperId) {
    const wrap = document.getElementById(wrapperId);
    const currentYear = new Date().getFullYear();
    const monthNames = {
      cs: ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'],
      en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    };
    const names = monthNames[I18N.getLang()] || monthNames.cs;

    const selYear = document.createElement('select');
    const selMonth = document.createElement('select');

    const emptyOpt = (s, t) => { const o = document.createElement('option'); o.value = ''; o.textContent = t; s.appendChild(o); };
    emptyOpt(selYear, 'Year');
    emptyOpt(selMonth, 'Month');

    for (let y = 2026; y <= currentYear + 5; y++) {
      const o = document.createElement('option'); o.value = y; o.textContent = y; selYear.appendChild(o);
    }
    ['01','02','03','04','05','06','07','08','09','10','11','12'].forEach((m, i) => {
      const o = document.createElement('option'); o.value = m; o.textContent = names[i]; selMonth.appendChild(o);
    });

    wrap.appendChild(selYear);
    wrap.appendChild(selMonth);
    return { getValue: () => selYear.value && selMonth.value ? `${selYear.value}-${selMonth.value}` : null };
  }

  const decisionDate = buildMonthDropdown('f-decision-wrap');

  function parseNum(id) {
    const v = document.getElementById(id).value.replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  document.getElementById('btn-create').addEventListener('click', async () => {
    const body = {
      country: document.getElementById('f-country').value || null,
      project_name: document.getElementById('f-project_name').value || null,
      company: document.getElementById('f-company').value || null,
      building_type: document.getElementById('f-building_type').value || null,
      owner: document.getElementById('f-owner').value || null,
      status: document.getElementById('f-status').value || 'active',
      phase: document.getElementById('f-phase').value || null,
      estimated_decision_date: decisionDate.getValue(),
      products_and_quantity: document.getElementById('f-products_and_quantity').value || null,
      competition: document.getElementById('f-competition').value || null,
      current_status_note: document.getElementById('f-current_status_note').value || null,
      project_value_eur: parseNum('f-project_value_eur'),
    };
    const res = await App.api('/projects', { method: 'POST', body });
    window.location.href = `/project-detail.html?id=${res.project.id}`;
  });

})();

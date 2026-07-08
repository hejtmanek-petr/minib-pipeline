(async () => {
  const isUsersPage = !!document.getElementById('add-user-btn');
  const user = await App.init(isUsersPage ? 'users' : 'settings', { requireHQ: true });
  if (!user) return;

  if (isUsersPage) await initUsersPage();
  else await initSettingsPage();

  async function initUsersPage() {
    async function loadUsers() {
      const res = await App.api('/admin/users');
      const tbody = document.getElementById('users-tbody');
      tbody.innerHTML = res.users.map((u) => `
        <tr data-id="${u.id}">
          <td>${u.email}</td>
          <td>${u.name}</td>
          <td>${u.role}</td>
          <td>${(u.countries || []).join(', ')}</td>
          <td>${u.is_active ? I18N.t('common.yes') : I18N.t('common.no')}</td>
          <td class="flex gap-8">
            <button class="btn btn-secondary edit-user" data-id="${u.id}">${I18N.t('common.edit')}</button>
            <button class="btn btn-secondary reset-pw" data-id="${u.id}">${I18N.t('admin.users.resetPassword')}</button>
            ${u.is_active ? `<button class="btn btn-secondary deactivate-user" data-id="${u.id}">${I18N.t('admin.users.deactivate')}</button>` : ''}
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.edit-user').forEach((btn) => {
        btn.addEventListener('click', () => {
          const u = res.users.find((x) => x.id === parseInt(btn.dataset.id, 10));
          openModal(u);
        });
      });
      tbody.querySelectorAll('.reset-pw').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const r = await App.api(`/admin/users/${btn.dataset.id}/reset-password`, { method: 'POST' });
          alert(`${I18N.t('admin.users.newPasswordGenerated')}: ${r.password}`);
        });
      });
      tbody.querySelectorAll('.deactivate-user').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(I18N.t('admin.users.deactivate') + '?')) return;
          await App.api(`/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
          await loadUsers();
        });
      });
    }

    const modal = document.getElementById('user-modal');
    function openModal(u) {
      document.getElementById('generated-password').style.display = 'none';
      document.getElementById('u-id').value = u ? u.id : '';
      document.getElementById('u-email').value = u ? u.email : '';
      document.getElementById('u-email').disabled = !!u;
      document.getElementById('u-name').value = u ? u.name : '';
      document.getElementById('u-role').value = u ? u.role : 'DEALER';
      document.getElementById('u-countries').value = u && u.countries ? u.countries.join(',') : '';
      document.getElementById('u-lang').value = u ? u.preferred_language : 'en';
      modal.style.display = 'flex';
    }

    document.getElementById('add-user-btn').addEventListener('click', () => openModal(null));
    document.getElementById('close-user-modal').addEventListener('click', () => { modal.style.display = 'none'; });

    document.getElementById('user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('u-id').value;
      const countries = document.getElementById('u-countries').value
        .split(',').map((c) => c.trim()).filter(Boolean);

      const body = {
        name: document.getElementById('u-name').value,
        role: document.getElementById('u-role').value,
        countries,
        preferred_language: document.getElementById('u-lang').value,
      };

      if (id) {
        await App.api(`/admin/users/${id}`, { method: 'PUT', body });
        modal.style.display = 'none';
      } else {
        body.email = document.getElementById('u-email').value;
        const res = await App.api('/admin/users', { method: 'POST', body });
        if (res.generatedPassword) {
          const el = document.getElementById('generated-password');
          el.textContent = `${I18N.t('admin.users.newPasswordGenerated')}: ${res.generatedPassword}`;
          el.style.display = 'block';
        } else {
          modal.style.display = 'none';
        }
      }
      await loadUsers();
    });

    await loadUsers();
  }

  async function initSettingsPage() {
    const res = await App.api('/admin/settings');
    const settings = res.settings;

    const CN = { TR:'Türkiye',AZ:'Azerbaijan',UZ:'Uzbekistan',KZ:'Kazakhstan',GE:'Georgia',SY:'Syria',IQ:'Iraq',TM:'Turkmenistan',MN:'Mongolia',EG:'Egypt',MA:'Morocco',DZ:'Algeria',LY:'Libya',TN:'Tunisia',TZ:'Tanzania',UG:'Uganda',KW:'Kuwait',AE:'United Arab Emirates',OM:'Oman',JO:'Jordan',NC:'Northern Cyprus',BY:'Belarus',RU:'Russia',KG:'Kyrgyzstan',TJ:'Tajikistan',QA:'Qatar',SA:'Saudi Arabia',GR:'Greece',BG:'Bulgaria',AL:'Albania',MK:'North Macedonia',RS:'Serbia',UA:'Ukraine',CA:'Canada',OT:'Other' };

    const fields = ['countries', 'building_types', 'phases', 'statuses'];
    for (const key of fields) {
      const el = document.getElementById('s-' + key);
      if (!el) continue;
      if (key === 'countries') {
        el.value = (settings[key] || []).map(c => CN[c] ? `${CN[c]} (${c})` : c).join(', ');
      } else {
        el.value = (settings[key] || []).join(', ');
      }
    }

    document.querySelectorAll('.save-list').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key;
        let value = document.getElementById(`s-${key}`).value.split(',').map((s) => s.trim()).filter(Boolean);
        if (key === 'countries') {
          value = value.map(v => { const m = v.match(/\(([A-Z]{2})\)/); return m ? m[1] : v; });
        }
        await App.api(`/admin/settings/${key}`, { method: 'PUT', body: { value } });
        alert(I18N.t('profile.saved'));
      });
    });
  }
})();

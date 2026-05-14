const STAT_CARDS = [
  { key: 'today',         label: 'Today',           color: '#2563eb', bg: '#eff6ff' },
  { key: 'awaiting_loic', label: 'Awaiting Loic',   color: '#ea580c', bg: '#fff7ed' },
  { key: 'pending_email', label: 'Pending Email',   color: '#d97706', bg: '#fffbeb' },
  { key: 'total',         label: 'All Packages',    color: '#475569', bg: '#f8fafc' },
];

const STATUS_FILTERS = [
  { value: 'all',                   label: 'All' },
  { value: 'received',              label: 'Received' },
  { value: 'awaiting_loic',         label: 'Awaiting Loic' },
  { value: 'discrepancy',           label: 'Item Discrepancy' },
  { value: 'awaiting_confirmation', label: 'Awaiting Item Confirmation' },
  { value: 'delivered',             label: 'Delivered' },
];

let activeStatuses = ['all'], searchVal = '', dateVal = '', sortMode = 'created_at_DESC', debounceTimer;

function getSortParams() {
  const [sortBy, sortOrder] = sortMode.split('_');
  return { sortBy, sortOrder };
}

async function loadStats() {
  try {
    const s = await api('GET', '/api/packages/stats');
    document.getElementById('stats-row').innerHTML = STAT_CARDS.map(c => `
      <div class="stat-card" style="background:${c.bg};" onclick="setStatusFilter('${c.key === 'today' || c.key === 'pending_email' ? 'all' : c.key}')">
        <div class="stat-number" style="color:${c.color}">${s[c.key] ?? 0}</div>
        <div class="stat-label">${c.label}</div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

function buildChips() {
  document.getElementById('status-chips').innerHTML = STATUS_FILTERS.map(f => `
    <button class="status-chip${activeStatuses.includes(f.value) ? ' active' : ''}" data-val="${f.value}">${f.label}</button>
  `).join('');
  document.querySelectorAll('.status-chip').forEach(btn =>
    btn.addEventListener('click', () => toggleStatusFilter(btn.dataset.val))
  );
}

function toggleStatusFilter(val) {
  if (val === 'all') {
    activeStatuses = ['all'];
  } else {
    if (activeStatuses.includes('all')) activeStatuses = [];
    if (activeStatuses.includes(val)) {
      activeStatuses = activeStatuses.filter(v => v !== val);
      if (activeStatuses.length === 0) activeStatuses = ['all'];
    } else {
      activeStatuses.push(val);
    }
  }
  buildChips();
  loadPackages();
}

function setStatusFilter(val) { // legacy single-select support
  activeStatuses = [val];
  buildChips();
  loadPackages();
}

function refreshDashboard() {
  loadStats();
  loadPackages();
}

async function loadPackages() {
  try {
    const p = new URLSearchParams();
    const { sortBy, sortOrder } = getSortParams();
    if (!activeStatuses.includes('all')) p.set('status', activeStatuses.join(','));
    if (searchVal) p.set('search', searchVal);
    if (dateVal) p.set('date', dateVal);
    p.set('sortBy', sortBy);
    p.set('order', sortOrder);
    renderList(api('GET', `/api/packages?${p}`));
  } catch (e) { toast('Failed to load packages', 'error'); }
}

function renderList(pkgs) {
  const list = document.getElementById('pkg-list');
  const empty = document.getElementById('empty');
  if (!pkgs.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  list.innerHTML = pkgs.map(p => {
    const packageNumber = `#${String(p.id).padStart(3, '0')}`;
    const flags = [];
    if (!p.has_packing_slip)                flags.push('<span class="flag flag-orange">No Slip</span>');
    if (p.items_match === 0)                flags.push('<span class="flag flag-red">Item Discrepancy</span>');
    if (p.package_type === 'needs_confirmation') flags.push('<span class="flag flag-purple">Needs Confirmation</span>');

    const emailDot = p.loic_email_status === 'sent'
      ? '<span class="email-dot email-sent" title="Emailed to Loic"></span>'
      : (['delivered','picked_up','discrepancy','awaiting_loic','closed'].includes(p.status)
          ? '<span class="email-dot email-pending" title="Email pending"></span>' : '');

    const meta = [p.vendor, p.po_number ? `PO: ${p.po_number}` : null, p.carrier]
      .filter(Boolean).join('  ·  ');

    return `
    <div class="pkg-card" onclick="window.location='/package-detail.html?id=${p.id}'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
          ${statusBadge(p.status)}
          ${emailDot}
          ${flags.join('')}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;white-space:nowrap;flex-shrink:0;">
          <span style="font-size:0.78rem;font-weight:600;color:#334155;">${packageNumber}</span>
          <span style="font-size:0.78rem;color:#94a3b8;">${fmtDate(p.date_received)}</span>
        </div>
      </div>
      <div style="font-size:1rem;font-weight:600;color:#0f172a;">${p.recipient_name || '<span style="color:#94a3b8;font-weight:400;font-style:italic;">Unknown recipient</span>'}</div>
      ${p.department ? `<div style="font-size:0.82rem;color:#64748b;margin-top:1px;">${p.department}</div>` : ''}
      ${meta ? `<div style="font-size:0.78rem;color:#94a3b8;margin-top:6px;">${meta}</div>` : ''}
    </div>`;
  }).join('');
}

document.getElementById('search').addEventListener('input', e => {
  searchVal = e.target.value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadPackages, 300);
});
document.getElementById('date-filter').addEventListener('change', e => { dateVal = e.target.value; loadPackages(); });
document.getElementById('sort-mode').addEventListener('change', e => {
  sortMode = e.target.value;
  loadPackages();
});
document.getElementById('clear-btn').addEventListener('click', () => {
  searchVal = ''; dateVal = ''; activeStatus = 'all'; sortMode = 'created_at_DESC';
  document.getElementById('search').value = '';
  document.getElementById('date-filter').value = '';
  document.getElementById('sort-mode').value = 'created_at_DESC';
  buildChips(); loadPackages();
});

window.addEventListener('storage', e => {
  if (e.key === 'packages:refresh') {
    refreshDashboard();
  }
});

window.addEventListener('focus', refreshDashboard);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDashboard();
});

window.addEventListener('pageshow', e => {
  if (e.persisted) refreshDashboard();
});

buildChips(); loadStats(); loadPackages();

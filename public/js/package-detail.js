const params = new URLSearchParams(location.search);
const pkgId = params.get('id');
let currentPkg = null;
let editMode = false;
let originalPkg = null;
let autoSaveTimer = null;

function normalizeSuggestion(v) {
  return String(v || '').trim().toLowerCase();
}

function uniqueRecentValues(rows, field, max = 100) {
  const seen = new Set();
  const values = [];
  for (const row of rows) {
    const raw = String(row[field] || '').trim();
    if (!raw) continue;
    const key = normalizeSuggestion(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(raw);
    if (values.length >= max) break;
  }
  return values;
}

async function initHistorySuggestions() {
  try {
    const rows = await api('GET', '/api/packages');
    if (!Array.isArray(rows) || !rows.length) return;

    const vendorOpts = uniqueRecentValues(rows, 'vendor');
    const recipientOpts = uniqueRecentValues(rows, 'recipient_name');
    const departmentOpts = uniqueRecentValues(rows, 'department');
    const poOpts = uniqueRecentValues(rows, 'po_number');

    const carrierDefaults = ['FedEx', 'UPS', 'Purolator', 'Canada Post', 'Canpar', 'DHL', 'Amazon', 'GLS', 'Nationex'];
    const carrierHistory = uniqueRecentValues(rows, 'carrier');
    const mergedCarriers = [];
    const seenCarrier = new Set();
    [...carrierDefaults, ...carrierHistory].forEach(v => {
      const key = normalizeSuggestion(v);
      if (!key || seenCarrier.has(key)) return;
      seenCarrier.add(key);
      mergedCarriers.push(v);
    });

    initAutocomplete('vendor', vendorOpts);
    initAutocomplete('recipient_name', recipientOpts);
    initAutocomplete('department', departmentOpts);
    initAutocomplete('po_number', poOpts);
    initAutocomplete('carrier', mergedCarriers);
  } catch (e) {
    console.warn('Could not load history suggestions', e);
  }
}

if (!pkgId) { window.location = '/'; }

async function load() {
  try {
    currentPkg = await api('GET', `/api/packages/${pkgId}`);
    render(currentPkg);
  } catch (e) { toast('Failed to load package', 'error'); }
}

function render(p) {
  document.getElementById('hdr-title').textContent = `Package #${String(p.id).padStart(3,'0')}`;
  document.getElementById('hdr-badge').innerHTML = statusBadge(p.status);

  // Status
  const normalizedStatus = p.status === 'contacted'
    ? 'awaiting_confirmation'
    : (p.status === 'ready' || p.status === 'picked_up' || p.status === 'confirmed' ? 'delivered' : p.status);
  ensureStatusOption(normalizedStatus);
  document.getElementById('status').value = normalizedStatus;

  // Email status
  const emailLabel = document.getElementById('email-status-label');
  if (p.loic_email_status === 'sent') {
    emailLabel.textContent = `Email to Loic: Sent ${p.loic_email_sent_date ? fmtDate(p.loic_email_sent_date.slice(0,10)) : ''}`;
    emailLabel.className = 'text-sm text-green-600';
  } else {
    emailLabel.textContent = 'Email to Loic: Not sent yet';
    emailLabel.className = 'text-sm text-slate-500';
  }

  // Info fields
  document.getElementById('date_received').value = p.date_received || '';
  document.getElementById('carrier').value = p.carrier || '';
  document.getElementById('vendor').value = p.vendor || '';
  document.getElementById('recipient_name').value = p.recipient_name || '';
  document.getElementById('department').value = p.department || '';
  document.getElementById('po_number').value = p.po_number || '';
  document.getElementById('has_packing_slip').checked = !!p.has_packing_slip;
  document.getElementById('package_type').value = p.package_type || 'standard';
  document.getElementById('requires_loic_input').checked = !!p.requires_loic_input;
  document.getElementById('notes').value = p.notes || '';

  if (p.items_match === 1) document.getElementById('m-yes').checked = true;
  else if (p.items_match === 0) document.getElementById('m-no').checked = true;
  else document.getElementById('m-na').checked = true;

  toggleSlipMatch();
  toggleDiscrepancyField();
  document.getElementById('discrepancy_notes').value = p.discrepancy_notes || '';

  // Delivery
  document.getElementById('delivery_method').value = p.delivery_method || '';
  document.getElementById('delivered_to_room').value = p.delivered_to_room || '';
  document.getElementById('pickup_person_name').value = p.pickup_person_name || '';
  document.getElementById('pickup_person_department').value = p.pickup_person_department || '';
  toggleDeliveryFields();

  // Confirmation
  document.getElementById('confirmation_method').value = p.confirmation_method || '';
  document.getElementById('confirmed_by').value = p.confirmed_by || '';
  document.getElementById('confirmation_date').value = p.confirmation_date || '';
  document.getElementById('confirmation_notes').value = p.confirmation_notes || '';

  const showConf = p.package_type === 'needs_confirmation';
  document.getElementById('confirmation-section').classList.toggle('hidden', !showConf);
  document.getElementById('confirmation-files-section').classList.toggle('hidden', !showConf);

  // Files
  renderFiles(p.files || []);
}

function ensureStatusOption(status) {
  const select = document.getElementById('status');
  if (!select || !status) return;
  const exists = Array.from(select.options).some(o => o.value === status);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = status;
    if (status === 'closed') opt.textContent = 'Done';
    else if (status === 'ready' || status === 'picked_up' || status === 'confirmed') opt.textContent = 'Delivered';
    else if (status === 'contacted') opt.textContent = 'Awaiting Item Confirmation';
    else opt.textContent = status;
    select.appendChild(opt);
  }
}

function renderFiles(files) {
  ['sticker', 'packing_slip', 'confirmation'].forEach(type => {
    const el = document.getElementById(type === 'packing_slip' ? 'slip-files' : type + '-files');
    if (!el) return;
    el.innerHTML = '';
    files.filter(f => f.file_type === type).forEach(f => {
      el.appendChild(fileThumb(f, async (id) => {
        if (!confirm2('Delete this file?')) return;
        await api('DELETE', `/api/files/${id}`);
        load();
      }));
    });
  });
}

const EDIT_FIELDS = ['date_received','carrier','vendor','recipient_name','department','po_number','has_packing_slip','package_type','requires_loic_input','notes','discrepancy_notes'];

function toggleEdit() {
  if (editMode) { cancelEdit(); return; }
  editMode = true;
  originalPkg = JSON.parse(JSON.stringify(currentPkg));
  EDIT_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
  ['m-yes','m-no','m-na'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
  document.getElementById('edit-toggle').textContent = 'Cancel';
  document.getElementById('save-bar').style.display = 'flex';
  attachAutoSaveListeners();
}

async function cancelEdit() {
  editMode = false;
  clearTimeout(autoSaveTimer);
  // Revert server to pre-edit state if auto-saves changed anything
  if (originalPkg && JSON.stringify(currentPkg) !== JSON.stringify(originalPkg)) {
    try { await api('PUT', `/api/packages/${pkgId}`, originalPkg); } catch (e) { /* best effort */ }
  }
  currentPkg = originalPkg ? JSON.parse(JSON.stringify(originalPkg)) : currentPkg;
  originalPkg = null;
  render(currentPkg);
  document.getElementById('edit-toggle').textContent = 'Edit';
  document.getElementById('save-bar').style.display = 'none';
  EDIT_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
  document.querySelectorAll('input[name="items_match"]').forEach(r => r.disabled = true);
}

function scheduleAutoSave() {
  if (!editMode) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveInfo, 400);
}

function attachAutoSaveListeners() {
  const textFields = ['date_received','carrier','vendor','recipient_name','department','po_number','notes','discrepancy_notes'];
  textFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', scheduleAutoSave);
    el.addEventListener('change', scheduleAutoSave);
  });
  ['has_packing_slip','package_type','requires_loic_input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', scheduleAutoSave);
  });
  document.querySelectorAll('input[name="items_match"]').forEach(r => r.addEventListener('change', scheduleAutoSave));
}

function toggleSlipMatch() {
  const has = document.getElementById('has_packing_slip').checked;
  document.getElementById('items-match-row').classList.toggle('hidden', !has);
}

function toggleDiscrepancyField() {
  const val = document.querySelector('input[name="items_match"]:checked') ? document.querySelector('input[name="items_match"]:checked').value : null;
  document.getElementById('discrepancy-field').classList.toggle('hidden', val !== 'no');
}

function toggleDeliveryFields() {
  const m = document.getElementById('delivery_method').value;
  document.getElementById('room-field').classList.toggle('hidden', m !== 'delivered');
  document.getElementById('pickup-fields').classList.toggle('hidden', m !== 'picked_up');
}

async function quickSave() {
  try {
    const status = document.getElementById('status').value;
    await api('PUT', `/api/packages/${pkgId}`, { status });
    currentPkg.status = status;
    document.getElementById('hdr-badge').innerHTML = statusBadge(status);
    toast('Status updated', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function saveInfo() {
  if (!editMode) return;
  try {
    const matchVal = document.querySelector('input[name="items_match"]:checked')?.value || null;
    let items_match = null;
    if (matchVal === 'yes') items_match = 1;
    if (matchVal === 'no') items_match = 0;

    const payload = {
      date_received: document.getElementById('date_received').value,
      carrier: document.getElementById('carrier').value,
      vendor: document.getElementById('vendor').value.trim(),
      recipient_name: document.getElementById('recipient_name').value.trim(),
      department: document.getElementById('department').value.trim(),
      po_number: document.getElementById('po_number').value.trim(),
      has_packing_slip: document.getElementById('has_packing_slip').checked ? 1 : 0,
      items_match,
      discrepancy_notes: document.getElementById('discrepancy_notes').value.trim(),
      package_type: document.getElementById('package_type').value,
      requires_loic_input: document.getElementById('requires_loic_input').checked ? 1 : 0,
      notes: document.getElementById('notes').value.trim(),
    };
    const updated = await api('PUT', `/api/packages/${pkgId}`, payload);
    currentPkg = updated;
    document.getElementById('hdr-badge').innerHTML = statusBadge(updated.status);
    toast('Saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function saveDelivery() {
  try {
    const method = document.getElementById('delivery_method').value;
    let newStatus = currentPkg.status;
    if (method === 'delivered') newStatus = 'delivered';
    if (method === 'picked_up') newStatus = 'delivered';

    const payload = {
      delivery_method: method || null,
      delivered_to_room: document.getElementById('delivered_to_room').value.trim() || null,
      pickup_person_name: document.getElementById('pickup_person_name').value.trim() || null,
      pickup_person_department: document.getElementById('pickup_person_department').value.trim() || null,
      status: newStatus,
    };
    currentPkg = await api('PUT', `/api/packages/${pkgId}`, payload);
    render(currentPkg);
    toast('Delivery info saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function saveConfirmation() {
  try {
    const method = document.getElementById('confirmation_method').value;
    let newStatus = currentPkg.status;
    if (method) newStatus = 'delivered';

    const payload = {
      confirmation_method: method || null,
      confirmed_by: document.getElementById('confirmed_by').value.trim() || null,
      confirmation_date: document.getElementById('confirmation_date').value || null,
      confirmation_notes: document.getElementById('confirmation_notes').value.trim() || null,
      status: newStatus,
    };
    currentPkg = await api('PUT', `/api/packages/${pkgId}`, payload);
    render(currentPkg);
    toast('Confirmation saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function addFiles(fileType, files) {
  try {
    const fd = new FormData();
    fd.append('file_type', fileType);
    const prepared = await prepareFilesForUpload(files);
    prepared.forEach(f => fd.append('files', f));
    const r = await fetch(`/api/files/package/${pkgId}`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error('Upload failed');
    load();
    toast('Files uploaded', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function deletePackage() {
  if (!confirm2('Delete this package and all its files? This cannot be undone.')) return;
  try {
    await api('DELETE', `/api/packages/${pkgId}`);
    window.location = '/';
  } catch (e) { toast(e.message, 'error'); }
}

load();
initHistorySuggestions();

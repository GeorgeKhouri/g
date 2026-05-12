// File staging: keyed by type
const staged = { sticker: [], slip: [] };

document.getElementById('date_received').value = today();

function togglePackingSlip() {
  const has = document.getElementById('has_packing_slip').checked;
  document.getElementById('slip-hint').textContent = has ? 'Packing slip found' : '⚠ No packing slip found — sticker photo(s) will be sent to Loic';
  document.getElementById('slip-upload-section').classList.toggle('hidden', !has);
  document.getElementById('items-match-section').classList.toggle('hidden', !has);
  if (!has) {
    document.getElementById('requires_loic_input').checked = true;
    document.getElementById('status').value = 'awaiting_loic';
  }
}

function toggleDiscrepancy() {
  const val = document.querySelector('input[name="items_match"]:checked')?.value;
  document.getElementById('discrepancy-section').classList.toggle('hidden', val !== 'no');
  if (val === 'no') {
    document.getElementById('requires_loic_input').checked = true;
    document.getElementById('status').value = 'received';
  }
}

function toggleConfirmNote() {
  const isConfirm = document.getElementById('package_type').value === 'needs_confirmation';
  document.getElementById('confirm-note').classList.toggle('hidden', !isConfirm);
}

function previewFiles(type, files) {
  const grid = document.getElementById(type === 'sticker' ? 'sticker-previews' : 'slip-previews');
  Array.from(files).forEach(file => {
    staged[type === 'slip' ? 'slip' : 'sticker'].push(file);
    const div = document.createElement('div');
    div.className = 'file-thumb';
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      div.appendChild(img);
    } else {
      div.innerHTML = '<div class="pdf-icon">📄</div>';
    }
    grid.appendChild(div);
  });
}

// drag-over styling
['sticker-zone', 'slip-zone'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('drag-over');
    const type = id === 'sticker-zone' ? 'sticker' : 'slip';
    const input = document.getElementById(type === 'sticker' ? 'sticker-input' : 'slip-input');
    const dt = new DataTransfer();
    Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f));
    input.files = dt.files;
    previewFiles(type, dt.files);
  });
});

async function submitPackage() {
  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const hasSlip = document.getElementById('has_packing_slip').checked;
    const matchVal = document.querySelector('input[name="items_match"]:checked')?.value;
    let items_match = null;
    if (matchVal === 'yes') items_match = true;
    if (matchVal === 'no') items_match = false;

    const payload = {
      date_received: document.getElementById('date_received').value,
      carrier: document.getElementById('carrier').value,
      tracking_number: document.getElementById('tracking_number').value.trim(),
      vendor: document.getElementById('vendor').value.trim(),
      recipient_name: document.getElementById('recipient_name').value.trim(),
      department: document.getElementById('department').value.trim(),
      po_number: document.getElementById('po_number').value.trim(),
      has_packing_slip: hasSlip,
      items_match,
      discrepancy_notes: document.getElementById('discrepancy_notes').value.trim(),
      package_type: document.getElementById('package_type').value,
      requires_loic_input: document.getElementById('requires_loic_input').checked,
      status: document.getElementById('status').value,
      notes: document.getElementById('notes').value.trim(),
    };

    if (!payload.date_received) { toast('Date received is required', 'error'); btn.disabled = false; btn.textContent = 'Save Package'; return; }

    const pkg = await api('POST', '/api/packages', payload);

    // Upload files
    const uploads = [];
    if (staged.sticker.length) uploads.push(uploadFiles(pkg.id, staged.sticker, 'sticker'));
    if (staged.slip.length) uploads.push(uploadFiles(pkg.id, staged.slip, 'packing_slip'));
    await Promise.all(uploads);

    toast('Package saved!', 'success');
    setTimeout(() => window.location = `/package-detail.html?id=${pkg.id}`, 800);
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false; btn.textContent = 'Save Package';
  }
}

async function uploadFiles(packageId, files, fileType) {
  const fd = new FormData();
  fd.append('file_type', fileType);
  files.forEach(f => fd.append('files', f));
  const r = await fetch(`/api/files/package/${packageId}`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('File upload failed');
}

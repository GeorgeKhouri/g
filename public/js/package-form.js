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

  // Automatically try OCR when new evidence photos are added.
  if (staged.sticker.length || staged.slip.length) runAiAutofill(true);
}

function setAiStatus(msg, isError = false) {
  const el = document.getElementById('ai-fill-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? '#dc2626' : '';
}

function applyDetectedField(fieldId, value) {
  if (!value) return false;
  const el = document.getElementById(fieldId);
  if (!el) return false;
  const existing = String(el.value || '').trim();
  const weakValues = ['unknown', 'n/a', 'na', '-', 'none'];
  if (existing && !weakValues.includes(existing.toLowerCase())) return false;
  el.value = String(value).trim();
  return true;
}

function normalizeDetectedValues(fields) {
  return {
    carrier: fields.carrier || '',
    tracking_number: fields.tracking_number || '',
    vendor: fields.vendor || '',
    recipient_name: fields.recipient_name || '',
    department: fields.department || '',
    po_number: fields.po_number || '',
  };
}

function extractCarrierFromText(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('fedex')) return 'FedEx';
  if (t.includes('ups')) return 'UPS';
  if (t.includes('purolator')) return 'Purolator';
  if (t.includes('canada post') || t.includes('postes canada')) return 'Canada Post';
  if (t.includes('dhl')) return 'DHL';
  if (t.includes('amazon')) return 'Amazon';
  return '';
}

function extractTrackingFromText(text) {
  const compact = (text || '').toUpperCase();
  const ups = compact.match(/\b1Z[0-9A-Z]{16}\b/);
  if (ups) return ups[0];
  const cp = compact.match(/\b[A-Z]{2}\d{9}[A-Z]{2}\b/);
  if (cp) return cp[0];
  const digits = compact.match(/\b\d{12,22}\b/g) || [];
  if (digits.length) return digits.sort((a, b) => b.length - a.length)[0];
  const labeled = compact.match(/(?:TRACKING|TRK|WAYBILL)\s*(?:NO|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9\- ]{8,30})/i);
  if (labeled && labeled[1]) return labeled[1].replace(/\s+/g, '').trim();
  return '';
}

function extractPoFromText(text) {
  const patterns = [
    /\b(?:P\.?\s*O\.?|PURCHASE\s+ORDER)\s*(?:NUMBER|#|NO\.?|NUM)?\s*[:\-]?\s*([A-Z0-9\-]{4,})\b/i,
    /\bPO\s*[:\-]?\s*([A-Z0-9\-]{4,})\b/i,
  ];
  for (const p of patterns) {
    const m = (text || '').match(p);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return '';
}

function extractLabeledLine(lines, labels) {
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    for (const label of labels) {
      const r = new RegExp(`(?:^|\\b)${label}\\b\\s*[:\\-]?\\s*(.+)$`, 'i');
      const m = line.match(r);
      if (m && m[1]) return m[1].replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

function likelyPersonOrGroup(line) {
  if (!line) return false;
  if (/\d/.test(line)) return false;
  if (/^(street|st\.?|suite|room|postal|code|canada|ontario|qc|bc|ab)$/i.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 7;
}

function fallbackRecipient(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(ship\s*to|attn|attention|recipient|deliver\s*to)\b/i.test(line)) {
      const same = line.replace(/.*\b(ship\s*to|attn|attention|recipient|deliver\s*to)\b\s*[:\-]?\s*/i, '').trim();
      if (likelyPersonOrGroup(same)) return same;
      const next = (lines[i + 1] || '').trim();
      if (likelyPersonOrGroup(next)) return next;
    }
  }
  return '';
}

function fallbackVendor(lines) {
  for (const line of lines.slice(0, 10)) {
    if (/\b(inc|ltd|llc|corp|corporation|scientific|laboratories|labs|university|college)\b/i.test(line)) {
      return line;
    }
  }
  return '';
}

function fallbackDepartment(lines) {
  const m = lines.join('\n').match(/\b(?:department|dept)\s*[:\-]?\s*([A-Z][A-Za-z0-9 &\/-]{2,})/i);
  return m && m[1] ? m[1].trim() : '';
}

function extractFieldsFromText(text) {
  const lines = (text || '').split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const recipient = extractLabeledLine(lines, ['ship\\s*to', 'to', 'attn', 'attention', 'recipient']);
  const vendor = extractLabeledLine(lines, ['from', 'ship\\s*from', 'sender', 'vendor']);
  const department = extractLabeledLine(lines, ['department', 'dept']);
  return {
    carrier: extractCarrierFromText(text),
    tracking_number: extractTrackingFromText(text),
    po_number: extractPoFromText(text),
    recipient_name: recipient || fallbackRecipient(lines),
    vendor: vendor || fallbackVendor(lines),
    department: department || fallbackDepartment(lines),
  };
}

async function runBrowserOcr(files) {
  if (!window.Tesseract || typeof window.Tesseract.recognize !== 'function') {
    throw new Error('Browser OCR library is not available');
  }

  const textChunks = [];
  for (const file of files) {
    const r = await window.Tesseract.recognize(file, 'eng');
    const text = (r?.data?.text || '')
      .replace(/\r/g, '\n')
      .split(/\n+/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
    if (text) textChunks.push(text);
  }
  return extractFieldsFromText(textChunks.join('\n'));
}

async function detectFieldsFromFiles(files) {
  const fd = new FormData();
  files.forEach(file => fd.append('files', file));

  try {
    const r = await fetch('/api/files/extract-package-info', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Server extraction failed');
    return data.fields || {};
  } catch (e) {
    return runBrowserOcr(files);
  }
}

async function runAiAutofill(silent = false) {
  const aiBtn = document.getElementById('ai-fill-btn');
  const files = [...staged.sticker, ...staged.slip].filter(f => f.type && f.type.startsWith('image/'));

  if (!files.length) {
    if (!silent) toast('Add at least one sticker/slip image first', 'error');
    setAiStatus('');
    return;
  }

  try {
    if (aiBtn) {
      aiBtn.disabled = true;
      aiBtn.textContent = 'Detecting...';
    }
    setAiStatus('Reading labels with AI...');

    const detected = normalizeDetectedValues(await detectFieldsFromFiles(files));
    let applied = 0;
    applied += applyDetectedField('carrier', detected.carrier) ? 1 : 0;
    applied += applyDetectedField('tracking_number', detected.tracking_number) ? 1 : 0;
    applied += applyDetectedField('vendor', detected.vendor) ? 1 : 0;
    applied += applyDetectedField('recipient_name', detected.recipient_name) ? 1 : 0;
    applied += applyDetectedField('department', detected.department) ? 1 : 0;
    applied += applyDetectedField('po_number', detected.po_number) ? 1 : 0;
    if (staged.slip.length > 0) {
      const hasSlipEl = document.getElementById('has_packing_slip');
      if (hasSlipEl && !hasSlipEl.checked) {
        hasSlipEl.checked = true;
        togglePackingSlip();
      }
    }

    if (applied > 0) {
      setAiStatus(`Filled ${applied} field${applied === 1 ? '' : 's'}.`);
      if (!silent) toast(`AI filled ${applied} field${applied === 1 ? '' : 's'}`, 'success');
    } else {
      setAiStatus('No new fields were filled (existing values were kept).');
      if (!silent) toast('No new fields detected to fill', 'error');
    }
  } catch (e) {
    setAiStatus(e.message || 'AI extraction failed', true);
    if (!silent) toast(e.message || 'AI extraction failed', 'error');
  } finally {
    if (aiBtn) {
      aiBtn.disabled = false;
      aiBtn.textContent = 'Detect Info From Photos';
    }
  }
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

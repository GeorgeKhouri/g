let allPackages = [];
let showingAll = false;
let lastDraft = null;

async function loadConfig() {
  try {
    const cfg = await api('GET', '/api/config');
    window._loicEmail = cfg.loic_email;
  } catch (e) { /* non-critical */ }
}

async function load() {
  try {
    allPackages = await api('GET', '/api/packages');
    renderCheckboxes();
    renderSentList();
  } catch (e) { toast('Failed to load packages', 'error'); }
}

function pendingPackages() {
  return allPackages.filter(p => p.loic_email_status !== 'sent');
}

function renderCheckboxes() {
  const list = showingAll ? allPackages : pendingPackages();
  const el = document.getElementById('pkg-checkboxes');
  if (!list.length) { el.innerHTML = '<p class="text-sm text-slate-400">No packages to show.</p>'; return; }

  el.innerHTML = list.map(p => `
    <label class="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" class="pkg-check mt-0.5 w-4 h-4 accent-blue-600" value="${p.id}" ${pendingPackages().find(pp => pp.id === p.id) ? 'checked' : ''}>
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-mono text-slate-400">#${String(p.id).padStart(3,'0')}</span>
          ${statusBadge(p.status)}
          <span class="email-dot ${p.loic_email_status === 'sent' ? 'email-sent' : 'email-pending'}" title="${p.loic_email_status === 'sent' ? 'Already emailed' : 'Not emailed yet'}"></span>
        </div>
        <div class="text-sm font-medium text-slate-700">${p.recipient_name || 'Unknown'} ${p.department ? '– ' + p.department : ''}</div>
        <div class="text-xs text-slate-400">${fmtDate(p.date_received)} · ${p.vendor || 'No vendor'} · PO: ${p.po_number || 'None'}</div>
      </div>
    </label>
  `).join('');
}

function renderSentList() {
  const sent = allPackages.filter(p => p.loic_email_status === 'sent');
  const el = document.getElementById('sent-list');
  if (!sent.length) { el.innerHTML = '<p class="text-slate-400 text-xs">None yet.</p>'; return; }
  el.innerHTML = sent.map(p => `
    <div class="flex items-center gap-2 py-1 border-b border-slate-100">
      <span class="text-xs font-mono text-slate-400">#${String(p.id).padStart(3,'0')}</span>
      <span class="text-sm flex-1">${p.recipient_name || 'Unknown'}</span>
      <span class="text-xs text-green-600">Sent ${p.loic_email_sent_date ? fmtDate(p.loic_email_sent_date.slice(0,10)) : ''}</span>
    </div>
  `).join('');
}

function selectAll() {
  document.querySelectorAll('.pkg-check').forEach(cb => cb.checked = true);
}

function toggleShowAll() {
  showingAll = !showingAll;
  document.getElementById('show-all-btn').textContent = showingAll ? 'Show pending only' : 'Show all packages';
  renderCheckboxes();
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll('.pkg-check:checked')).map(cb => parseInt(cb.value));
}

async function generateDraft() {
  const ids = getSelectedIds();
  if (!ids.length) { toast('Select at least one package', 'error'); return; }
  try {
    const btn = document.getElementById('generate-btn');
    btn.textContent = 'Generating…'; btn.disabled = true;
    lastDraft = await api('POST', '/api/email/draft', { package_ids: ids });
    btn.textContent = 'Regenerate Draft'; btn.disabled = false;

    document.getElementById('to-field').value = window._loicEmail || '';
    document.getElementById('subject-field').value = lastDraft.subject;
    document.getElementById('body-field').value = lastDraft.body;
        document.getElementById('attachment-note').textContent =
          lastDraft.attachment_count > 0
            ? `📎 ${lastDraft.attachment_count} file(s) will be attached (packing slips & sticker photos) when sending via Outlook.`
        : 'No files to attach. Upload packing slip scans on each package detail page.';
    document.getElementById('preview-section').classList.remove('hidden');
    document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { toast(e.message, 'error'); document.getElementById('generate-btn').textContent = 'Generate Email Draft'; document.getElementById('generate-btn').disabled = false; }
}

async function sendEmail() {
  if (!lastDraft) { toast('Generate a draft first', 'error'); return; }
  if (!confirm2('Send this email to Loic now?')) return;
  try {
    await api('POST', '/api/email/send', {
      to: document.getElementById('to-field').value,
      subject: document.getElementById('subject-field').value,
      body: document.getElementById('body-field').value,
      package_ids: lastDraft.package_ids,
    });
    toast('Email sent!', 'success');
    load();
    document.getElementById('preview-section').classList.add('hidden');
    lastDraft = null;
  } catch (e) { toast(e.message, 'error'); }
}

function copyText() {
  const text = `Subject: ${document.getElementById('subject-field').value}\n\n${document.getElementById('body-field').value}`;
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard!', 'success')).catch(() => toast('Copy failed – try selecting and copying manually', 'error'));
}

function openMailto() {
  const to = encodeURIComponent(document.getElementById('to-field').value);
  const subject = encodeURIComponent(document.getElementById('subject-field').value);
  const body = encodeURIComponent(document.getElementById('body-field').value);
  window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
}

loadConfig();
load();

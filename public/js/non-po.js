let editingId = null;

document.getElementById('new-date').value = today();

document.getElementById('new-file-input').addEventListener('change', function() {
  const grid = document.getElementById('new-previews');
  Array.from(this.files).forEach(file => {
    const div = document.createElement('div');
    div.className = 'file-thumb';
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img'); img.src = URL.createObjectURL(file); div.appendChild(img);
    } else { div.innerHTML = '<div class="pdf-icon">📄</div>'; }
    grid.appendChild(div);
  });
});

async function load() {
  try {
    const items = await api('GET', '/api/nonpo');
    render(items);
  } catch (e) { toast('Failed to load', 'error'); }
}

function render(items) {
  const list = document.getElementById('items-list');
  const empty = document.getElementById('empty');
  if (!items.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = items.map(item => `
    <div class="pkg-card p-4">
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs text-slate-400">${fmtDate(item.date_received)}</span>
            ${item.file_count > 0 ? `<span class="text-xs text-slate-400">📎 ${item.file_count}</span>` : ''}
          </div>
          <div class="font-semibold text-slate-800 text-sm">${item.recipient || '—'}</div>
          ${item.description ? `<div class="text-sm text-slate-500 mt-0.5">${item.description}</div>` : ''}
          ${item.notes ? `<div class="text-xs text-slate-400 mt-1">${item.notes}</div>` : ''}
        </div>
        <div class="flex gap-2 ml-2 shrink-0">
          <button onclick="openEdit(${item.id})" class="text-xs text-blue-600 border border-blue-200 rounded-lg px-2 py-1">Edit</button>
          <button onclick="deleteItem(${item.id})" class="text-xs text-red-400 border border-red-100 rounded-lg px-2 py-1">Del</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function addItem() {
  const date = document.getElementById('new-date').value;
  if (!date) { toast('Date is required', 'error'); return; }
  try {
    const item = await api('POST', '/api/nonpo', {
      date_received: date,
      recipient: document.getElementById('new-recipient').value.trim(),
      description: document.getElementById('new-desc').value.trim(),
      notes: document.getElementById('new-notes').value.trim(),
    });

    const files = document.getElementById('new-file-input').files;
    if (files.length) {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('files', f));
      await fetch(`/api/files/nonpo/${item.id}`, { method: 'POST', body: fd });
    }

    toast('Item saved', 'success');
    document.getElementById('new-date').value = today();
    document.getElementById('new-recipient').value = '';
    document.getElementById('new-desc').value = '';
    document.getElementById('new-notes').value = '';
    document.getElementById('new-previews').innerHTML = '';
    document.getElementById('new-file-input').value = '';
    load();
  } catch (e) { toast(e.message, 'error'); }
}

async function openEdit(id) {
  try {
    const item = await api('GET', `/api/nonpo/${id}`);
    editingId = id;
    document.getElementById('edit-date').value = item.date_received || '';
    document.getElementById('edit-recipient').value = item.recipient || '';
    document.getElementById('edit-desc').value = item.description || '';
    document.getElementById('edit-notes').value = item.notes || '';

    const filesEl = document.getElementById('edit-files');
    filesEl.innerHTML = '';
    (item.files || []).forEach(f => {
      filesEl.appendChild(fileThumb(f, async (fid) => {
        if (!confirm2('Delete this file?')) return;
        await api('DELETE', `/api/files/nonpo/${fid}`);
        openEdit(id);
      }));
    });

    document.getElementById('edit-modal').classList.remove('hidden');
  } catch (e) { toast(e.message, 'error'); }
}

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editingId = null;
  document.getElementById('edit-file-input').value = '';
}

async function addEditFiles(files) {
  if (!editingId || !files.length) return;
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('files', f));
  await fetch(`/api/files/nonpo/${editingId}`, { method: 'POST', body: fd });
  openEdit(editingId);
}

async function saveEdit() {
  if (!editingId) return;
  try {
    await api('PUT', `/api/nonpo/${editingId}`, {
      date_received: document.getElementById('edit-date').value,
      recipient: document.getElementById('edit-recipient').value.trim(),
      description: document.getElementById('edit-desc').value.trim(),
      notes: document.getElementById('edit-notes').value.trim(),
    });
    toast('Saved', 'success');
    closeModal();
    load();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteItem(id) {
  if (!confirm2('Delete this item and its files?')) return;
  try {
    await api('DELETE', `/api/nonpo/${id}`);
    toast('Deleted', 'success');
    load();
  } catch (e) { toast(e.message, 'error'); }
}

load();

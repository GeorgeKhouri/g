const STATUS = {
  received:              { label: 'Received',               badge: 'badge-red' },
  awaiting_loic:         { label: 'Awaiting Loic',          badge: 'badge-yellow' },
  discrepancy:           { label: 'Discrepancy',            badge: 'badge-brown' },
  ready:                 { label: 'Delivered',              badge: 'badge-green' },
  contacted:             { label: 'Awaiting Item Confirmation',  badge: 'badge-yellow' },
  awaiting_confirmation: { label: 'Awaiting Item Confirmation',  badge: 'badge-yellow' },
  confirmed:             { label: 'Contents Confirmed',     badge: 'badge-indigo' },
  delivered:             { label: 'Delivered',              badge: 'badge-green' },
  picked_up:             { label: 'Delivered',              badge: 'badge-green' },
  closed:                { label: 'Done',                   badge: 'badge-gray' }
};

function statusBadge(status) {
  const s = STATUS[status] || { label: status, badge: 'badge-gray' };
  return `<span class="badge ${s.badge}">${s.label}</span>`;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

function confirm2(msg) {
  return window.confirm(msg);
}

function fileThumb(file, onDelete) {
  const isImg = /\.(jpe?g|png|gif|heic|heif|webp)$/i.test(file.original_name || file.file_name);
  const div = document.createElement('div');
  div.className = 'file-thumb';
  if (isImg) {
    div.innerHTML = `<img src="/uploads/${file.file_name}" loading="lazy" onclick="window.open('/uploads/${file.file_name}','_blank')">`;
  } else {
    div.innerHTML = `<div class="pdf-icon" onclick="window.open('/uploads/${file.file_name}','_blank')" style="cursor:pointer">📄</div>`;
  }
  if (onDelete) {
    const btn = document.createElement('button');
    btn.className = 'del-btn';
    btn.textContent = '×';
    btn.onclick = (e) => { e.stopPropagation(); onDelete(file.id); };
    div.appendChild(btn);
  }
  return div;
}

function navActive(page) {
  document.querySelectorAll('.bottom-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  document.querySelectorAll('.desktop-nav a').forEach(a => {
    a.classList.toggle('font-bold', a.dataset.page === page);
    a.classList.toggle('text-white', a.dataset.page === page);
    a.classList.toggle('text-blue-200', a.dataset.page !== page);
  });
}

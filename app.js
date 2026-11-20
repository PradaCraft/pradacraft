
const SUPABASE_URL = 'https://mnmahweaomkyxlayugir.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H3BVjXECWN9vvwOF0QW7pg_VPb_syzr';
const OWNER_UID = 'f7968f76-2e2c-4a5f-bea3-13636ac3c422';
const BUCKET = 'addons';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let addons = [];
let activeCategory = 'All';
let selectedRating = 5;
let currentUser = null;
let logoutButton = null;

const $ = s => document.querySelector(s);

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function isOwner() {
  return currentUser?.id === OWNER_UID;
}

// ======================================
// SISTEM TERJEMAHAN PRADACRAFT
// ======================================

const translationCache = new Map();

const translationLanguages = {
  id: '🇮🇩 Indonesia',
  en: '🇬🇧 English',
  ja: '🇯🇵 Japanese',
  es: '🇪🇸 Spanish',
  pt: '🇧🇷 Portuguese',
  fr: '🇫🇷 French',
  de: '🇩🇪 German',
  ko: '🇰🇷 Korean',
  'zh-CN': '🇨🇳 Chinese',
  ar: '🇸🇦 Arabic',
  ru: '🇷🇺 Russian'
};

function splitTranslationText(text, maxLength = 450) {
  const words = text.match(/\S+\s*/g) || [];
  const chunks = [];
  let current = '';

  for (const word of words) {
    if (current.length + word.length > maxLength && current) {
      chunks.push(current);
      current = '';
    }
    current += word;
  }

  if (current) chunks.push(current);
  return chunks;
}

async function translateText(text, target) {
  const key = `${target}:${text}`;

  if (translationCache.has(key)) {
    return translationCache.get(key);
  }

  const chunks = splitTranslationText(text);
  const results = [];

  for (const chunk of chunks) {
    const url =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(chunk) +
      '&langpair=autodetect%7C' +
      encodeURIComponent(target);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Layanan terjemahan sedang bermasalah.');
    }

    const data = await response.json();

    if (
      data.responseStatus !== 200 ||
      !data.responseData?.translatedText
    ) {
      throw new Error('Teks gagal diterjemahkan.');
    }

    results.push(data.responseData.translatedText);
  }

  const result = results.join('');
  translationCache.set(key, result);

  return result;
}

function resetTranslations() {
  const content = $('#detailContent');
  if (!content) return;

  content.querySelectorAll('[data-translation-id]').forEach(el => {
    el.textContent = el.dataset.original;
  });

  content.querySelectorAll('[data-translate]').forEach(btn => {
    btn.dataset.translated = 'false';
    btn.textContent = '🌐 Translate';
  });
}

function updateTranslationControls() {
  const content = $('#detailContent');
  if (!content) return;

  content.querySelectorAll('[data-translate]').forEach(btn => {
    btn.disabled = false;
  });
}

// ======================================
// OWNER ACCESS
// ======================================

function updateOwnerControls() {
  const visible = isOwner();

  ['#adminOpen', '#heroAdmin'].forEach(selector => {
    const el = $(selector);
    if (el) el.style.display = visible ? '' : 'none';
  });

  if (logoutButton) {
    logoutButton.style.display = visible ? '' : 'none';
  }

  if (!visible) {
    $('#adminModal')?.classList.add('hidden');
  }
}

async function refreshUser() {
  const { data, error } = await db.auth.getSession();

  if (error) console.error(error);

  currentUser = data?.session?.user || null;
  updateOwnerControls();

  return currentUser;
}

async function loginGitHub() {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) toast('Login gagal: ' + error.message);
}

async function showAdmin() {
  await refreshUser();

  if (!currentUser) {
    toast('Silakan login sebagai Owner.');
    await loginGitHub();
    return;
  }

  if (!isOwner()) {
    toast('Akun ini bukan pemilik PradaCraft.');
    return;
  }

  $('#adminModal').classList.remove('hidden');
  await renderAdmin();
}

// ======================================
// ADDON DATABASE
// ======================================

function imageUrl(path) {
  if (!path) return '';

  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function loadAddons() {
  const { data, error } = await db
    .from('addons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    toast('Gagal memuat katalog addon.');
    return;
  }

  addons = data || [];
  render();
}

function card(a) {
  const image = imageUrl(a.image_path);

  return `
    <article class="addon-card" data-id="${esc(a.id)}">
      <div class="cover">
        ${image
          ? `<img src="${esc(image)}" alt="${esc(a.name)}">`
          : '<div class="cover-placeholder">⬡</div>'}
        <span class="category-pill">${esc(a.category)}</span>
      </div>

      <div class="card-body">
        <div class="card-title-row">
          <h3>${esc(a.name)}</h3>
          <span class="version">${esc(a.version || 'Bedrock')}</span>
        </div>

        <p class="card-desc">${esc(a.description || '')}</p>

        <div class="card-foot">
          <span class="rating">
            ★ ${Number(a.rating || 0).toFixed(1)}
          </span>
          <span>
            ↓ ${Number(a.downloads || 0).toLocaleString('id-ID')} downloads
          </span>
        </div>
      </div>
    </article>`;
}

function render() {
  const q = ($('#search')?.value || '').toLowerCase();

  const list = addons.filter(a =>
    (activeCategory === 'All' || a.category === activeCategory) &&
    `${a.name} ${a.description} ${a.category}`.toLowerCase().includes(q)
  );

  $('#catalogGrid').innerHTML = list.map(card).join('');
  $('#empty').classList.toggle('hidden', list.length > 0);

  $('#popularGrid').innerHTML = [...addons]
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 3)
    .map(card)
    .join('');

  $('#totalAddons').textContent = addons.length;

  $('#totalDownloads').textContent = addons
    .reduce((sum, a) => sum + Number(a.downloads || 0), 0)
    .toLocaleString('id-ID');

  $('#year').textContent = new Date().getFullYear();
}

// ======================================
// DETAIL ADDON + TRANSLATE
// ======================================

async function openDetail(id) {
  const a = addons.find(x => x.id === id);
  if (!a) return;

  selectedRating = 5;

  const { data: reviews } = await db
    .from('reviews')
    .select('*')
    .eq('addon_id', id)
    .order('created_at', { ascending: false });

  const comments = reviews || [];

  const avg = comments.length
    ? comments.reduce((s, r) => s + r.rating, 0) / comments.length
    : Number(a.rating || 0);

  const image = imageUrl(a.image_path);

  $('#detailContent').innerHTML = `
    ${image
      ? `<img class="detail-cover" src="${esc(image)}">`
      : '<div class="detail-cover" style="display:grid;place-items:center;font-size:65px">⬡</div>'}

    <div class="eyebrow" style="margin-top:20px">
      ${esc(a.category)} • MINECRAFT BEDROCK
    </div>

    <h2>${esc(a.name)}</h2>

    <div class="detail-meta">
      <span>◈ ${esc(a.version || 'Bedrock')}</span>
      <span class="rating">
        ★ ${avg.toFixed(1)} (${comments.length} ratings)
      </span>
      <span>↓ ${Number(a.downloads || 0)} downloads</span>
    </div>

    <div class="translation-controls">
      <span>🌐 Bahasa</span>
      <select id="translationLanguage">
        ${Object.entries(translationLanguages).map(([code, name]) =>
          `<option value="${esc(code)}" ${code === 'id' ? 'selected' : ''}>
            ${esc(name)}
          </option>`
        ).join('')}
      </select>
    </div>

    <div class="description-translation">
      <p class="detail-description"
        data-translation-id="description"
        data-original="${esc(a.description || '')}">
        ${esc(a.description || '')}
      </p>

      <button class="translate-btn" data-translate="description">
        🌐 Translate
      </button>
    </div>

    <button class="btn primary download-btn" id="downloadNow">
      ↓ Download Addon
    </button>

    <div class="review-box">
      <h3>Rate this addon</h3>

      <div class="stars">
        ${[1,2,3,4,5].map(n =>
          `<button class="star ${n <= selectedRating ? 'selected' : ''}"
            data-star="${n}">★</button>`
        ).join('')}
      </div>

      <textarea id="commentText" rows="2" maxlength="1000"
        placeholder="Tulis komentar..."></textarea>

      <button class="btn ghost" id="sendReview">
        Kirim rating & komentar
      </button>

      <h3 style="margin-top:20px">Komentar pengunjung</h3>

      <div id="comments">
        ${comments.map((c, i) => `
          <div class="comment">
            <b>${esc(c.name)}</b> · ${'★'.repeat(c.rating)}

            <p data-translation-id="comment-${i}"
              data-original="${esc(c.comment)}">${esc(c.comment)}</p>

            <button class="translate-btn"
              data-translate="comment-${i}">
              🌐 Translate
            </button>
          </div>
        `).join('') || '<p class="muted">Belum ada komentar.</p>'}
      </div>
    </div>
  `;

  $('#detailModal').classList.remove('hidden');

  $('#downloadNow').onclick = () => downloadAddon(a);

  // Klik tombol Translate.
  $('#detailContent').onclick = async e => {
    const btn = e.target.closest('[data-translate]');
    if (!btn) return;

    const translationId = btn.dataset.translate;

    const element = $('#detailContent').querySelector(
      `[data-translation-id="${translationId}"]`
    );

    if (!element) return;

    // Kembalikan teks asli.
    if (btn.dataset.translated === 'true') {
      element.textContent = element.dataset.original;
      btn.dataset.translated = 'false';
      btn.textContent = '🌐 Translate';
      return;
    }

    const original = element.dataset.original;
    const language = $('#translationLanguage').value;

    if (!original.trim()) {
      toast('Tidak ada teks untuk diterjemahkan.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Menerjemahkan...';

    try {
      const translated = await translateText(original, language);

      element.textContent = translated;
      btn.dataset.translated = 'true';
      btn.textContent = '↩ Tampilkan Asli';

    } catch (error) {
      console.error(error);
      toast(error.message || 'Terjemahan gagal.');
      btn.textContent = '🌐 Translate';

    } finally {
      btn.disabled = false;
    }
  };

  // Mengganti bahasa akan mengembalikan teks ke versi asli.
  $('#translationLanguage').onchange = () => {
    resetTranslations();
  };

  document.querySelectorAll('[data-star]').forEach(b => {
    b.onclick = () => {
      selectedRating = Number(b.dataset.star);

      document.querySelectorAll('[data-star]').forEach(x =>
        x.classList.toggle(
          'selected',
          Number(x.dataset.star) <= selectedRating
        )
      );
    };
  });

  $('#sendReview').onclick = () => submitReview(a.id);
}

// ======================================
// DOWNLOAD ADDON
// ======================================

async function downloadAddon(a) {
  if (!a.file_path) {
    toast('File addon tidak ditemukan.');
    return;
  }

  const fileName = a.file_name || 'addon.mcaddon';
  const countKey = `pradacraft_download_${a.id}`;

  try {
    toast('Menyiapkan download...');

    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(a.file_path, 300, {
        download: fileName
      });

    if (error) throw error;
    if (!data?.signedUrl) {
      throw new Error('Link download tidak tersedia.');
    }

    // Cek file terlebih dahulu tanpa mengunduhnya dua kali.
    const response = await fetch(data.signedUrl, {
      method: 'HEAD'
    });

    if (!response.ok) {
      throw new Error('File gagal diakses dari server.');
    }

    // Mulai proses download.
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = fileName;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Hitung satu kali per addon pada browser ini.
    if (!localStorage.getItem(countKey)) {
      const { error: countError } = await db.rpc(
        'increment_addon_download',
        { addon_id_input: a.id }
      );

      if (countError) {
        console.error('Download count error:', countError);
      } else {
        localStorage.setItem(countKey, '1');
      }
    }

    toast('Download dimulai!');

    await loadAddons();

  } catch (error) {
    console.error('Download error:', error);
    toast('Download gagal: ' + error.message);
  }
}

// ======================================
// RATING DAN KOMENTAR
// ======================================

async function submitReview(id) {
  const comment = $('#commentText').value.trim();

  if (!comment) {
    toast('Tulis komentar terlebih dahulu.');
    return;
  }

  const { error } = await db.from('reviews').insert({
    addon_id: id,
    name: 'Pengunjung',
    rating: selectedRating,
    comment
  });

  if (error) {
    console.error(error);
    toast('Gagal mengirim ulasan.');
    return;
  }

  toast('Terima kasih atas ulasanmu!');

  await openDetail(id);
}

// ======================================
// UPLOAD ADDON
// ======================================

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function uploadFile(file, path) {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });

  if (error) throw error;

  return path;
}

// ======================================
// ADMIN PANEL
// ======================================

async function renderAdmin() {
  if (!isOwner()) return;

  const [{ data: dataAddons, error: addonError },
         { data: reviews, error: reviewError }] = await Promise.all([
    db.from('addons').select('*').order('created_at', { ascending: false }),
    db.from('reviews').select('*').order('created_at', { ascending: false })
  ]);

  if (addonError) {
    console.error(addonError);
    toast('Gagal memuat addon admin.');
    return;
  }

  if (reviewError) {
    console.error(reviewError);
    toast('Gagal memuat komentar.');
  }

  const list = dataAddons || [];
  const comments = reviews || [];
  const search = ($('#adminSearch')?.value || '').toLowerCase();

  const totalDownloads = list.reduce(
    (sum, a) => sum + Number(a.downloads || 0), 0
  );

  $('#adminStats').innerHTML = `
    <div class="admin-stat"><b>${list.length}</b><span>Total Addon</span></div>
    <div class="admin-stat"><b>${totalDownloads.toLocaleString('id-ID')}</b><span>Download</span></div>
    <div class="admin-stat"><b>${comments.length}</b><span>Ulasan</span></div>
  `;

  const filtered = list.filter(a =>
    `${a.name} ${a.category}`.toLowerCase().includes(search)
  );

  $('#adminList').innerHTML = filtered.map(a => `
    <div class="admin-item admin-addon-item">
      ${a.image_path
        ? `<img class="admin-thumb" src="${esc(imageUrl(a.image_path))}" alt="">`
        : '<div class="admin-thumb admin-no-image">⬡</div>'}

      <div class="admin-addon-info">
        <b>${esc(a.name)}</b>
        <small>${esc(a.category)} · ${esc(a.version || '')}</small>
        <small>↓ ${Number(a.downloads || 0)} download · ★ ${Number(a.rating || 0).toFixed(1)}</small>
      </div>

      <div class="admin-actions">
        <button data-admin-action="edit" data-addon-id="${esc(a.id)}">Edit</button>
        <button data-admin-action="photo" data-addon-id="${esc(a.id)}">Foto</button>
        <button data-admin-action="remove-photo" data-addon-id="${esc(a.id)}">Hapus Foto</button>
        <button class="delete-btn" data-delete="${esc(a.id)}">Hapus Addon</button>
      </div>
    </div>
  `).join('') || '<p class="muted">Addon tidak ditemukan.</p>';

  const addonNames = Object.fromEntries(
    list.map(a => [a.id, a.name])
  );

  $('#adminReviewList').innerHTML = comments.map(r => `
    <div class="admin-review">
      <div>
        <b>${esc(r.name || 'Pengunjung')}</b>
        <span class="rating">${'★'.repeat(Number(r.rating || 0))}</span>
        <small>${esc(addonNames[r.addon_id] || 'Addon tidak ditemukan')}</small>
        <p>${esc(r.comment || '')}</p>
      </div>
      <button class="delete-btn"
        data-delete-review="${esc(r.id)}">Hapus Komentar</button>
    </div>
  `).join('') || '<p class="muted">Belum ada komentar.</p>';
}

async function editAdminAddon(id) {
  if (!isOwner()) return;

  const a = addons.find(x => x.id === id);
  if (!a) return;

  const name = prompt('Nama addon:', a.name);
  if (name === null) return;

  const category = prompt('Kategori:', a.category);
  if (category === null) return;

  const version = prompt('Versi:', a.version || '');
  if (version === null) return;

  const description = prompt('Deskripsi:', a.description || '');
  if (description === null) return;

  if (!name.trim() || !description.trim()) {
    toast('Nama dan deskripsi tidak boleh kosong.');
    return;
  }

  const { error } = await db.from('addons').update({
    name: name.trim(),
    category: category.trim(),
    version: version.trim(),
    description: description.trim()
  }).eq('id', id);

  if (error) {
    console.error(error);
    toast('Gagal mengedit addon: ' + error.message);
    return;
  }

  toast('Addon berhasil diperbarui.');
  await loadAddons();
  await renderAdmin();
}

async function replaceAdminImage(id) {
  if (!isOwner()) return;

  const a = addons.find(x => x.id === id);
  if (!a) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const path = `${currentUser.id}/${Date.now()}-cover-${safeFileName(file.name)}`;

    try {
      await uploadFile(file, path);

      const { error } = await db.from('addons')
        .update({ image_path: path })
        .eq('id', id);

      if (error) {
        await db.storage.from(BUCKET).remove([path]);
        throw error;
      }

      if (a.image_path) {
        const { error: removeError } = await db.storage
          .from(BUCKET).remove([a.image_path]);
        if (removeError) console.error(removeError);
      }

      toast('Foto addon berhasil diganti.');
      await loadAddons();
      await renderAdmin();

    } catch (error) {
      console.error(error);
      toast('Gagal mengganti foto: ' + error.message);
    }
  };

  input.click();
}

async function removeAdminImage(id) {
  if (!isOwner()) return;

  const a = addons.find(x => x.id === id);
  if (!a?.image_path) {
    toast('Addon ini belum memiliki foto.');
    return;
  }

  if (!confirm('Hapus foto sampul addon ini?')) return;

  const { error } = await db.from('addons')
    .update({ image_path: null })
    .eq('id', id);

  if (error) {
    toast('Gagal menghapus foto: ' + error.message);
    return;
  }

  const { error: storageError } = await db.storage
    .from(BUCKET).remove([a.image_path]);

  if (storageError) console.error(storageError);

  toast('Foto berhasil dihapus.');
  await loadAddons();
  await renderAdmin();
}

async function deleteAdminReview(id) {
  if (!isOwner()) return;
  if (!confirm('Yakin ingin menghapus komentar ini?')) return;

  const { error } = await db.from('reviews')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    toast('Gagal menghapus komentar: ' + error.message);
    return;
  }

  toast('Komentar berhasil dihapus.');
  await renderAdmin();
}

// ======================================
// SEARCH DAN FILTER
// ======================================

$('#search').addEventListener('input', render);

document.querySelectorAll('.filter').forEach(b => {
  b.onclick = () => {
    activeCategory = b.dataset.cat;

    document.querySelectorAll('.filter').forEach(x =>
      x.classList.toggle('active', x === b)
    );

    render();
  };
});

$('#adminOpen').onclick = showAdmin;
$('#heroAdmin').onclick = showAdmin;

$('#menuBtn').onclick = () => {
  $('#nav').classList.toggle('open');
};

// ========================================
// EVENT WEBSITE
// ========================================

document.addEventListener('click', e => {
  const target = e.target;

  // HAPUS ADDON
  const del = target.closest('[data-delete]');
  if (del) {
    e.preventDefault();
    e.stopPropagation();
    deleteAddon(del.dataset.delete);
    return;
  }

  // EDIT, FOTO, DAN HAPUS FOTO
  const adminAction = target.closest('[data-admin-action]');
  if (adminAction) {
    e.preventDefault();
    e.stopPropagation();

    const id = adminAction.dataset.addonId;
    const action = adminAction.dataset.adminAction;

    if (action === 'edit') editAdminAddon(id);
    if (action === 'photo') replaceAdminImage(id);
    if (action === 'remove-photo') removeAdminImage(id);
    return;
  }

  // HAPUS KOMENTAR
  const reviewDelete = target.closest('[data-delete-review]');
  if (reviewDelete) {
    e.preventDefault();
    e.stopPropagation();
    deleteAdminReview(reviewDelete.dataset.deleteReview);
    return;
  }

  // BUKA DETAIL ADDON
  const card = target.closest('[data-id]');
  if (card) {
    openDetail(card.dataset.id);
    return;
  }

  // TUTUP MODAL
  const close = target.closest('[data-close]')?.dataset.close;

  if (close) {
    const modalId = close === 'detail' ? 'detailModal' : 'adminModal';
    $('#' + modalId).classList.add('hidden');
  }
});

// PENCARIAN ADMIN
$('#adminSearch')?.addEventListener('input', renderAdmin);

// ======================================
// FORM UPLOAD
// ======================================

$('#addonForm').addEventListener('submit', async e => {
  e.preventDefault();

  await refreshUser();

  if (!isOwner()) {
    toast('Hanya pemilik yang boleh upload addon.');
    return;
  }

  const f = e.currentTarget;
  const fd = new FormData(f);
  const file = fd.get('file');
  const pic = fd.get('image');

  if (!file || !file.size) {
    toast('Pilih file addon.');
    return;
  }

  const allowed = /\.(mcaddon|mcpack|mcworld|mctemplate|zip)$/i;

  if (!allowed.test(file.name)) {
    toast('Format file addon tidak didukung.');
    return;
  }

  const base = `${currentUser.id}/${Date.now()}`;
  const filePath = `${base}-${safeFileName(file.name)}`;

  let imagePath = null;

  try {
    await uploadFile(file, filePath);

    if (pic && pic.size) {
      imagePath = `${base}-cover-${safeFileName(pic.name)}`;
      await uploadFile(pic, imagePath);
    }

    const { error } = await db.from('addons').insert({
      name: fd.get('name'),
      category: fd.get('category'),
      version: fd.get('version'),
      description: fd.get('description'),
      file_path: filePath,
      image_path: imagePath,
      file_name: file.name,
      created_by: currentUser.id
    });

    if (error) throw error;

    f.reset();

    toast('Addon berhasil dipublikasikan!');

    await loadAddons();
    await renderAdmin();

  } catch (error) {
    console.error(error);
    toast('Upload gagal: ' + error.message);
  }
});

// ======================================
// LOGOUT OWNER
// ======================================

logoutButton = document.createElement('button');
logoutButton.className = 'btn ghost full';
logoutButton.textContent = 'Logout GitHub';
logoutButton.style.display = 'none';

logoutButton.onclick = async () => {
  await db.auth.signOut();

  currentUser = null;
  updateOwnerControls();

  toast('Berhasil logout.');
};

$('#addonForm').before(logoutButton);

// ======================================
// STATUS LOGIN
// ======================================

db.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;

  updateOwnerControls();

  if (event === 'SIGNED_IN' && currentUser && !isOwner()) {
    currentUser = null;
    updateOwnerControls();

    db.auth.signOut().then(() => {
      toast('Akun ini tidak memiliki akses Admin PradaCraft.');
    });

    return;
  }

  if (event === 'SIGNED_IN' && isOwner()) {
    $('#adminModal').classList.remove('hidden');
    renderAdmin();
  }
});

// ======================================
// MULAI WEBSITE
// ======================================

async function start() {
  updateOwnerControls();

  await refreshUser();
  await loadAddons();

  const params = new URLSearchParams(window.location.search);

  if (params.get('admin') === 'login' && !isOwner()) {
    await loginGitHub();
  }
}

start();

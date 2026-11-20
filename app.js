
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
  const url = imageUrl(a.file_path);

  if (!url) {
    toast('File addon tidak ditemukan.');
    return;
  }

  try {
    const { error } = await db.rpc('increment_addon_download', {
      addon_id_input: a.id
    });

    if (error) throw error;

    // Ambil file dari Storage
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Gagal mengambil file addon.');
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    // Gunakan nama file asli saat upload
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = a.file_name || 'addon.mcaddon';

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    toast('Download dimulai!');

    await loadAddons();
    await openDetail(a.id);

  } catch (error) {
    console.error(error);
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

  const { data, error } = await db
    .from('addons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    toast('Gagal memuat daftar admin.');
    return;
  }

  $('#adminList').innerHTML = (data || []).map(a => `
    <div class="admin-item">
      <span>
        ${esc(a.name)}
        <span class="muted">(${esc(a.category)})</span>
      </span>

      <button class="delete-btn" data-delete="${esc(a.id)}">
        Hapus
      </button>
    </div>
  `).join('') || '<p class="muted">Belum ada addon.</p>';
}

async function deleteAddon(id) {
  if (!isOwner()) return;

  const a = addons.find(x => x.id === id);

  if (!a || !confirm('Hapus addon ini dari katalog?')) return;

  const paths = [a.image_path, a.file_path].filter(Boolean);

  const { error } = await db
    .from('addons')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    toast('Gagal menghapus addon.');
    return;
  }

  if (paths.length) {
    const { error: storageError } = await db
      .storage
      .from(BUCKET)
      .remove(paths);

    if (storageError) console.error(storageError);
  }

  toast('Addon berhasil dihapus.');

  await loadAddons();
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

// ======================================
// EVENT WEBSITE
// ======================================

document.addEventListener('click', e => {
  const c = e.target.closest('[data-id]');

  if (c) openDetail(c.dataset.id);

  const close = e.target.dataset.close;

  if (close) {
    $('#' + (close === 'detail' ? 'detailModal' : 'adminModal'))
      .classList.add('hidden');
  }

  const del = e.target.dataset.delete;

  if (del) deleteAddon(del);
});

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

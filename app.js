
const SUPABASE_URL = 'https://mnmahweaomkyxlayugir.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H3BVjXECWN9vvwOF0QW7pg_VPb_syzr';
const OWNER_UID = 'f7968f76-2e2c-4a5f-bea3-13636ac3c422';
const BUCKET = 'addons';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let addons = [];
let activeCategory = 'All';
let selectedRating = 5;
let currentUser = null;
let authMode = "login";

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

  document.body.classList.toggle('is-owner', visible);
  document.body.classList.toggle('is-visitor', !visible);

  ['#adminOpen', '#heroAdmin'].forEach(selector => {
    const el = $(selector);
    if (el) el.style.display = visible ? '' : 'none';
  });

  const ownerLoginButton = $('#ownerLoginOpen');
  if (ownerLoginButton) ownerLoginButton.classList.toggle('hidden', visible);

  if (!visible) {
    $('#adminModal')?.classList.add('hidden');
  }
}

async function refreshUser() {
  const { data, error } = await db.auth.getSession();

  if (error) console.error(error);

  currentUser = data?.session?.user || null;
  updateOwnerControls();
  updateAccountUI();

  return currentUser;
}

async function loginGitHub() {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: 'https://pradacraft.github.io/pradacraft/owner.html'
    }
  });

  if (error) toast('Login Owner gagal: ' + error.message);
}

function profileName(user = currentUser) {
  const meta = user?.user_metadata || {};
  return meta.full_name || meta.name || meta.display_name ||
    user?.email?.split('@')[0] || 'Pengunjung';
}

function profileAvatar(user = currentUser) {
  const meta = user?.user_metadata || {};
  return meta.avatar_url || meta.picture || meta.photo_url || '';
}

function avatarMarkup(name, url) {
  const safeName = esc(name || 'Pengunjung');
  return url
    ? `<img class="profile-avatar" src="${esc(url)}" alt="Foto profil" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="avatar-fallback" style="display:none">${safeName.charAt(0).toUpperCase()}</span>`
    : `<span class="avatar-fallback">${safeName.charAt(0).toUpperCase()}</span>`;
}

function updateAccountUI() {
  const loginButton = $('#loginOpen');
  const area = $('#accountArea');
  if (!loginButton || !area) return;

  const loggedIn = Boolean(currentUser);
  loginButton.classList.toggle('hidden', loggedIn);
  area.classList.toggle('hidden', !loggedIn);

  if (!loggedIn) {
    $('#accountDropdown')?.classList.add('hidden');
    return;
  }

  const name = profileName();
  const avatar = profileAvatar();
  $('#accountAvatar').innerHTML = avatarMarkup(name, avatar);
  $('#accountName').textContent = name;
  $('#accountFullName').textContent = name;
  $('#accountEmail').textContent = currentUser.email || '';
}

function openLoginModal(mode = 'login') {
  authMode = mode;
  // Selalu mulai dengan kolom kredensial kosong saat modal dibuka.
  $('#authEmail').value = '';
  $('#authPassword').value = '';
  $('#authName').value = '';
  $('#emailAuthForm')?.classList.remove('was-validated');
  const signup = mode === 'signup';
  $('#loginTitle').innerHTML = signup
    ? 'Buat <span class="green">Akun</span>'
    : 'Login <span class="green">Pengunjung</span>';
  $('#loginDescription').textContent = signup
    ? 'Daftar akun PradaCraft untuk memakai nama dan foto profil saat berkomentar.'
    : 'Masuk untuk memberi rating dan komentar dengan profilmu.';
  $('#authNameWrap').classList.toggle('hidden', !signup);
  $('#authName').required = signup;
  $('#authPassword').autocomplete = signup ? 'new-password' : 'current-password';
  $('#emailAuthSubmit').textContent = signup ? 'Daftar Akun' : 'Login';
  $('#forgotPassword').classList.toggle('hidden', signup);
  $('#authSwitchText').classList.remove('hidden');
  document.querySelector('.auth-divider')?.classList.remove('hidden');
  document.querySelector('.auth-providers')?.classList.remove('hidden');
  $('#authSwitchText').innerHTML = signup
    ? 'Sudah punya akun? <button type="button" id="switchAuthMode">Login</button>'
    : 'Belum punya akun? <button type="button" id="switchAuthMode">Daftar</button>';
  $('#switchAuthMode').onclick = () => {
    openLoginModal(authMode === 'login' ? 'signup' : 'login');
  };
  $('#loginModal').classList.remove('hidden');
}

function openOwnerLoginModal() {
  authMode = 'owner';
  // Jangan tampilkan kembali email/password dari sesi form sebelumnya.
  $('#authEmail').value = '';
  $('#authPassword').value = '';
  $('#authName').value = '';
  $('#emailAuthForm')?.classList.remove('was-validated');
  $('#loginTitle').innerHTML = 'Login <span class="green">Owner</span>';
  $('#loginDescription').textContent = 'Masuk menggunakan email dan kata sandi akun Owner PradaCraft.';
  $('#authNameWrap').classList.add('hidden');
  $('#authName').required = false;
  $('#authPassword').autocomplete = 'current-password';
  $('#emailAuthSubmit').textContent = 'Masuk sebagai Owner';
  $('#forgotPassword').classList.remove('hidden');
  $('#authSwitchText').classList.add('hidden');
  document.querySelector('.auth-divider')?.classList.add('hidden');
  document.querySelector('.auth-providers')?.classList.remove('hidden');
  $('#loginModal').classList.remove('hidden');
}

async function loginProvider(provider, ownerMode = false) {
  if (ownerMode && provider === 'github') {
    localStorage.setItem('pradacraft_owner_github_login', '1');
  }

  const { error } = await db.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: 'https://pradacraft.github.io/pradacraft/'
    }
  });

  if (error) {
    if (ownerMode) localStorage.removeItem('pradacraft_owner_github_login');
    toast('Login ' + provider + ' gagal: ' + error.message);
  }
}

$('#emailAuthForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const button = $('#emailAuthSubmit');
  button.disabled = true;
  button.textContent = authMode === 'signup' ? 'Mendaftarkan...' : 'Memeriksa...';

  try {
    if (authMode === 'signup') {
      const displayName = $('#authName').value.trim();
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName, full_name: displayName } }
      });
      if (error) throw error;
      if (data.session) {
        currentUser = data.user;
        updateAccountUI();
        $('#loginModal').classList.add('hidden');
        toast('Akun berhasil dibuat dan kamu sudah login.');
      } else {
        toast('Pendaftaran berhasil. Periksa email untuk konfirmasi akun.');
      }
    } else {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (authMode === 'owner' && data.user.id !== OWNER_UID) {
        await db.auth.signOut();
        currentUser = null;
        updateAccountUI();
        updateOwnerControls();
        toast('Akun ini bukan Owner PradaCraft.');
        return;
      }

      currentUser = data.user;
      updateAccountUI();
      updateOwnerControls();
      $('#loginModal').classList.add('hidden');
      if (authMode === 'owner') {
        $('#adminModal').classList.remove('hidden');
        await renderAdmin();
        toast('Berhasil masuk sebagai Owner.');
      } else {
        toast('Berhasil login!');
      }
    }
  } catch (error) {
    console.error(error);
    toast('Login/daftar gagal: ' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = authMode === 'signup' ? 'Daftar Akun' :
      authMode === 'owner' ? 'Masuk sebagai Owner' : 'Login';
  }
});

$('#googleLogin')?.addEventListener('click', () => loginProvider('google', authMode === 'owner'));
$('#facebookLogin')?.addEventListener('click', () => loginProvider('facebook', authMode === 'owner'));
$('#githubLogin')?.addEventListener('click', () => loginProvider('github', authMode === 'owner'));
$('#forgotPassword')?.addEventListener('click', async () => {
  const email = $('#authEmail').value.trim();
  const button = $('#forgotPassword');
  if (!email) {
    toast('Masukkan email terlebih dahulu.');
    $('#authEmail').focus();
    return;
  }

  button.disabled = true;
  button.textContent = 'Mengirim link...';
  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://pradacraft.github.io/pradacraft/'
    });
    if (error) {
      const message = error.message || 'Terjadi kesalahan.';
      if (/rate limit|too many|cooldown|429/i.test(message)) {
        toast('Supabase sedang membatasi pengiriman email. Tunggu sebentar lalu coba lagi.');
      } else {
        toast('Gagal mengirim email pemulihan: ' + message);
      }
    } else {
      toast('Jika email terdaftar, link pemulihan akan dikirim. Periksa Inbox dan Spam.');
    }
  } catch (error) {
    console.error('Password recovery request failed:', error);
    toast('Tidak dapat mengirim email. Periksa koneksi lalu coba lagi.');
  } finally {
    button.disabled = false;
    button.textContent = 'Lupa kata sandi?';
  }
});

$('#passwordRecoveryForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const password = $('#newRecoveryPassword').value;
  const confirmation = $('#confirmRecoveryPassword').value;
  const button = $('#saveRecoveryPassword');

  if (password.length < 8) {
    toast('Password baru minimal 8 karakter.');
    return;
  }
  if (password !== confirmation) {
    toast('Konfirmasi password tidak sama.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Menyimpan...';
  try {
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;

    $('#passwordRecoveryModal').classList.add('hidden');
    $('#passwordRecoveryForm').reset();
    $('#loginModal').classList.remove('hidden');
    toast('Password berhasil diperbarui. Silakan login dengan password baru.');
    await db.auth.signOut();
    currentUser = null;
    updateAccountUI();
    updateOwnerControls();
  } catch (error) {
    console.error('Password update failed:', error);
    toast('Gagal memperbarui password: ' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Simpan Password Baru';
  }
});

$('#switchAuthMode')?.addEventListener('click', () => {
  openLoginModal(authMode === 'login' ? 'signup' : 'login');
});

$('#loginOpen')?.addEventListener('click', () => openLoginModal('login'));
$('#ownerLoginOpen')?.addEventListener('click', openOwnerLoginModal);
$('#accountTrigger')?.addEventListener('click', () => {
  $('#accountDropdown').classList.toggle('hidden');
});
$('#accountLogout')?.addEventListener('click', async () => {
  const { error } = await db.auth.signOut();
  if (error) {
    toast('Logout gagal: ' + error.message);
    return;
  }
  currentUser = null;
  updateAccountUI();
  updateOwnerControls();
  toast('Berhasil logout.');
});
document.addEventListener('click', e => {
  if (!e.target.closest('#accountArea')) $('#accountDropdown')?.classList.add('hidden');
});

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

async function signedImageUrl(path) {
  if (!path) return '';

  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) {
    console.warn('Gagal membuat URL gambar:', error.message);
    return '';
  }
  return data?.signedUrl || '';
}

function reviewIdentity(review) {
  const owner = review.user_id === OWNER_UID;
  const name = review.name || 'Pengunjung';
  const avatar = review.avatar_url || '';
  return `<div class="review-author">${avatarMarkup(name, avatar)}<span>${esc(name)}</span>${owner ? '<span class="verified-badge" title="Owner terverifikasi">✓</span>' : ''}</div>`;
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

  addons = await Promise.all((data || []).map(async addon => ({
    ...addon,
    image_url: await signedImageUrl(addon.image_path)
  })));
  render();
}

function card(a) {
  const image = a.image_url || '';

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
            ★ ${Number(a.rating || 0).toFixed(1)} (${Number(a.votes || 0)})
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
  const { data: myReview, error: myReviewError } = currentUser
    ? await db.from('reviews').select('id').eq('addon_id', id).eq('user_id', currentUser.id).maybeSingle()
    : { data: null, error: null };
  if (myReviewError) console.error('Cek ulasan akun gagal:', myReviewError);

  const avg = Number(a.rating || 0);
  const ratingCount = Number(a.votes || comments.length || 0);
  const image = a.image_url || '';

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
        ★ ${avg.toFixed(1)} (${ratingCount} ratings)
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

      ${myReview ? '<p class="muted">Kamu sudah memberi rating dan komentar untuk addon ini. Ulasan yang sudah dikirim tidak dapat diedit atau dikirim ulang.</p>' : `
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
      </button>`}

      <h3 style="margin-top:20px">Komentar pengunjung</h3>

      <div id="comments">
        ${comments.map((c, i) => `
          <div class="comment">
            <div class="comment-heading">${reviewIdentity(c)}<span class="rating">${'★'.repeat(Number(c.rating || 0))}</span></div>

            <p data-translation-id="comment-${i}"
              data-original="${esc(c.comment || '')}">${esc(c.comment || '')}</p>

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

  if ($('#sendReview')) $('#sendReview').onclick = () => submitReview(a.id);
}

// ======================================
// DOWNLOAD ADDON
// ======================================

async function downloadAddon(a) {
  await refreshUser();

  if (!currentUser) {
    toast('Login terlebih dahulu untuk mengunduh addon.');
    openLoginModal('login');
    return;
  }

  if (!a.file_path) {
    toast('File addon tidak ditemukan.');
    return;
  }

  const fileName = a.file_name || 'addon.mcaddon';

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

    // Database membatasi satu hitungan per akun per addon per hari.
    const { error: countError } = await db
      .from('addon_download_events')
      .insert({ addon_id: a.id, user_id: currentUser.id });

    if (countError && countError.code !== '23505') {
      console.error('Download count error:', countError);
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
  await refreshUser();

  if (!currentUser) {
    toast('Login terlebih dahulu untuk memberi rating dan komentar.');
    openLoginModal('login');
    return;
  }

  const comment = $('#commentText')?.value.trim() || '';
  if (!comment) {
    toast('Tulis komentar terlebih dahulu.');
    return;
  }

  const { data: existingReview, error: checkError } = await db
    .from('reviews').select('id').eq('addon_id', id)
    .eq('user_id', currentUser.id).maybeSingle();

  if (checkError) {
    console.error(checkError);
    toast('Gagal memeriksa ulasan akun.');
    return;
  }
  if (existingReview) {
    toast('Kamu sudah pernah memberi rating dan komentar untuk addon ini.');
    await openDetail(id);
    return;
  }

  const { error } = await db.from('reviews').insert({
    addon_id: id,
    user_id: currentUser.id,
    name: profileName(),
    avatar_url: profileAvatar(),
    rating: selectedRating,
    comment
  });

  if (error) {
    console.error(error);
    if (error.code === '23505') {
      toast('Kamu hanya boleh memberi satu ulasan untuk addon ini.');
    } else if (error.code === '42501') {
      toast('Login diperlukan untuk mengirim ulasan.');
    } else {
      toast('Gagal mengirim ulasan: ' + error.message);
    }
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
 // HAPUS ADDON
 // ======================================

async function deleteAddon(id) {
  if (!isOwner()) {
    toast('Hanya Owner yang boleh menghapus addon.');
    return;
  }

  const addon = addons.find(a => a.id === id);

  if (!addon) {
    toast('Addon tidak ditemukan.');
    return;
  }

  if (!confirm(`Yakin ingin menghapus addon "${addon.name}"?`)) {
    return;
  }

  const { error } = await db
    .from('addons')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    toast('Gagal menghapus addon: ' + error.message);
    return;
  }

  const filesToDelete = [
    addon.file_path,
    addon.image_path
  ].filter(Boolean);

  if (filesToDelete.length) {
    const { error: storageError } = await db
      .storage
      .from(BUCKET)
      .remove(filesToDelete);

    if (storageError) {
      console.error('Gagal menghapus file Storage:', storageError);
      toast('Addon terhapus, tetapi file lama belum terhapus.');
    }
  }

  toast('Addon berhasil dihapus!');

  await loadAddons();
  await renderAdmin();
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
    <div class="admin-addon-info">
      <h3>${esc(a.name || 'Tanpa Nama')}</h3>
      <p>${esc(a.category || 'Lainnya')} • Versi ${esc(a.version || '-')}</p>
    </div>

    <div class="admin-actions">
      <button type="button" data-admin-action="edit" data-addon-id="${esc(a.id)}">
        Edit
      </button>

      <button type="button" data-admin-action="photo" data-addon-id="${esc(a.id)}">
        Ganti Foto
      </button>

      <button type="button" data-admin-action="remove-photo" data-addon-id="${esc(a.id)}">
        Hapus Foto
      </button>

      <button type="button" class="delete-btn" data-delete="${esc(a.id)}">
        Hapus Addon
      </button>
    </div>
  </div>
`).join('') || '<p class="muted">Addon tidak ditemukan.</p>';

// HUBUNGKAN TOMBOL ADMIN
$('#adminList').querySelectorAll('[data-admin-action="edit"]').forEach(button => {
  button.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    editAdminAddon(button.dataset.addonId);
  };
});

$('#adminList').querySelectorAll('[data-admin-action="photo"]').forEach(button => {
  button.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    replaceAdminImage(button.dataset.addonId);
  };
});

$('#adminList').querySelectorAll('[data-admin-action="remove-photo"]').forEach(button => {
  button.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    removeAdminImage(button.dataset.addonId);
  };
});

$('#adminList').querySelectorAll('[data-delete]').forEach(button => {
  button.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    deleteAddon(button.dataset.delete);
  };
});

  const addonNames = Object.fromEntries(
    list.map(a => [a.id, a.name])
  );

  $('#adminReviewList').innerHTML = comments.map(r => `
    <div class="admin-review">
      <div>
        <div class="comment-heading">${reviewIdentity(r)}<span class="rating">${'★'.repeat(Number(r.rating || 0))}</span></div>
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
  if (!a) {
    toast('Addon tidak ditemukan.');
    return;
  }

  document.getElementById('adminEditModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'adminEditModal';
  modal.className = 'admin-edit-overlay';

  modal.innerHTML = `
    <div class="admin-edit-box">
      <div class="admin-edit-header">
        <div>
          <span class="admin-edit-label">PRADACRAFT ADMIN</span>
          <h2>Edit Addon</h2>
          <p>Perbarui informasi addon kamu.</p>
        </div>
        <button type="button" class="admin-edit-close">×</button>
      </div>

      <form id="adminEditForm">
        <label>Nama Addon</label>
        <input name="name" value="${esc(a.name || '')}" required>

        <div class="admin-edit-grid">
          <div>
            <label>Kategori</label>
            <input name="category" value="${esc(a.category || '')}" required>
          </div>
          <div>
            <label>Versi</label>
            <input name="version" value="${esc(a.version || '')}">
          </div>
        </div>

        <label>Deskripsi Addon</label>
        <textarea name="description" rows="8" required>${esc(a.description || '')}</textarea>

        <div class="admin-edit-footer">
          <button type="button" class="admin-cancel">Batal</button>
          <button type="submit" class="admin-save">Simpan Perubahan ↗</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();

  modal.querySelector('.admin-edit-close').onclick = closeModal;
  modal.querySelector('.admin-cancel').onclick = closeModal;

  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  modal.querySelector('#adminEditForm').onsubmit = async e => {
    e.preventDefault();

    const form = new FormData(e.target);
    const button = modal.querySelector('.admin-save');

    const updates = {
      name: form.get('name').trim(),
      category: form.get('category').trim(),
      version: form.get('version').trim(),
      description: form.get('description').trim()
    };

    if (!updates.name || !updates.description) {
      toast('Nama dan deskripsi wajib diisi.');
      return;
    }

    button.disabled = true;
    button.textContent = 'Menyimpan...';

    const { error } = await db
      .from('addons')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error(error);
      toast('Gagal menyimpan: ' + error.message);
      button.disabled = false;
      button.textContent = 'Simpan Perubahan ↗';
      return;
    }

    closeModal();
    toast('Addon berhasil diperbarui!');
    await loadAddons();
    await renderAdmin();
  };
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

$('#nav')?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => $('#nav').classList.remove('open'));
});

 // ========================================
 // EVENT WEBSITE
 // ========================================

document.addEventListener('click', function(e) {
  const target = e.target instanceof Element
    ? e.target
    : e.target.parentElement;

  if (!target) return;

  // EDIT, FOTO, HAPUS FOTO
  const adminAction = target.closest('[data-admin-action]');

  if (adminAction) {
    e.preventDefault();
    e.stopPropagation();

    const id = adminAction.dataset.addonId;
    const action = adminAction.dataset.adminAction;

    if (action === 'edit') {
      editAdminAddon(id);
    } else if (action === 'photo') {
      replaceAdminImage(id);
    } else if (action === 'remove-photo') {
      removeAdminImage(id);
    }

    return;
  }

  // HAPUS ADDON
  const del = target.closest('[data-delete]');

  if (del) {
    e.preventDefault();
    e.stopPropagation();
    deleteAddon(del.dataset.delete);
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
    const modalId = close === 'detail'
      ? 'detailModal'
      : close === 'login'
        ? 'loginModal'
        : 'adminModal';

    $('#' + modalId)?.classList.add('hidden');

    // Kosongkan data login setiap kali jendela login ditutup.
    if (close === 'login') {
      $('#emailAuthForm')?.reset();
      $('#authEmail').value = '';
      $('#authPassword').value = '';
      $('#authName').value = '';
      const submit = $('#emailAuthSubmit');
      if (submit) {
        submit.disabled = false;
        submit.textContent = authMode === 'signup' ? 'Daftar Akun' :
          authMode === 'owner' ? 'Masuk sebagai Owner' : 'Login';
      }
    }
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
// STATUS LOGIN
// ======================================

db.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  updateOwnerControls();
  updateAccountUI();

  if (event === 'PASSWORD_RECOVERY') {
    $('#loginModal').classList.add('hidden');
    $('#passwordRecoveryModal').classList.remove('hidden');
    $('#newRecoveryPassword').value = '';
    $('#confirmRecoveryPassword').value = '';
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

  // OAuth GitHub untuk Owner hanya diterima jika kembali sebagai UID Owner yang sah.
  if (localStorage.getItem('pradacraft_owner_github_login') === '1') {
    localStorage.removeItem('pradacraft_owner_github_login');

    if (isOwner()) {
      $('#adminModal').classList.remove('hidden');
      await renderAdmin();
      toast('Berhasil masuk sebagai Owner melalui GitHub.');
    } else if (currentUser) {
      await db.auth.signOut();
      currentUser = null;
      updateAccountUI();
      updateOwnerControls();
      toast('Akun GitHub ini belum terhubung ke akun Owner PradaCraft.');
    }
  }

  await loadAddons();

  const params = new URLSearchParams(window.location.search);

  if (params.get('admin') === 'login' && !isOwner()) {
    if (currentUser) {
      toast('Akun ini bukan Owner PradaCraft. Silakan logout dari akun pengunjung terlebih dahulu.');
    } else {
      openOwnerLoginModal();
    }
  }
}

start();

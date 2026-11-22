
const SUPABASE_URL = 'https://mnmahweaomkyxlayugir.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H3BVjXECWN9vvwOF0QW7pg_VPb_syzr';
const OWNER_UID = 'f7968f76-2e2c-4a5f-bea3-13636ac3c422';
const BUCKET = 'addons';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let addons = [];
let activeCategory = 'All';
let selectedRating = 5;
let currentUser = null;
let currentProfile = null;
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

  // Login Owner tidak ditampilkan kepada publik. Akses Owner hanya melalui
  // jalur login khusus dan tetap diverifikasi memakai UID.
  $('#ownerLoginOpen')?.classList.add('hidden');
  $('#drawerOwnerLogin')?.classList.add('hidden');
  $('#adminOpen')?.classList.toggle('hidden', !visible);
  $('#heroAdmin')?.classList.toggle('hidden', !visible);
  $('#drawerOwnerPanel')?.classList.toggle('hidden', !visible);

  if (!visible) {
    $('#adminModal')?.classList.add('hidden');
  }
}

async function refreshUser() {
  const { data, error } = await db.auth.getSession();

  if (error) console.error(error);

  currentUser = data?.session?.user || null;
  await ensureCurrentProfile(currentUser);
  updateOwnerControls();
  updateAccountUI();

  return currentUser;
}

async function loginGitHub() {
  await loginProvider('github', true);
}

function profileName(user = currentUser) {
  const meta = user?.user_metadata || {};
  if (user?.id === currentUser?.id && currentProfile?.display_name) return currentProfile.display_name;
  return meta.display_name || meta.full_name || meta.name ||
    user?.email?.split('@')[0] || 'Pengunjung';
}

function profileAvatar(user = currentUser) {
  const meta = user?.user_metadata || {};
  if (user?.id === currentUser?.id && currentProfile?.avatar_url) return currentProfile.avatar_url;
  return meta.avatar_url || meta.picture || meta.photo_url || '';
}

async function ensureCurrentProfile(user) {
  if (!user) { currentProfile = null; return null; }
  const { data: found, error: readError } = await db.from('profiles')
    .select('id,display_name,avatar_url,updated_at').eq('id', user.id).maybeSingle();
  if (readError) console.error('Gagal membaca profil:', readError);
  if (found) { currentProfile = found; return found; }

  const meta = user.user_metadata || {};
  const initial = {
    id: user.id,
    display_name: String(meta.display_name || meta.full_name || meta.name || user.email?.split('@')[0] || 'Pengunjung').slice(0,40),
    avatar_url: meta.avatar_url || meta.picture || meta.photo_url || null
  };
  const { error: insertError } = await db.from('profiles').upsert(initial, { onConflict:'id', ignoreDuplicates:true });
  if (insertError) console.error('Gagal membuat profil:', insertError);
  const { data } = await db.from('profiles').select('id,display_name,avatar_url,updated_at').eq('id', user.id).maybeSingle();
  currentProfile = data || initial;
  return currentProfile;
}

function ownerVerifiedMarkup(userId) {
  return userId === OWNER_UID ? '<span class="verified-badge" title="Owner PradaCraft terverifikasi" aria-label="Owner terverifikasi">✓</span>' : '';
}

function openAccountModal() {
  if (!currentUser) return openLoginModal('login');
  $('#profileModalTitle').textContent = 'Detail Akun';
  $('#profileDisplayName').value = profileName();
  $('#profileEmail').textContent = currentUser.email || 'Email tidak tersedia';
  $('#profileAvatarPreview').innerHTML = avatarMarkup(profileName(), profileAvatar());
  $('#profileIdentityName').innerHTML = '<span class="'+(isOwner()?'owner-name':'visitor-name')+'">'+esc(profileName())+'</span>'+ownerVerifiedMarkup(currentUser.id);
  $('#profileVerified').textContent = isOwner() ? 'Owner PradaCraft terverifikasi' : 'Akun Pengunjung';
  $('#profileEditForm').classList.remove('hidden');
  $('#profileLogout').classList.remove('hidden');
  $('#profileSave').classList.remove('hidden');
  $('#profilePhoto').value = '';
  $('#profileModal').classList.remove('hidden');
}

async function openPublicProfile(userId, fallbackName, fallbackAvatar) {
  if (!userId) return;
  let profile = null;
  const { data, error } = await db.from('profiles').select('id,display_name,avatar_url').eq('id', userId).maybeSingle();
  if (error) console.warn('Profil publik tidak tersedia:', error);
  profile = data || { id:userId, display_name:fallbackName || 'Pengunjung', avatar_url:fallbackAvatar || '' };
  const name = profile.display_name || fallbackName || 'Pengunjung';
  $('#profileModalTitle').textContent = 'Profil Pengguna';
  $('#profileDisplayName').value = name;
  $('#profileEmail').textContent = userId === currentUser?.id ? (currentUser.email || '') : 'Anggota PradaCraft';
  $('#profileAvatarPreview').innerHTML = avatarMarkup(name, profile.avatar_url || fallbackAvatar || '');
  $('#profileIdentityName').innerHTML = '<span class="'+(userId === OWNER_UID?'owner-name':'visitor-name')+'">'+esc(name)+'</span>'+ownerVerifiedMarkup(userId);
  $('#profileVerified').textContent = userId === OWNER_UID ? 'Owner PradaCraft terverifikasi' : 'Pengunjung PradaCraft';
  $('#profileEditForm').classList.add('hidden');
  $('#profileLogout').classList.add('hidden');
  $('#profileSave').classList.add('hidden');
  $('#profileModal').classList.remove('hidden');
}

async function saveAccountProfile() {
  if (!currentUser) return;
  const button = $('#profileSave');
  const displayName = $('#profileDisplayName').value.trim();
  const file = $('#profilePhoto').files?.[0];
  if (!displayName || displayName.length > 40) {
    toast('Nama profil harus 1–40 karakter.');
    return;
  }
  if (file && (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 3*1024*1024)) {
    toast('Foto harus PNG, JPG, atau WebP dan maksimal 3 MB.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Menyimpan...';
  try {
    let avatarUrl = profileAvatar();
    if (file) {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = currentUser.id + '/profile-' + Date.now() + '.' + ext;
      const { error: uploadError } = await db.storage.from('avatars').upload(path, file, {
        upsert: true, contentType: file.type, cacheControl: '3600'
      });
      if (uploadError) throw uploadError;
      avatarUrl = db.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const { data: updatedUser, error: authError } = await db.auth.updateUser({
      data: { display_name: displayName, full_name: displayName, name: displayName, avatar_url: avatarUrl || null }
    });
    if (authError) throw authError;

    const { data: savedProfile, error: profileError } = await db.from('profiles').upsert({
      id: currentUser.id, display_name: displayName, avatar_url: avatarUrl || null, updated_at: new Date().toISOString()
    }, { onConflict:'id' }).select().single();
    if (profileError) throw profileError;

    currentUser = updatedUser.user || currentUser;
    currentProfile = savedProfile;
    updateAccountUI();
    $('#profileAvatarPreview').innerHTML = avatarMarkup(displayName, avatarUrl);
    $('#profileVerified').innerHTML = isOwner() ? '<span class="verified-badge">✓</span> Owner PradaCraft terverifikasi' : 'Akun Pengunjung';
    toast('Profil berhasil diperbarui.');
    const addonId = $('#detailModal')?.dataset.addonId;
    if (addonId && !$('#detailModal').classList.contains('hidden')) await openDetail(addonId);
  } catch (error) {
    console.error('Gagal menyimpan profil:', error);
    toast('Gagal menyimpan profil: ' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Simpan Perubahan';
  }
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
  const drawerLoginButton = $('#drawerLogin');
  if (drawerLoginButton) drawerLoginButton.classList.toggle('hidden', loggedIn);
  const drawerAccount = $('#drawerAccount');
  if (drawerAccount) drawerAccount.classList.toggle('hidden', !loggedIn);

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
  const drawerAvatar = $('#drawerAccountAvatar');
  if (drawerAvatar) drawerAvatar.innerHTML = avatarMarkup(name, avatar);
  const drawerName = $('#drawerAccountName');
  if (drawerName) {
    drawerName.innerHTML = '<span class="'+(isOwner()?'owner-name':'visitor-name')+'">'+esc(name)+'</span>'+ownerVerifiedMarkup(currentUser.id);
  }
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
  $('#emailAuthForm')?.classList.remove('hidden');
  $('#forgotPassword')?.classList.toggle('hidden', signup);
  $('#googleLogin')?.classList.remove('hidden');
  $('#facebookLogin')?.classList.remove('hidden');
  $('#githubLogin')?.classList.add('hidden');
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
  $('#loginDescription').textContent = 'Login Owner khusus menggunakan akun GitHub yang telah diizinkan.';
  $('#emailAuthForm')?.classList.add('hidden');
  $('#forgotPassword')?.classList.add('hidden');
  $('#authNameWrap').classList.add('hidden');
  $('#authName').required = false;
  $('#authPassword').autocomplete = 'current-password';
  $('#emailAuthSubmit').textContent = 'Masuk sebagai Owner';
  $('#forgotPassword').classList.remove('hidden');
  $('#authSwitchText').classList.add('hidden');
  document.querySelector('.auth-divider')?.classList.add('hidden');
  document.querySelector('.auth-providers')?.classList.remove('hidden');
  $('#googleLogin')?.classList.add('hidden');
  $('#facebookLogin')?.classList.add('hidden');
  $('#githubLogin')?.classList.remove('hidden');
  $('#loginModal').classList.remove('hidden');
}

async function loginProvider(provider, ownerMode = false) {
  const button = document.getElementById(provider + 'Login');
  const label = button?.querySelector('span');
  const originalLabel = label?.textContent || provider;
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (label) label.textContent = 'Menghubungkan...';
  }

  if (ownerMode) {
    localStorage.setItem('pradacraft_owner_oauth_login', '1');
  }

  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await db.auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    });

    if (error) throw error;
  } catch (error) {
    if (ownerMode) localStorage.removeItem('pradacraft_owner_oauth_login');
    console.error('OAuth login error (' + provider + '):', error);
    const message = String(error?.message || 'Terjadi kesalahan.');
    if (/provider.*not enabled|unsupported provider|provider_disabled/i.test(message + ' ' + (error?.code || ''))) {
      toast('Login ' + provider + ' belum diaktifkan di Supabase Auth. Periksa pengaturan Providers.');
    } else if (/redirect.*(url|uri)|not allowed/i.test(message)) {
      toast('Alamat kembali login belum diizinkan di Supabase URL Configuration.');
    } else {
      toast('Login ' + provider + ' gagal: ' + message);
    }
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (label) label.textContent = originalLabel;
    }
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

$('#googleLogin')?.addEventListener('click', () => {
  if (authMode !== 'owner') loginProvider('google', false);
});
$('#facebookLogin')?.addEventListener('click', () => {
  if (authMode !== 'owner') loginProvider('facebook', false);
});
$('#githubLogin')?.addEventListener('click', () => {
  if (authMode === 'owner') loginProvider('github', true);
});
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
// Login Owner sengaja tidak memiliki tombol publik; gunakan URL khusus ?admin=login.
$('#accountTrigger')?.addEventListener('click', openAccountModal);
$('#drawerAccount')?.addEventListener('click', () => { setDrawer(false); openAccountModal(); });
$('#profileEditForm')?.addEventListener('submit', async e => { e.preventDefault(); await saveAccountProfile(); });
$('#profileLogout')?.addEventListener('click', async () => {
  const { error } = await db.auth.signOut();
  if (error) { toast('Logout gagal: ' + error.message); return; }
  currentUser = null; currentProfile = null;
  updateAccountUI(); updateOwnerControls();
  $('#profileModal').classList.add('hidden');
  toast('Berhasil logout.');
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
  if (/^https?:\/\//i.test(path)) return path;

  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) {
    console.warn('Gagal membuat URL gambar:', error.message);
    return '';
  }
  return data?.signedUrl || '';
}

function reviewIdentity(review) {
  const name = review.name || 'Pengunjung';
  const avatar = review.avatar_url || '';
  const verified = ownerVerifiedMarkup(review.user_id);
  const ownerClass = review.user_id === OWNER_UID ? "owner-name" : "visitor-name";
  return `<button type="button" class="review-author profile-open" data-profile-id="${esc(review.user_id || '')}" data-profile-name="${esc(name)}" data-profile-avatar="${esc(avatar)}">${avatarMarkup(name, avatar)}<span class="${ownerClass}">${esc(name)}</span>${verified}</button>`;
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

function videoMarkup(raw, title = 'Preview Minecraft') {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    let embed = '';
    if (host === 'youtu.be') embed = 'https://www.youtube-nocookie.com/embed/' + url.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const id = url.searchParams.get('v') || url.pathname.match(/\/embed\/([^/]+)/)?.[1] || url.pathname.match(/\/shorts\/([^/]+)/)?.[1];
      if (id) embed = 'https://www.youtube-nocookie.com/embed/' + id;
    }
    if (embed) return `<div class="media-preview"><div class="media-label">▶ VIDEO PREVIEW</div><iframe src="${esc(embed)}" title="${esc(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url.pathname + url.search)) return `<div class="media-preview"><div class="media-label">▶ VIDEO PREVIEW</div><video controls playsinline preload="metadata"><source src="${esc(url.href)}"></video></div>`;
  } catch (_) { return ''; }
  return '';
}

function card(a) {
  const image = a.image_url || '';
  const skin = a.category === 'Skin';
  const skinModel = skin ? (String(a.version || '').match(/Model:\s*([^•]+)/i)?.[1]?.trim() || 'Model tidak dicantumkan') : '';

  return `
    <article class="addon-card ${skin ? 'skin-card' : ''}" data-id="${esc(a.id)}">
      <div class="cover">
        ${image
          ? `<img src="${esc(image)}" alt="${esc(a.name)}">`
          : '<div class="cover-placeholder">⬡</div>'}
        <span class="category-pill">${skin ? '🧍 Skin' : esc(a.category)}</span>
      </div>

      <div class="card-body">
        <div class="card-title-row">
          <h3>${esc(a.name)}</h3>
          <span class="version">${esc(skin ? skinModel : (a.version || 'Bedrock'))}</span>
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
  const q = ($('#search')?.value || '').trim().toLowerCase();
  const sort = $('#sortBy')?.value || 'newest';
  const versionFilter = $('#versionFilter')?.value || 'all';
  let list = addons.filter(a => {
    const version = String(a.version || '').toLowerCase();
    const matchesVersion = versionFilter === 'all' ||
      (versionFilter === 'unknown' && !version.trim()) ||
      (versionFilter === '26' && /26(?:\.|\b)/.test(version)) ||
      (versionFilter === '121' && /1\.21/.test(version)) ||
      (versionFilter === '120' && /1\.20/.test(version)) ||
      (versionFilter === '119' && /1\.19/.test(version));
    return (activeCategory === 'All' || a.category === activeCategory) &&
      matchesVersion &&
      `${a.name} ${a.description} ${a.category} ${a.version || ''}`.toLowerCase().includes(q);
  });
  list = [...list];
  if (sort === 'popular') list.sort((a,b) => Number(b.downloads||0)-Number(a.downloads||0));
  else if (sort === 'rating') list.sort((a,b) => Number(b.rating||0)-Number(a.rating||0));
  else if (sort === 'name') list.sort((a,b) => String(a.name||'').localeCompare(String(b.name||''),'id'));
  else list.sort((a,b) => new Date(b.created_at||0)-new Date(a.created_at||0));

  const showcase = $('#categoryShowcase');
  if (showcase) {
    if (activeCategory === 'All') {
      showcase.classList.add('hidden');
      showcase.innerHTML = '';
    } else {
      const categoryItems = addons.filter(a => a.category === activeCategory);
      const featured = categoryItems.find(a => a.video_url) || categoryItems[0];
      const categoryNames = {Addon:'ADDON REALMS',Texture:'TEXTURE WORLDS',Map:'MAP EXPLORER',Shader:'VISUAL ENHANCEMENTS',Skin:'PLAYER SKINS',Other:'COMMUNITY PICKS'};
      showcase.classList.remove('hidden');
      showcase.innerHTML = `<div class="category-showcase-copy"><span class="pixel-kicker">PRADACRAFT / ${esc(activeCategory.toUpperCase())}</span><h2>${esc(categoryNames[activeCategory] || activeCategory.toUpperCase())}</h2><p>${categoryItems.length} koleksi tersedia. Pilih konten untuk melihat detail, versi, preview, dan sumber unduhannya.</p></div>${featured?.video_url ? videoMarkup(featured.video_url, featured.name) : '<div class="category-preview-placeholder"><span>▣</span><b>DISCOVER THE WORLD</b><small>Preview video akan muncul saat Owner menambahkan video untuk kategori ini.</small></div>'}`;
    }
  }
  $('#catalogGrid').innerHTML = list.map(card).join('');
  const skinItems = [...addons]
    .filter(a => a.category === 'Skin' && (!q || `${a.name} ${a.description} ${a.version || ''}`.toLowerCase().includes(q)))
    .sort((a,b) => new Date(b.created_at||0)-new Date(a.created_at||0));
  $('#skinGrid').innerHTML = skinItems.slice(0,6).map(card).join('');
  $('#skinEmpty')?.classList.toggle('hidden', skinItems.length > 0 || Boolean(q));
  $('#skins')?.classList.toggle('hidden', activeCategory !== 'All' && activeCategory !== 'Skin');
  const countLabel = $('#resultCount');
  if (countLabel) countLabel.textContent = `Menampilkan ${list.length} dari ${addons.length} koleksi`;
  $('#empty').classList.toggle('hidden', list.length > 0);
  $('#popularGrid').innerHTML = [...addons].sort((a,b) => Number(b.downloads||0)-Number(a.downloads||0)).slice(0,3).map(card).join('');
  $('#latestGrid').innerHTML = [...addons].sort((a,b) => new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,3).map(card).join('');
  $('#totalAddons').textContent = addons.length;
  $('#totalDownloads').textContent = addons.reduce((sum,a)=>sum+Number(a.downloads||0),0).toLocaleString('id-ID');
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

    ${videoMarkup(a.video_url, a.name)}
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
      ↓ ${a.category === 'Skin' ? 'Download Skin PNG' : 'Download Addon'}
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

  $('#detailModal').dataset.addonId = id;
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
    const curseforgeMatch = String(a.file_path || '').match(/^curseforge:\/\/(\d+)\/(\d+)$/);
    if (curseforgeMatch) {
      toast('Menghubungkan ke server download resmi...');
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Sesi login berakhir. Silakan login kembali.');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/curseforge-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          modId: Number(curseforgeMatch[1]),
          fileId: Number(curseforgeMatch[2])
        })
      });

      if (!response.ok) {
        let message = `Server download gagal (${response.status}).`;
        try {
          const errorData = await response.json();
          if (errorData?.error) message = errorData.error;
        } catch (_) {}
        throw new Error(message);
      }

      const fileBlob = await response.blob();
      if (!fileBlob.size) throw new Error('File yang diterima kosong.');
      const blobUrl = URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

      const { error: countError } = await db
        .from('addon_download_events')
        .insert({ addon_id: a.id, user_id: currentUser.id });
      if (countError && countError.code !== '23505') {
        console.error('Download count error:', countError);
      }
      toast('File asli berhasil disiapkan untuk diunduh.');
      await loadAddons();
      return;
    }

    if (/^https?:\/\//i.test(a.file_path)) {
      let directFile = false;
      try {
        const fileUrl = new URL(a.file_path);
        directFile = /\.(mcaddon|mcpack|mcworld|zip)$/i.test(fileUrl.pathname);
      } catch (_) {}

      if (!directFile) {
        toast('Link file asli belum tersedia. Owner harus memasukkan link file .mcaddon, .mcpack, .mcworld, atau .zip.');
        return;
      }

      const link = document.createElement('a');
      link.href = a.file_path;
      link.download = fileName;
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();

      const { error: countError } = await db
        .from('addon_download_events')
        .insert({ addon_id: a.id, user_id: currentUser.id });
      if (countError && countError.code !== '23505') {
        console.error('Download count error:', countError);
      }
      toast('Mengunduh file asli...');
      await loadAddons();
      return;
    }

    toast('Menyiapkan download...');
    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(a.file_path, 300, { download: fileName });

    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Link download tidak tersedia.');

    const response = await fetch(data.signedUrl, { method: 'HEAD' });
    if (!response.ok) throw new Error('File gagal diakses dari server.');

    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

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
        <label>Link video preview (YouTube atau MP4, opsional)</label>
        <input name="video_url" type="url" value="${esc(a.video_url || '')}" placeholder="https://youtu.be/...">

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
      description: form.get('description').trim(),
      video_url: form.get('video_url').trim() || null
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
$('#sortBy')?.addEventListener('change', render);
$('#versionFilter')?.addEventListener('change', render);
$('#clearFilters')?.addEventListener('click', () => {
  $('#search').value = '';
  $('#sortBy').value = 'newest';
  $('#versionFilter').value = 'all';
  activeCategory = 'All';
  document.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b.dataset.cat === 'All'));
  render();
});

document.querySelectorAll('.filter').forEach(b => {
  b.onclick = () => {
    activeCategory = b.dataset.cat;
    document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === b));
    render();
  };
});

document.querySelectorAll('[data-quick-cat]').forEach(link => {
  link.addEventListener('click', () => {
    activeCategory = link.dataset.quickCat;
    document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x.dataset.cat === activeCategory));
    render();
  });
});

$('#adminOpen').onclick = showAdmin;
$('#heroAdmin').onclick = showAdmin;

function setDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  $('#sideDrawer')?.setAttribute('aria-hidden', String(!open));
  $('#drawerBackdrop')?.setAttribute('aria-hidden', String(!open));
  $('#menuBtn')?.setAttribute('aria-expanded', String(open));
}
$('#menuBtn').onclick = () => setDrawer(!document.body.classList.contains('drawer-open'));
$('#drawerClose')?.addEventListener('click', () => setDrawer(false));
$('#drawerBackdrop')?.addEventListener('click', () => setDrawer(false));
$('#sideDrawer')?.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => setDrawer(false)));
$('#drawerLogin')?.addEventListener('click', () => { setDrawer(false); openLoginModal('login'); });
$('#drawerOwnerPanel')?.addEventListener('click', () => {
  setDrawer(false);
  if (!isOwner()) return;
  $('#adminModal').classList.remove('hidden');
  renderAdmin();
});
$('#drawerYear') && ($('#drawerYear').textContent = new Date().getFullYear());
document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });

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
  const profileButton = target.closest('.profile-open');
  if (profileButton) {
    openPublicProfile(profileButton.dataset.profileId, profileButton.dataset.profileName, profileButton.dataset.profileAvatar);
    return;
  }

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
        : close === 'profile'
          ? 'profileModal'
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

// Form upload menyesuaikan format konten.
function updateUploadType() {
  const skin = $('#addonForm [name="category"]')?.value === 'Skin';
  const file = $('#uploadFile');
  const label = $('#uploadFileLabel');
  const model = $('#skinModelWrap');
  const hint = $('#uploadHint');
  if (!file || !label) return;
  file.accept = skin ? '.png' : '.mcaddon,.mcpack,.zip,.mcworld,.mctemplate';
  label.firstChild.textContent = skin ? 'File skin Minecraft (.png)' : 'File addon (.mcaddon / .mcpack / .zip)';
  if (model) model.classList.toggle('hidden', !skin);
  if (hint) hint.textContent = skin
    ? 'Skin PNG akan ditampilkan sebagai preview dan bisa diunduh. Pilih model Classic (Steve) atau Slim (Alex).'
    : 'Untuk skin, pilih kategori Skin lalu unggah file PNG skin Minecraft.';
}
$('#addonForm [name="category"]')?.addEventListener('change', updateUploadType);
updateUploadType();

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

  const isSkin = fd.get('category') === 'Skin';
  const allowed = isSkin ? /\.png$/i : /\.(mcaddon|mcpack|mcworld|mctemplate|zip)$/i;

  if (!allowed.test(file.name)) {
    toast(isSkin ? 'File skin harus berformat PNG.' : 'Format file addon tidak didukung.');
    return;
  }
  if (isSkin && file.size > 2 * 1024 * 1024) {
    toast('Ukuran file skin maksimal 2 MB.');
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

    if (isSkin && !imagePath) imagePath = filePath;
    const savedVersion = isSkin
      ? `Bedrock 1.21+ • Model: ${$('#skinModel')?.value || 'Classic (Steve)'}`
      : fd.get('version');
    const { error } = await db.from('addons').insert({
      name: fd.get('name'),
      category: fd.get('category'),
      version: savedVersion,
      description: fd.get('description'),
      video_url: fd.get('video_url')?.trim() || null,
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
  currentProfile = null;
  updateOwnerControls();
  updateAccountUI();
  if (currentUser) {
    ensureCurrentProfile(currentUser).then(() => { updateAccountUI(); });
  }

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
  if (localStorage.getItem('pradacraft_owner_oauth_login') === '1') {
    localStorage.removeItem('pradacraft_owner_oauth_login');

    if (isOwner()) {
      $('#adminModal').classList.remove('hidden');
      await renderAdmin();
      toast('Berhasil masuk sebagai Owner melalui GitHub.');
    } else if (currentUser) {
      await db.auth.signOut();
      currentUser = null;
      updateAccountUI();
      updateOwnerControls();
      toast('Akun ini belum terhubung ke akun Owner PradaCraft.');
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

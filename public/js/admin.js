let allProfiles = [];
let activeNFCUrl = '';
let adminToken = sessionStorage.getItem('nfs_admin_token') || localStorage.getItem('nfs_admin_token') || '';

// Load profiles & Register PWA Service Worker on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('domain-prefix').innerText = `${window.location.origin}/p/`;
    
    // Check existing auth
    if (adminToken) {
        showAdminContent();
    } else {
        showLoginModal();
    }

    // Service Worker Registration for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('Service Worker error:', err));
    }
});

/* ======================================================
   🔑 Admin Giriş & Yetkilendirme İşlemleri
   ====================================================== */
function showLoginModal() {
    document.getElementById('login-modal').classList.remove('hidden');
    document.getElementById('admin-content').classList.add('hidden');
}

function showAdminContent() {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('admin-content').classList.remove('hidden');
    loadAdminProfiles();
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const passInput = document.getElementById('admin-password-input');
    const errorMsg = document.getElementById('login-error-msg');
    const password = passInput.value.trim();

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            adminToken = data.token;
            sessionStorage.setItem('nfs_admin_token', adminToken);
            localStorage.setItem('nfs_admin_token', adminToken);
            errorMsg.classList.add('hidden');
            showToast('Giriş Başarılı! Hoş geldiniz.', 'success');
            showAdminContent();
        } else {
            errorMsg.innerText = data.error || 'Hatalı Şifre!';
            errorMsg.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Login error:", err);
        errorMsg.innerText = 'Sunucu bağlantı hatası!';
        errorMsg.classList.remove('hidden');
    }
}

function logoutAdmin() {
    adminToken = '';
    sessionStorage.removeItem('nfs_admin_token');
    localStorage.removeItem('nfs_admin_token');
    showToast('Oturum kapatıldı', 'success');
    showLoginModal();
}

// Global fetch helper with Admin Authorization header
async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['x-admin-password'] = adminToken;
    return fetch(url, options);
}

/* ======================================================
   Kart Profilleri Yükleme ve Arayüz İşlemleri
   ====================================================== */
async function loadAdminProfiles() {
    try {
        const response = await fetch('/api/profiles');
        allProfiles = await response.json();
        renderProfilesGrid(allProfiles);
        document.getElementById('stat-total-cards').innerText = allProfiles.length;
    } catch (err) {
        console.error("Profiller yüklenemedi:", err);
        showToast("Profiller yüklenirken hata oluştu!", "error");
    }
}

function renderProfilesGrid(profiles) {
    const grid = document.getElementById('profiles-grid');
    grid.innerHTML = '';

    if (profiles.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-16 glass-card rounded-3xl border border-slate-800">
                <i class="fa-solid fa-folder-open text-4xl text-slate-600 mb-3"></i>
                <h3 class="text-lg font-bold text-slate-300">Henüz Kart Profili Yok</h3>
                <p class="text-sm text-slate-500 mt-1">İlk NFC kart profilini oluşturmak için yukarıdaki "⚡ 1 Dakikada Hızlı Kart" butonuna tıkla.</p>
            </div>
        `;
        return;
    }

    profiles.forEach(p => {
        const profileUrl = `${window.location.origin}/p/${p.id}`;
        const card = document.createElement('div');
        card.className = "glass-card rounded-3xl border border-slate-800 p-6 flex flex-col justify-between hover:border-indigo-500/30 transition duration-300";
        card.innerHTML = `
            <div>
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        <img src="${p.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80'}" class="w-12 h-12 rounded-2xl object-cover bg-slate-800 border border-slate-700">
                        <div>
                            <h3 class="font-bold text-lg text-white leading-tight">${p.name}</h3>
                            <p class="text-xs text-indigo-400 font-semibold">${p.title || 'Profil'}</p>
                        </div>
                    </div>
                    <span class="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full border border-slate-700 font-mono">
                        <i class="fa-solid fa-eye text-indigo-400 mr-1"></i>${p.views || 0}
                    </span>
                </div>

                <div class="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 font-mono text-xs text-slate-400 mb-4 flex items-center justify-between">
                    <span class="truncate text-emerald-400 mr-2">${profileUrl}</span>
                    <button onclick="copyToClipboard('${profileUrl}', 'NFC Linki kopyalandı!')" title="Kopyala" class="text-slate-400 hover:text-white shrink-0">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>

                <div class="flex items-center space-x-2 text-xs text-slate-400 mb-4">
                    <span><i class="fa-solid fa-link text-indigo-400 mr-1"></i>${p.links ? p.links.length : 0} Bağlantı</span>
                    <span>•</span>
                    <span><i class="fa-solid fa-building-columns text-emerald-400 mr-1"></i>${p.ibans ? p.ibans.length : 0} IBAN</span>
                </div>
            </div>

            <div class="pt-4 border-t border-slate-800/80 grid grid-cols-4 gap-2">
                <button onclick="openNFCModal('${p.id}')" class="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white py-2 rounded-xl text-xs font-semibold transition flex flex-col items-center justify-center space-y-1" title="NFC Karta Yaz">
                    <i class="fa-solid fa-wifi transform rotate-90"></i>
                    <span>NFC Yaz</span>
                </button>
                <a href="/p/${p.id}" target="_blank" class="glass-card hover:bg-slate-800 text-slate-300 py-2 rounded-xl text-xs font-semibold transition flex flex-col items-center justify-center space-y-1 border border-slate-800" title="Önizle">
                    <i class="fa-solid fa-external-link text-sky-400"></i>
                    <span>Önizle</span>
                </a>
                <button onclick="editProfile('${p.id}')" class="glass-card hover:bg-slate-800 text-slate-300 py-2 rounded-xl text-xs font-semibold transition flex flex-col items-center justify-center space-y-1 border border-slate-800" title="Düzenle">
                    <i class="fa-solid fa-pen text-amber-400"></i>
                    <span>Düzenle</span>
                </button>
                <button onclick="deleteProfile('${p.id}')" class="glass-card hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 py-2 rounded-xl text-xs font-semibold transition flex flex-col items-center justify-center space-y-1 border border-slate-800" title="Sil">
                    <i class="fa-solid fa-trash text-rose-400"></i>
                    <span>Sil</span>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

/* ⚡ Hızlı Müşteri Oluşturma Sihirbazı */
function openFastWizard() {
    document.getElementById('fast-wizard-form').reset();
    document.getElementById('fast-wizard-modal').classList.remove('hidden');
}

function closeFastWizard() {
    document.getElementById('fast-wizard-modal').classList.add('hidden');
}

async function handleFastWizardSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('fast-name').value.trim();
    const title = document.getElementById('fast-title').value.trim();
    const company = document.getElementById('fast-company').value.trim();
    const phone = document.getElementById('fast-phone').value.trim();
    const instagram = document.getElementById('fast-instagram').value.trim().replace(/^@/, '');
    const googleMap = document.getElementById('fast-google').value.trim();
    const iban = document.getElementById('fast-iban').value.trim();

    if (!name) {
        showToast('Lütfen müşteri adını girin!', 'error');
        return;
    }

    const links = [];
    if (instagram) {
        links.push({ title: 'Instagram Hesabım', url: `https://instagram.com/${instagram}`, icon: 'instagram' });
    }
    if (googleMap) {
        links.push({ title: 'Google Harita & Yorum Yap', url: googleMap.startsWith('http') ? googleMap : `https://${googleMap}`, icon: 'google' });
    }
    if (phone) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        links.push({ title: 'WhatsApp ile Yaz', url: `https://wa.me/${cleanPhone}`, icon: 'whatsapp' });
    }

    const ibans = [];
    if (iban) {
        ibans.push({ bank: 'Banka Hesabı', name: name, iban: iban });
    }

    const payload = {
        name,
        title: title || 'Firma Sahibi',
        company: company || '',
        phone,
        email: '',
        location: '',
        bio: `${name} dijital kartviziti.`,
        links,
        ibans
    };

    try {
        const res = await authFetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            showToast(err.error || 'Oluşturulamadı', 'error');
            if (res.status === 401) logoutAdmin();
            return;
        }

        const newProfile = await res.json();
        showToast(`⚡ ${newProfile.name} için profil oluşturuldu!`, 'success');
        closeFastWizard();
        await loadAdminProfiles();
        openNFCModal(newProfile.id);

    } catch (err) {
        console.error("Fast wizard error:", err);
        showToast("Sunucu hatası!", "error");
    }
}

/* Detaylı Profil Ekle / Düzenle */
function openNewProfileModal() {
    document.getElementById('modal-title').innerText = 'Yeni Kart Profili Oluştur';
    document.getElementById('profile-form').reset();
    document.getElementById('form-edit-id').value = '';
    document.getElementById('form-id').disabled = false;
    document.getElementById('form-links-container').innerHTML = '';
    document.getElementById('form-ibans-container').innerHTML = '';
    
    addLinkRow('Instagram', 'https://instagram.com/', 'instagram');
    addLinkRow('Google Yorum Yap', 'https://maps.google.com', 'google');
    
    document.getElementById('profile-modal').classList.remove('hidden');
}

function editProfile(id) {
    const p = allProfiles.find(item => item.id === id);
    if (!p) return;

    document.getElementById('modal-title').innerText = 'Kart Profilini Düzenle';
    document.getElementById('form-edit-id').value = p.id;
    document.getElementById('form-id').value = p.id;
    document.getElementById('form-id').disabled = true;
    document.getElementById('form-name').value = p.name || '';
    document.getElementById('form-title').value = p.title || '';
    document.getElementById('form-company').value = p.company || '';
    document.getElementById('form-location').value = p.location || '';
    document.getElementById('form-phone').value = p.phone || '';
    document.getElementById('form-email').value = p.email || '';
    document.getElementById('form-avatar').value = p.avatar || '';
    document.getElementById('form-banner').value = p.banner || '';
    document.getElementById('form-bio').value = p.bio || '';

    const linksContainer = document.getElementById('form-links-container');
    linksContainer.innerHTML = '';
    if (p.links && p.links.length > 0) {
        p.links.forEach(l => addLinkRow(l.title, l.url, l.icon));
    }

    const ibansContainer = document.getElementById('form-ibans-container');
    ibansContainer.innerHTML = '';
    if (p.ibans && p.ibans.length > 0) {
        p.ibans.forEach(i => addIbanRow(i.bank, i.name, i.iban));
    }

    document.getElementById('profile-modal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
}

function addLinkRow(title = '', url = '', icon = 'globe') {
    const container = document.getElementById('form-links-container');
    const row = document.createElement('div');
    row.className = "flex items-center space-x-2 link-row bg-slate-950 p-2.5 rounded-xl border border-slate-800";
    row.innerHTML = `
        <select class="link-icon bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-2 py-2 focus:outline-none">
            <option value="instagram" ${icon === 'instagram' ? 'selected' : ''}>📷 Instagram</option>
            <option value="google" ${icon === 'google' ? 'selected' : ''}>⭐ Google Yorum</option>
            <option value="whatsapp" ${icon === 'whatsapp' ? 'selected' : ''}>💬 WhatsApp</option>
            <option value="linkedin" ${icon === 'linkedin' ? 'selected' : ''}>💼 LinkedIn</option>
            <option value="facebook" ${icon === 'facebook' ? 'selected' : ''}>📘 Facebook</option>
            <option value="youtube" ${icon === 'youtube' ? 'selected' : ''}>▶️ YouTube</option>
            <option value="twitter" ${icon === 'twitter' ? 'selected' : ''}>❌ Twitter/X</option>
            <option value="tiktok" ${icon === 'tiktok' ? 'selected' : ''}>🎵 TikTok</option>
            <option value="globe" ${icon === 'globe' ? 'selected' : ''}>🌐 Web Sitesi</option>
            <option value="map" ${icon === 'map' ? 'selected' : ''}>📍 Harita</option>
        </select>
        <input type="text" placeholder="Başlık (Örn: Instagram)" value="${title}" class="link-title bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 w-1/3 focus:outline-none">
        <input type="text" placeholder="URL (https://...)" value="${url}" class="link-url bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 w-full focus:outline-none">
        <button type="button" onclick="this.parentElement.remove()" class="text-slate-500 hover:text-rose-400 px-2 py-1">
            <i class="fa-solid fa-trash text-xs"></i>
        </button>
    `;
    container.appendChild(row);
}

function addIbanRow(bank = '', name = '', iban = '') {
    const container = document.getElementById('form-ibans-container');
    const row = document.createElement('div');
    row.className = "grid grid-cols-1 sm:grid-cols-3 gap-2 iban-row bg-slate-950 p-2.5 rounded-xl border border-slate-800 relative group";
    row.innerHTML = `
        <input type="text" placeholder="Banka Adı" value="${bank}" class="iban-bank bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 focus:outline-none">
        <input type="text" placeholder="Hesap Sahibi" value="${name}" class="iban-name bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 focus:outline-none">
        <div class="flex items-center space-x-1">
            <input type="text" placeholder="TR00 0000..." value="${iban}" class="iban-number bg-slate-900 border border-slate-800 text-xs text-white font-mono rounded-lg px-3 py-2 w-full focus:outline-none">
            <button type="button" onclick="this.closest('.iban-row').remove()" class="text-slate-500 hover:text-rose-400 px-2 py-1">
                <i class="fa-solid fa-trash text-xs"></i>
            </button>
        </div>
    `;
    container.appendChild(row);
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('form-edit-id').value;

    const linkRows = document.querySelectorAll('.link-row');
    const links = [];
    linkRows.forEach(row => {
        const title = row.querySelector('.link-title').value.trim();
        const url = row.querySelector('.link-url').value.trim();
        const icon = row.querySelector('.link-icon').value;
        if (title && url) {
            links.push({ title, url, icon });
        }
    });

    const ibanRows = document.querySelectorAll('.iban-row');
    const ibans = [];
    ibanRows.forEach(row => {
        const bank = row.querySelector('.iban-bank').value.trim();
        const name = row.querySelector('.iban-name').value.trim();
        const iban = row.querySelector('.iban-number').value.trim();
        if (iban) {
            ibans.push({ bank, name, iban });
        }
    });

    const payload = {
        id: document.getElementById('form-id').value.trim(),
        name: document.getElementById('form-name').value.trim(),
        title: document.getElementById('form-title').value.trim(),
        company: document.getElementById('form-company').value.trim(),
        location: document.getElementById('form-location').value.trim(),
        phone: document.getElementById('form-phone').value.trim(),
        email: document.getElementById('form-email').value.trim(),
        avatar: document.getElementById('form-avatar').value.trim(),
        banner: document.getElementById('form-banner').value.trim(),
        bio: document.getElementById('form-bio').value.trim(),
        links,
        ibans
    };

    try {
        let res;
        if (editId) {
            res = await authFetch(`/api/profiles/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await authFetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const err = await res.json();
            showToast(err.error || 'Kaydedilemedi', 'error');
            if (res.status === 401) logoutAdmin();
            return;
        }

        showToast(editId ? 'Profil güncellendi!' : 'Yeni profil oluşturuldu!', 'success');
        closeProfileModal();
        loadAdminProfiles();
    } catch (err) {
        console.error("Form submit error:", err);
        showToast("Sunucu hatası!", "error");
    }
}

async function deleteProfile(id) {
    if (!confirm(`"${id}" kullanıcısını silmek istediğinize emin misiniz?`)) return;

    try {
        const res = await authFetch(`/api/profiles/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Profil silindi', 'success');
            loadAdminProfiles();
        } else {
            if (res.status === 401) logoutAdmin();
            else showToast('Silinirken hata oluştu', 'error');
        }
    } catch (err) {
        console.error(err);
    }
}

function openNFCModal(id) {
    const p = allProfiles.find(item => item.id === id);
    if (!p) return;

    activeNFCUrl = `${window.location.origin}/p/${p.id}`;
    document.getElementById('nfc-modal-name').innerText = `${p.name} (${p.id})`;
    document.getElementById('nfc-modal-url').innerText = activeNFCUrl;
    document.getElementById('nfc-preview-link').href = `/p/${p.id}`;

    const qrContainer = document.getElementById('admin-qrcode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: activeNFCUrl,
        width: 160,
        height: 160,
        colorDark : "#0f172a",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    const webNfcBtn = document.getElementById('btn-webnfc');
    if ('NDEFReader' in window) {
        webNfcBtn.classList.remove('hidden');
    } else {
        webNfcBtn.classList.add('hidden');
    }

    document.getElementById('nfc-modal').classList.remove('hidden');
}

async function writeNFCWithPhone() {
    if (!('NDEFReader' in window)) {
        showToast('Bu tarayıcı Web NFC desteklemiyor. NFC Tools uygulamasını kullanın.', 'error');
        return;
    }

    try {
        showToast('Kart bekleniyor... Kartı telefonun arkasına dokundurun!', 'success');
        const ndef = new NDEFReader();
        await ndef.write({
            records: [{ recordType: "url", data: activeNFCUrl }]
        });
        showToast('🎉 BAŞARILI! Link NFC karta yazıldı!', 'success');
    } catch (error) {
        console.error("NFC yazma hatası:", error);
        showToast(`NFC Yazma Hatası: ${error.message || error}`, 'error');
    }
}

function closeNFCModal() {
    document.getElementById('nfc-modal').classList.add('hidden');
}

function copyNFCUrl() {
    if (!activeNFCUrl) return;
    copyToClipboard(activeNFCUrl, 'NFC Yazma Bağlantısı kopyalandı! NFC Tools uygulamasını açıp yapıştırın.');
}

function copyToClipboard(text, msg) {
    navigator.clipboard.writeText(text);
    showToast(msg || 'Kopyalandı!', 'success');
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    
    if (type === 'error') {
        icon.className = 'fa-solid fa-circle-xmark text-rose-500 text-lg';
    } else {
        icon.className = 'fa-solid fa-check-circle text-emerald-400 text-lg';
    }

    document.getElementById('toast-message').innerText = msg;
    toast.classList.remove('translate-x-96', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-96', 'opacity-0');
    }, 3000);
}

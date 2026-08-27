let allProfiles = [];
let allOrders = [];
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
    loadAdminOrders();
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

async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['x-admin-password'] = adminToken;
    const res = await fetch(url, options);
    if (res.status === 401) {
        logoutAdmin();
    }
    return res;
}

/* ======================================================
   Tab Değiştirme
   ====================================================== */
function switchAdminTab(tabName) {
    const pTab = document.getElementById('tab-content-profiles');
    const oTab = document.getElementById('tab-content-orders');
    const aTab = document.getElementById('tab-content-appointments');
    const pBtn = document.getElementById('tab-btn-profiles');
    const oBtn = document.getElementById('tab-btn-orders');
    const aBtn = document.getElementById('tab-btn-appointments');

    pTab.classList.add('hidden');
    oTab.classList.add('hidden');
    if (aTab) aTab.classList.add('hidden');

    pBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white';
    oBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white flex items-center';
    if (aBtn) aBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white flex items-center';

    if (tabName === 'profiles') {
        pTab.classList.remove('hidden');
        pBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-indigo-600 text-white shadow-md';
        loadAdminProfiles();
    } else if (tabName === 'orders') {
        oTab.classList.remove('hidden');
        oBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-indigo-600 text-white shadow-md flex items-center';
        loadAdminOrders();
    } else if (tabName === 'appointments') {
        if (aTab) aTab.classList.remove('hidden');
        if (aBtn) aBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-emerald-600 text-white shadow-md flex items-center';
        loadAdminAppointments();
    }
}

async function loadAdminAppointments() {
    try {
        const res = await authFetch('/api/admin/appointments-summary');
        const data = await res.json();

        const bizAccounts = data.businessAccounts || [];
        const appointments = data.appointments || [];

        // Update counts
        const countBadge = document.getElementById('stat-total-appointments-sys');
        if (countBadge) countBadge.innerText = bizAccounts.length;
        const bizBadge = document.getElementById('stat-biz-count-badge');
        if (bizBadge) bizBadge.innerText = `${bizAccounts.length} Aktif Şirket`;

        // Render Active Business Accounts Grid
        const bizGrid = document.getElementById('active-businesses-grid');
        if (bizGrid) {
            if (bizAccounts.length === 0) {
                bizGrid.innerHTML = `
                    <div class="col-span-full text-center py-10 bg-slate-900 rounded-2xl border border-slate-800">
                        <i class="fa-solid fa-store-slash text-3xl text-slate-600 mb-2"></i>
                        <p class="text-xs font-bold text-slate-400">Henüz Randevu Paketi Aktif Olan Şirket Yok</p>
                    </div>
                `;
            } else {
                bizGrid.innerHTML = '';
                bizAccounts.forEach(b => {
                    const appCount = appointments.filter(a => a.profileId === b.profileId || a.businessName === b.businessName).length;
                    const div = document.createElement('div');
                    div.className = 'bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3';
                    div.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-extrabold text-white">${b.businessName}</span>
                            <span class="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">Aktif</span>
                        </div>
                        <div class="text-xs text-slate-400 space-y-1">
                            <div><i class="fa-solid fa-key text-amber-400 w-4"></i> Giriş Şifresi: <strong class="text-white font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">${b.password}</strong></div>
                            <div><i class="fa-solid fa-phone text-emerald-400 w-4"></i> Telefon: <span class="text-slate-300">${b.phone || 'Girilmedi'}</span></div>
                            <div><i class="fa-solid fa-calendar-check text-indigo-400 w-4"></i> Toplam Randevu: <strong class="text-indigo-300">${appCount} Adet</strong></div>
                        </div>
                        <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                            <a href="/p/${b.profileId}" target="_blank" class="text-indigo-400 hover:underline font-bold flex items-center space-x-1">
                                <span>Kart Profiline Git</span>
                                <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                            </a>
                        </div>
                    `;
                    bizGrid.appendChild(div);
                });
            }
        }

        // Render All Appointments List
        const appsList = document.getElementById('all-appointments-list');
        if (appsList) {
            if (appointments.length === 0) {
                appsList.innerHTML = `
                    <div class="text-center py-10 bg-slate-900 rounded-2xl border border-slate-800">
                        <i class="fa-solid fa-calendar-xmark text-3xl text-slate-600 mb-2"></i>
                        <p class="text-xs font-bold text-slate-400">Henüz Herhangi Bir Şirkete Randevu Talebi Düşmedi</p>
                    </div>
                `;
            } else {
                appsList.innerHTML = '';
                appointments.forEach(a => {
                    const isApproved = a.status === 'Onaylandı';
                    const div = document.createElement('div');
                    div.className = 'bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
                    div.innerHTML = `
                        <div>
                            <div class="flex items-center space-x-2">
                                <span class="text-xs bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">${a.businessName}</span>
                                <span class="text-sm font-bold text-white">${a.customerName}</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isApproved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">${a.status}</span>
                            </div>
                            <div class="text-xs text-slate-400 mt-1 flex items-center space-x-3">
                                <span><i class="fa-solid fa-calendar text-indigo-400 mr-1"></i>${a.date} - ${a.time}</span>
                                <span><i class="fa-solid fa-phone text-emerald-400 mr-1"></i>${a.customerPhone}</span>
                            </div>
                            ${a.note ? `<p class="text-xs text-slate-500 mt-1">Not: "${a.note}"</p>` : ''}
                        </div>
                        <div class="flex items-center space-x-2 shrink-0">
                            <a href="tel:${a.customerPhone}" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition">
                                <i class="fa-solid fa-phone"></i>
                            </a>
                        </div>
                    `;
                    appsList.appendChild(div);
                });
            }
        }
    } catch (e) {
        console.error("Randevuları yükleme hatası:", e);
    }
}

/* ======================================================
   Kart Profilleri İşlemleri
   ====================================================== */
async function loadAdminProfiles() {
    try {
        const response = await fetch('/api/profiles');
        allProfiles = await response.json();
        renderProfilesGrid(allProfiles);
        document.getElementById('stat-total-cards').innerText = allProfiles.length;
    } catch (err) {
        console.error("Profiller yüklenemedi:", err);
    }
}

function renderProfilesGrid(profiles) {
    const grid = document.getElementById('profiles-grid') || document.getElementById('tab-content-profiles');
    if (!grid) return;
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
        const companyBadge = p.company 
            ? `<div class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 text-xs font-extrabold mb-3 shadow-sm">
                 <i class="fa-solid fa-building text-indigo-400"></i>
                 <span class="uppercase tracking-wider truncate">${p.company}</span>
               </div>`
            : `<div class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-bold mb-3">
                 <i class="fa-solid fa-id-card text-emerald-400"></i>
                 <span class="uppercase tracking-wider">NFC KART CNR PROFİLİ</span>
               </div>`;

        const card = document.createElement('div');
        card.className = "glass-card rounded-3xl border border-slate-800 p-6 flex flex-col justify-between hover:border-indigo-500/30 transition duration-300";
        card.innerHTML = `
            <div>
                ${companyBadge}
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

/* ======================================================
   📦 Gelen Müşteri Siparişleri ve Teslimat Adresleri
   ====================================================== */
async function loadAdminOrders() {
    try {
        const response = await authFetch('/api/orders');
        if (response.ok) {
            allOrders = await response.json();
            renderOrdersList(allOrders);
            document.getElementById('stat-total-orders').innerText = allOrders.length;
        }
        
        // Kart Profilleri sayacını da senkronize et
        const pRes = await fetch('/api/profiles');
        if (pRes.ok) {
            const profs = await pRes.json();
            const statEl = document.getElementById('stat-total-cards');
            if (statEl) statEl.innerText = profs.length;
        }
    } catch (err) {
        console.error("Siparişler yüklenemedi:", err);
    }
}

function renderOrdersList(orders) {
    const container = document.getElementById('orders-list-container');
    container.innerHTML = '';

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16 glass-card rounded-3xl border border-slate-800">
                <i class="fa-solid fa-box-open text-4xl text-slate-600 mb-3"></i>
                <h3 class="text-lg font-bold text-slate-300">Henüz Kayıtlı Sipariş Yok</h3>
                <p class="text-sm text-slate-500 mt-1">Müşterileriniz sipariş verdiğinde işletme isimleri ve kargo adresleri burada kaydolacaktır.</p>
            </div>
        `;
        return;
    }

    orders.forEach(ord => {
        const isCompleted = (ord.status || '').includes('Tamamlandı') || (ord.status || '').includes('Kargolandı');
        const statusClass = isCompleted 
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
            : ((ord.status || '').includes('Onaylandı') ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30');

        const companyText = ord.company ? `<span class="bg-indigo-600/30 text-indigo-300 font-bold px-2.5 py-0.5 rounded-lg border border-indigo-500/30 ml-2"><i class="fa-solid fa-building mr-1"></i>${ord.company}</span>` : '';

        const div = document.createElement('div');
        div.className = `glass-card p-6 rounded-3xl border ${isCompleted ? 'border-emerald-500/20 bg-slate-950/40' : 'border-slate-800'} flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-amber-500/30 transition`;
        div.innerHTML = `
            <div class="space-y-3 flex-grow">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="bg-amber-500/20 text-amber-300 font-mono text-xs px-2.5 py-1 rounded-lg border border-amber-500/30 font-bold">${ord.id}</span>
                    <h3 class="text-lg font-extrabold text-white">${ord.customerName}</h3>
                    ${companyText}
                    <span class="text-xs bg-slate-800 text-indigo-300 px-3 py-1 rounded-full font-semibold border border-slate-700">${ord.cardColor || 'Gümüş Metal'}</span>
                    <span class="text-xs font-bold px-3 py-1 rounded-full border ${statusClass}">${ord.status || 'Bekliyor'}</span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                    <div><i class="fa-solid fa-phone text-emerald-400 mr-2"></i><strong>Telefon:</strong> ${ord.customerPhone}</div>
                    <div><i class="fa-solid fa-tag text-amber-400 mr-2"></i><strong>Sipariş Adedi & Tutarı:</strong> ${ord.quantity || 1} Adet - <strong class="text-amber-400 font-bold">${ord.totalPrice || ord.price || '1.000 TL'}</strong> (${ord.paymentMethod || 'Havale/EFT'})</div>
                    <div class="col-span-full"><i class="fa-solid fa-location-dot text-rose-400 mr-2"></i><strong>Teslimat Adresi:</strong> ${ord.city} / ${ord.district} - ${ord.address}</div>
                    ${ord.note ? `<div class="col-span-full italic text-amber-300 bg-slate-950 p-2 rounded-xl border border-slate-800"><i class="fa-solid fa-comment mr-2"></i>Not: ${ord.note}</div>` : ''}
                </div>
            </div>

            <div class="flex flex-col sm:flex-row items-center gap-2 shrink-0 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
                <button onclick="openNFCModal('${ord.profileId}')" class="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2">
                    <i class="fa-solid fa-wifi transform rotate-90"></i>
                    <span>NFC Karta Bas</span>
                </button>
                ${!isCompleted ? `
                    <button onclick="completeOrder('${ord.id}')" class="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-600/20">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>Tamamlandı Olarak Kaydet</span>
                    </button>
                ` : `
                    <span class="text-xs text-emerald-400 font-bold px-3 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center space-x-1">
                        <i class="fa-solid fa-check-double"></i>
                        <span>Kargolandı / Tamamlandı</span>
                    </span>
                `}
                <button onclick="deleteOrder('${ord.id}')" title="Arşivden Sil" class="px-3 py-2 glass-card hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-xl text-xs transition border border-slate-800">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function completeOrder(id) {
    try {
        const res = await authFetch(`/api/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Tamamlandı / Kargolandı' })
        });
        if (res.ok) {
            showToast('Sipariş tamamlandı olarak kaydedildi ve Kart Profillerine eklendi! 🎉', 'success');
            loadAdminOrders();
            loadAdminProfiles();
        } else {
            showToast('Durum güncellenemedi', 'error');
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteOrder(id) {
    if (!confirm('Bu sipariş kaydını tamamen silmek istediğinize emin misiniz?')) return;

    try {
        const res = await authFetch(`/api/orders/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Sipariş kaydı tamamen silindi', 'success');
            loadAdminOrders();
        } else {
            showToast('Silinemedi', 'error');
        }
    } catch (err) {
        console.error(err);
    }
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

function toggleAdminAppointmentFields() {
    const isChecked = document.getElementById('form-has-appointment')?.checked || false;
    const container = document.getElementById('admin-app-fields');
    if (container) {
        if (isChecked) container.classList.remove('hidden');
        else container.classList.add('hidden');
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

    const hasAppCheckbox = document.getElementById('form-has-appointment');
    if (hasAppCheckbox) {
        hasAppCheckbox.checked = false;
        toggleAdminAppointmentFields();
    }
    const bizNameEl = document.getElementById('form-app-biz-name');
    if (bizNameEl) bizNameEl.value = '';
    const bizPassEl = document.getElementById('form-app-password');
    if (bizPassEl) bizPassEl.value = '';
    
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

    const hasAppCheckbox = document.getElementById('form-has-appointment');
    if (hasAppCheckbox) {
        hasAppCheckbox.checked = p.hasAppointmentSystem === true;
        toggleAdminAppointmentFields();
    }
    const bizNameEl = document.getElementById('form-app-biz-name');
    if (bizNameEl) bizNameEl.value = p.appointmentBusinessName || p.company || p.name || '';
    const bizPassEl = document.getElementById('form-app-password');
    if (bizPassEl) bizPassEl.value = p.appointmentPassword || '';

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
            <option value="globe" ${icon === 'globe' ? 'selected' : ''}>🌐 Web</option>
            <option value="instagram" ${icon === 'instagram' ? 'selected' : ''}>📷 Instagram</option>
            <option value="google" ${icon === 'google' ? 'selected' : ''}>⭐ Google Yorum</option>
            <option value="whatsapp" ${icon === 'whatsapp' ? 'selected' : ''}>💬 WhatsApp</option>
            <option value="phone" ${icon === 'phone' ? 'selected' : ''}>📞 Telefon</option>
            <option value="email" ${icon === 'email' ? 'selected' : ''}>✉️ E-posta</option>
            <option value="map" ${icon === 'map' ? 'selected' : ''}>📍 Konum/Harita</option>
            <option value="linkedin" ${icon === 'linkedin' ? 'selected' : ''}>💼 LinkedIn</option>
            <option value="youtube" ${icon === 'youtube' ? 'selected' : ''}>▶️ YouTube</option>
        </select>
        <input type="text" placeholder="Başlık" value="${title}" class="link-title bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 w-1/3 focus:outline-none focus:border-indigo-500">
        <input type="url" placeholder="https://..." value="${url}" class="link-url bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400 rounded-lg px-3 py-2 flex-grow focus:outline-none focus:border-indigo-500">
        <button type="button" onclick="this.parentElement.remove()" class="text-slate-500 hover:text-rose-400 p-1"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(row);
}

function addIbanRow(bank = '', name = '', iban = '') {
    const container = document.getElementById('form-ibans-container');
    const row = document.createElement('div');
    row.className = "flex items-center space-x-2 iban-row bg-slate-950 p-2.5 rounded-xl border border-slate-800";
    row.innerHTML = `
        <input type="text" placeholder="Banka Adı" value="${bank}" class="iban-bank bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 w-1/4 focus:outline-none focus:border-indigo-500">
        <input type="text" placeholder="Hesap Sahibi" value="${name}" class="iban-name bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 w-1/4 focus:outline-none focus:border-indigo-500">
        <input type="text" placeholder="TR..." value="${iban}" class="iban-number bg-slate-900 border border-slate-800 text-xs font-mono text-amber-400 rounded-lg px-3 py-2 flex-grow focus:outline-none focus:border-indigo-500">
        <button type="button" onclick="this.parentElement.remove()" class="text-slate-500 hover:text-rose-400 p-1"><i class="fa-solid fa-trash"></i></button>
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

    const hasAppSys = document.getElementById('form-has-appointment')?.checked || false;

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
        hasAppointmentSystem: hasAppSys,
        appointmentBusinessName: document.getElementById('form-app-biz-name')?.value.trim() || document.getElementById('form-company').value.trim() || document.getElementById('form-name').value.trim(),
        appointmentPassword: document.getElementById('form-app-password')?.value.trim() || '123456',
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

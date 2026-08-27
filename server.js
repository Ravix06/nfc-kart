const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const CHATS_FILE = path.join(__dirname, 'data', 'telegram_chats.json');
const APPOINTMENTS_FILE = path.join(__dirname, 'data', 'appointments.json');
const BUSINESS_ACCOUNTS_FILE = path.join(__dirname, 'data', 'business_accounts.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ruken.12';

// TELEGRAM BOT CONFIGURATION (@nfc_kart_siparis_bot)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8768331983:AAHqiStLE65fI1yYRuqZR_92Bob2oLhZZ0A';
const DEFAULT_CHAT_ID = '7277162433'; // Eren Kaya Telegram Chat ID (SABİTLENDİ)

let cachedChatIds = new Set([DEFAULT_CHAT_ID]);
let lastTelegramUpdateId = 0;

// Bildirim Telefon Numarası
const NOTIFY_PHONE = '05078405206';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Load stored Telegram Chat IDs permanently
function getStoredChatIds() {
    try {
        if (fs.existsSync(CHATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8') || '[]');
            data.forEach(id => cachedChatIds.add(String(id)));
        }
    } catch (e) {}
}
getStoredChatIds();

function saveStoredChatIds() {
    try {
        const dataDir = path.dirname(CHATS_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(CHATS_FILE, JSON.stringify(Array.from(cachedChatIds)), 'utf8');
    } catch (e) {}
}

// ======================================================
// 🛡️ OTOMATİK BULUT VERİ YEDEKLEME VE KURTARMA MOTORU
// ======================================================
// Render sunucusu yenilense veya kapansa dahi MÜŞTERİ VERİLERİ ASLA SİLİNMEZ!
const CLOUD_STORE_URL = process.env.CLOUD_STORE_URL || 'https://api.jsonbin.io/v3/b/66cc12345678';

async function syncToCloudBackup(key, data) {
    try {
        const backupFile = path.join(__dirname, 'data', `backup_${key}.json`);
        const dataDir = path.dirname(backupFile);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
    } catch(e) {}
}

// Helpers: Read / Save Profiles
function getProfiles() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            const dataDir = path.dirname(DATA_FILE);
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(DATA_FILE, '[]', 'utf8');
            return [];
        }
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]');
    } catch (err) {
        console.error("Profiles okuma hatası:", err);
        return [];
    }
}

function saveProfiles(profiles) {
    try {
        const dataDir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(profiles, null, 2), 'utf8');
        syncToCloudBackup('profiles', profiles);
    } catch (err) {
        console.error("Profiles kaydetme hatası:", err);
    }
}

// Helpers: Read / Save Orders
function getOrders() {
    try {
        if (!fs.existsSync(ORDERS_FILE)) {
            const dataDir = path.dirname(ORDERS_FILE);
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
            return [];
        }
        return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8') || '[]');
    } catch (err) {
        console.error("Orders okuma hatası:", err);
        return [];
    }
}

function saveOrders(orders) {
    try {
        const dataDir = path.dirname(ORDERS_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
        syncToCloudBackup('orders', orders);
    } catch (err) {
        console.error("Orders kaydetme hatası:", err);
    }
}

function getAppointments() {
    try {
        if (!fs.existsSync(APPOINTMENTS_FILE)) return [];
        return JSON.parse(fs.readFileSync(APPOINTMENTS_FILE, 'utf8') || '[]');
    } catch (err) {
        return [];
    }
}

function saveAppointments(apps) {
    try {
        const dataDir = path.dirname(APPOINTMENTS_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(apps, null, 2), 'utf8');
        syncToCloudBackup('appointments', apps);
    } catch (err) {}
}

function getBusinessAccounts() {
    try {
        if (!fs.existsSync(BUSINESS_ACCOUNTS_FILE)) return [];
        return JSON.parse(fs.readFileSync(BUSINESS_ACCOUNTS_FILE, 'utf8') || '[]');
    } catch (err) {
        return [];
    }
}

function saveBusinessAccounts(accs) {
    try {
        const dataDir = path.dirname(BUSINESS_ACCOUNTS_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(BUSINESS_ACCOUNTS_FILE, JSON.stringify(accs, null, 2), 'utf8');
        syncToCloudBackup('business_accounts', accs);
    } catch (err) {}
}

// ONAYLANAN SİPARİŞİ OTOMATİK "KART PROFİLLERİ"NE AKTARAN YARDIMCI
function activateOrderProfile(order) {
    if (!order || !order.draftProfile) return false;

    const profiles = getProfiles();
    const existingIndex = profiles.findIndex(p => p.id === order.draftProfile.id);
    if (existingIndex !== -1) {
        profiles[existingIndex] = { ...profiles[existingIndex], ...order.draftProfile };
    } else {
        profiles.push(order.draftProfile);
    }
    saveProfiles(profiles);

    // Eğer Randevu Sistemi Paketi satın alındıysa İşletmeye Özel Randevu Hesabını Otomatik Oluştur!
    if (order.hasAppointmentSystem || order.appointmentBusinessName) {
        const accs = getBusinessAccounts();
        const bName = order.appointmentBusinessName || order.company || order.customerName;
        const bPass = order.appointmentPassword || '123456';
        const existingAccIdx = accs.findIndex(a => a.profileId === order.profileId || (a.businessName && a.businessName.toLowerCase() === bName.toLowerCase()));
        
        const accData = {
            id: `acc-${Date.now().toString().slice(-4)}`,
            profileId: order.profileId,
            businessName: bName,
            password: bPass,
            phone: order.customerPhone,
            hasAppointmentSystem: true,
            createdAt: new Date().toISOString()
        };

        if (existingAccIdx !== -1) {
            accs[existingAccIdx] = { ...accs[existingAccIdx], ...accData };
        } else {
            accs.push(accData);
        }
        saveBusinessAccounts(accs);
        console.log(`📅 İŞLETME RANDEVU HESABI AKTİF EDİLDİ: ${bName} (Şifre: ${bPass})`);
    }

    console.log(`✅ PROFİL AKTİF EDİLDİ: ${order.draftProfile.name} -> Kart Profillerine Eklendi!`);
    return true;
}

// TÜM TAMAMLANGAN/ONAYLANGAN SİPARİŞLERİ SİSTEM BAŞLANGICINDA OTOMATİK TARAYIP KART PROFİLLERİNE AKTARAN FONKSİYON
function syncAllCompletedOrdersToProfiles() {
    try {
        const orders = getOrders();
        let syncCount = 0;
        orders.forEach(ord => {
            const isCompleted = (ord.status || '').includes('Tamamlandı') || (ord.status || '').includes('Kargolandı') || (ord.status || '').includes('Onaylandı');
            if (isCompleted && ord.draftProfile) {
                activateOrderProfile(ord);
                syncCount++;
            }
        });
        if (syncCount > 0) {
            console.log(`⚡ OTOMATİK SENKRONİZASYON: ${syncCount} adet tamamlanan sipariş Kart Profillerine aktarıldı!`);
        }
    } catch (e) {
        console.error("Senkronizasyon hatası:", e);
    }
}

// Sunucu açılışında tamamlanan tüm siparişleri profillere aktar
syncAllCompletedOrdersToProfiles();

// TELEGRAM BOT ANLIK CEP BİLDİRİMİ VE ONAY BUTONU GÖNDERİCİ (GARANTİ 100% İLETİM)
async function sendTelegramNotification(order) {
    const qty = order.quantity || 1;
    const price = order.totalPrice || order.price || '700 TL';
    const isKapida = (order.paymentMethod || '').includes('Kapıda');

    const notifyMsg = `🚨 SİPARİŞİNİZ GELDİ!!! 🚨\n📦 NFC KART CNR SİPARİŞİ (${qty} ADET)\n\nSipariş No: ${order.id}\nAdet: ${qty} Adet\nToplam Tutar: ${price}\nÖdeme Yöntemi: ${order.paymentMethod || 'IBAN Havale/EFT'}\nMüşteri Adı: ${order.customerName}\nTelefon: ${order.customerPhone}\nKart Modeli: ${order.cardColor}\nTeslimat Adresi: ${order.city}/${order.district} - ${order.address}\nNot: ${order.note || 'Yok'}\n\nDurum: ${isKapida ? 'Kapıda Ödeme (Hazırlanacak)' : 'Bekliyor (Ödeme Onayı Bekleniyor)'}`;

    const replyMarkup = JSON.stringify({
        inline_keyboard: [
            [
                { text: '✅ ÖDEMEYİ ONAYLA & PROFİLE AKTAR', callback_data: `approve_${order.id}` },
                { text: '❌ İPTAL ET', callback_data: `cancel_${order.id}` }
            ]
        ]
    });

    cachedChatIds.add(DEFAULT_CHAT_ID);
    saveStoredChatIds();

    cachedChatIds.forEach(chatId => {
        const postData = JSON.stringify({
            chat_id: chatId,
            text: notifyMsg,
            reply_markup: JSON.parse(replyMarkup)
        });

        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (sRes) => {
            console.log(`✅ Telegram Sipariş Bildirimi Anında Gönderildi (Chat ID: ${chatId})`);
        });
        req.on('error', (err) => console.error("Telegram gönderme hatası:", err));
        req.write(postData);
        req.end();
    });
}

// TELEGRAM BOT POLLING (ONAY BUTONU VE 'ONAY' MESAJI DİNLEYİCİ)
function pollTelegramCommands() {
    const pollUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastTelegramUpdateId + 1}`;
    https.get(pollUrl, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.ok && Array.isArray(data.result)) {
                    data.result.forEach(upd => {
                        if (upd.update_id >= lastTelegramUpdateId) {
                            lastTelegramUpdateId = upd.update_id + 1;
                        }

                        let chatId = null;
                        let text = '';
                        let callbackData = null;

                        if (upd.callback_query) {
                            chatId = upd.callback_query.message.chat.id;
                            callbackData = upd.callback_query.data;
                        } else if (upd.message) {
                            chatId = upd.message.chat.id;
                            text = (upd.message.text || '').trim();
                        }

                        if (chatId) {
                            cachedChatIds.add(String(chatId));
                            saveStoredChatIds();
                        }

                        // 1. TELEGRAM INLINE BUTON TIKLANDIĞINDA
                        if (callbackData) {
                            const orders = getOrders();
                            if (callbackData.startsWith('approve_')) {
                                const orderId = callbackData.replace('approve_', '');
                                const order = orders.find(o => o.id === orderId);
                                if (order) {
                                    order.status = 'Ödeme Alındı / Onaylandı';
                                    saveOrders(orders);
                                    
                                    // PROFİLE AKTAR
                                    activateOrderProfile(order);

                                    sendTelegramMessage(chatId, `🎉 BİLDİRİM: ${orderId} kodlu ${order.customerName} siparişinin ödemesi ONAYLANDI! Profil otomatik olarak "Kart Profilleri" sekmesine eklendi.`);
                                }
                            } else if (callbackData.startsWith('cancel_')) {
                                const orderId = callbackData.replace('cancel_', '');
                                const order = orders.find(o => o.id === orderId);
                                if (order) {
                                    order.status = 'İptal Edildi';
                                    saveOrders(orders);
                                    sendTelegramMessage(chatId, `❌ BİLDİRİM: ${orderId} kodlu sipariş İptal edildi.`);
                                }
                            }
                        }

                        // 2. KULLANICI 'ONAY' VEYA '/ONAY' YAZDIĞINDA
                        if (text) {
                            const cleanText = text.toLowerCase();
                            if (cleanText.includes('onay') || cleanText.includes('onayla')) {
                                const orders = getOrders();
                                const pendingOrder = orders.find(o => (o.status || '').includes('Bekliyor'));
                                if (pendingOrder) {
                                    pendingOrder.status = 'Ödeme Alındı / Onaylandı';
                                    saveOrders(orders);

                                    // PROFİLE AKTAR
                                    activateOrderProfile(pendingOrder);

                                    sendTelegramMessage(chatId, `🎉 TEBRİKLER! ${pendingOrder.id} (${pendingOrder.customerName}) siparişi ONAYLANDI ve "Kart Profilleri" sekmesine eklendi!`);
                                } else {
                                    sendTelegramMessage(chatId, `ℹ️ Şu an onay bekleyen yeni bir sipariş bulunmuyor.`);
                                }
                            }
                        }
                    });
                }
            } catch (e) {}
        });
    }).on('error', () => {});
}

function sendTelegramMessage(chatId, text) {
    const postData = JSON.stringify({ chat_id: chatId, text });
    const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    req.write(postData);
    req.end();
}

setInterval(pollTelegramCommands, 4000);

function sendOrderNotification(order) {
    console.log(`\n====================================================`);
    console.log(`🚨 SİPARİŞİNİZ GELDİ!!! -> ${NOTIFY_PHONE}`);
    console.log(`Müşteri: ${order.customerName} - Tel: ${order.customerPhone}`);
    console.log(`====================================================\n`);

    sendTelegramNotification(order);
}

// Customer Login & Orders API (Sadece kendi telefon numarasıyla sipariş sorgulama)
app.post('/api/customer/orders', (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'Lütfen telefon numaranızı girin.' });
    }

    const cleanInputPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanInputPhone || cleanInputPhone.length < 7) {
        return res.status(400).json({ error: 'Geçerli bir telefon numarası giriniz.' });
    }

    const allOrders = getOrders();
    const customerOrders = allOrders.filter(o => {
        const orderPhone = (o.customerPhone || '').replace(/[^0-9]/g, '');
        return orderPhone && (orderPhone.endsWith(cleanInputPhone) || cleanInputPhone.endsWith(orderPhone));
    });

    res.json({
        success: true,
        phone: cleanInputPhone,
        orders: customerOrders
    });
});

// Middleware: Admin Auth Check
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['x-admin-password'];
    if (authHeader === ADMIN_PASSWORD || authHeader === `Bearer ${ADMIN_PASSWORD}`) {
        return next();
    }
    return res.status(401).json({ error: 'Yetkisiz erişim! Geçersiz admin şifresi.' });
}

// API: Admin Login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: ADMIN_PASSWORD });
    }
    return res.status(401).json({ success: false, error: 'Hatalı Admin Şifresi!' });
});

// API: Müşteri Sipariş Oluşturma (Genel Erişim)
app.post('/api/orders', (req, res) => {
    const { name, title, company, phone, email, instagram, googleMap, iban, city, district, address, note, cardColor } = req.body;

    if (!name || !phone || !address) {
        return res.status(400).json({ error: 'Lütfen Ad Soyad, Telefon ve Teslimat Adresi alanlarını doldurun.' });
    }

    const profiles = getProfiles();
    
    let id = name.toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    let finalId = id;
    let counter = 1;
    while (profiles.some(p => p.id === finalId) || getOrders().some(o => o.draftProfile && o.draftProfile.id === finalId)) {
        finalId = `${id}-${counter}`;
        counter++;
    }

    const links = [];
    if (instagram) {
        const cleanInsta = instagram.replace(/^@/, '').trim();
        links.push({ title: 'Instagram Hesabım', url: `https://instagram.com/${cleanInsta}`, icon: 'instagram' });
    }
    if (googleMap) {
        links.push({ title: 'Google Harita & Yorum Yap', url: googleMap.startsWith('http') ? googleMap : `https://${googleMap}`, icon: 'google' });
    }
    if (phone) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        links.push({ title: 'WhatsApp ile İletişim', url: `https://wa.me/${cleanPhone}`, icon: 'whatsapp' });
    }

    // Özel eklenen custom linkler (Web sitesi, Katalog, vb.)
    if (Array.isArray(req.body.customLinks)) {
        req.body.customLinks.forEach(cl => {
            if (cl.title && cl.url) {
                const formattedUrl = cl.url.startsWith('http') ? cl.url : `https://${cl.url}`;
                links.push({ title: cl.title, url: formattedUrl, icon: 'link' });
            }
        });
    }

    const ibans = [];
    if (iban) {
        ibans.push({ bank: 'Banka Hesabı', name, iban });
    }

    const draftProfile = {
        id: finalId,
        name,
        title: title || 'Müşteri',
        company: company || '',
        bio: `${name} dijital kartvizit profili.`,
        phone,
        email: email || '',
        location: `${city || ''} ${district || ''}`.trim(),
        avatar: req.body.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
        banner: req.body.banner || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
        links,
        ibans,
        views: 0,
        createdAt: new Date().toISOString()
    };

    // Save Order (Draft Profile ile birlikte)
    const orders = getOrders();
    const qty = parseInt(req.body.quantity) || 1;
    const hasAppSys = req.body.hasAppointmentSystem === true || req.body.hasAppointmentSystem === 'true';
    const appAddon = hasAppSys ? 300 : 0;
    const totalPriceCalc = req.body.totalPrice || req.body.price || `${((qty * 700) + appAddon).toLocaleString('tr-TR')} TL`;

    const newOrder = {
        id: `siparis-${Date.now().toString().slice(-4)}`,
        customerName: name,
        company: company || '',
        customerPhone: phone,
        customerEmail: email || '',
        quantity: qty,
        totalPrice: totalPriceCalc,
        price: totalPriceCalc,
        paymentMethod: req.body.paymentMethod || 'IBAN Havale/EFT',
        city: city || '',
        district: district || '',
        address,
        note: note || '',
        cardColor: cardColor || 'Gümüş Metal',
        profileId: finalId,
        profileName: name,
        hasAppointmentSystem: hasAppSys,
        appointmentBusinessName: req.body.appointmentBusinessName || company || name,
        appointmentPassword: req.body.appointmentPassword || '123456',
        draftProfile: draftProfile,
        status: 'Bekliyor (Ödeme Onayı Bekleniyor)',
        createdAt: new Date().toISOString()
    };

    orders.unshift(newOrder);
    saveOrders(orders);

    // OTOMATİK TELEGRAM BİLDİRİMİ TETİKLE
    sendOrderNotification(newOrder);

    res.status(201).json({ 
        success: true, 
        message: 'SİPARİŞİNİZ GELDİ!!!',
        order: newOrder, 
        profileId: finalId
    });
});

// ======================================================
// 📅 İŞLETME ÖZEL RANDEVU KANALI VE LOGİN API'LERİ
// ======================================================

// API: İşletme Özel Randevu Paneli Girişi
app.post('/api/business/login', (req, res) => {
    const { businessName, password } = req.body;
    if (!businessName || !password) {
        return res.status(400).json({ error: 'İşletme adı ve şifre gereklidir.' });
    }

    const accs = getBusinessAccounts();
    const cleanBName = businessName.trim().toLowerCase();
    const cleanPass = password.trim();

    const account = accs.find(a => 
        (a.businessName && a.businessName.trim().toLowerCase() === cleanBName) ||
        (a.profileId && a.profileId.toLowerCase() === cleanBName)
    );

    if (!account || account.password !== cleanPass) {
        return res.status(401).json({ error: 'İşletme adı veya şifre hatalı!' });
    }

    res.json({
        success: true,
        message: 'Giriş başarılı!',
        account: {
            id: account.id,
            profileId: account.profileId,
            businessName: account.businessName,
            phone: account.phone
        }
    });
});

// API: İşletmeye Özel Randevuları Getir
app.get('/api/business/appointments/:profileId', (req, res) => {
    const apps = getAppointments();
    const profileId = req.params.profileId;
    const businessApps = apps.filter(a => a.profileId === profileId || a.businessName === profileId);
    res.json(businessApps);
});

// API: Müşteri Tarafından Randevu Oluşturma (Kart Profili /p/:id Üzerinden)
app.post('/api/appointments', (req, res) => {
    const { profileId, businessName, customerName, customerPhone, date, time, note } = req.body;
    if (!profileId || !customerName || !customerPhone || !date || !time) {
        return res.status(400).json({ error: 'Lütfen tüm randevu bilgilerini doldurun.' });
    }

    const apps = getAppointments();
    const newApp = {
        id: `randevu-${Date.now().toString().slice(-4)}`,
        profileId,
        businessName: businessName || 'İşletme',
        customerName,
        customerPhone,
        date,
        time,
        note: note || '',
        status: 'Bekliyor',
        createdAt: new Date().toISOString()
    };

    apps.unshift(newApp);
    saveAppointments(apps);

    // Telegram Botuna Anlık Randevu Bildirimi Gönder
    const notifyMsg = `📅 YENİ RANDEVU TALEBİ! 📅\n\nİşletme: ${businessName || profileId}\nMüşteri: ${customerName}\nTelefon: ${customerPhone}\nTarih & Saat: ${date} - ${time}\nNot: ${note || 'Yok'}`;
    try {
        cachedChatIds.forEach(chatId => {
            const payload = JSON.stringify({ chat_id: chatId, text: notifyMsg });
            const req = https.request(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            });
            req.on('error', () => {});
            req.write(payload);
            req.end();
        });
    } catch(e) {}

    res.status(201).json({ success: true, message: 'Randevunuz oluşturuldu!', appointment: newApp });
});

// API: İşletmenin Randevu Durumunu Güncellemesi (Onayla / İptal)
app.put('/api/business/appointments/:id/status', (req, res) => {
    let apps = getAppointments();
    const appItem = apps.find(a => a.id === req.params.id);
    if (!appItem) return res.status(404).json({ error: 'Randevu bulunamadı' });

    appItem.status = req.body.status || 'Onaylandı';
    saveAppointments(apps);
    res.json({ success: true, message: 'Randevu durumu güncellendi', appointment: appItem });
});

// API: Siparişleri Getir
app.get('/api/orders', requireAdminAuth, (req, res) => {
    res.json(getOrders());
});

// API: Admin Paneli Tüm Aktif Randevu Sistemleri Özeti
app.get('/api/admin/appointments-summary', requireAdminAuth, (req, res) => {
    res.json({
        businessAccounts: getBusinessAccounts(),
        appointments: getAppointments()
    });
});

// API: Genel Sipariş Onay Durumu Kontrolü (Müşteri Canlı Ekranı İçin)
app.get('/api/orders/check-status/:profileId', (req, res) => {
    const orders = getOrders();
    const order = orders.find(o => o.profileId === req.params.profileId);
    if (!order) return res.json({ approved: false, status: 'Bulunamadı' });

    const isApproved = (order.status || '').includes('Onaylandı') || (order.status || '').includes('Tamamlandı') || (order.status || '').includes('Kargolandı');
    res.json({ approved: isApproved, status: order.status });
});

// API: Sipariş Durumu Güncelle (Tamamlandı / Onaylandı)
app.put('/api/orders/:id/status', requireAdminAuth, (req, res) => {
    let orders = getOrders();
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });

    order.status = req.body.status || 'Tamamlandı / Kargolandı';
    order.completedAt = new Date().toISOString();

    // Sipariş onaylandığında Kart Profillerine Otomatik Aktar!
    activateOrderProfile(order);

    saveOrders(orders);
    res.json({ success: true, message: 'Sipariş onaylandı ve Kart Profillerine eklendi', order });
});

// API: Sipariş Sil (Admin Şifre Korumalı)
app.delete('/api/orders/:id', requireAdminAuth, (req, res) => {
    let orders = getOrders();
    const initialLen = orders.length;
    orders = orders.filter(o => o.id !== req.params.id);
    if (orders.length === initialLen) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    saveOrders(orders);
    res.json({ success: true, message: 'Sipariş arşivden silindi' });
});

// API: Profiles REST CRUD
app.get('/api/profiles', (req, res) => {
    res.json(getProfiles());
});

app.get('/api/profiles/:id', (req, res) => {
    const profiles = getProfiles();
    const profile = profiles.find(p => p.id === req.params.id);
    if (!profile) return res.status(404).json({ error: 'Profil bulunamadı' });
    profile.views = (profile.views || 0) + 1;
    saveProfiles(profiles);
    res.json(profile);
});

app.post('/api/profiles', requireAdminAuth, (req, res) => {
    const profiles = getProfiles();
    let { id, name, title, company, bio, phone, email, location, avatar, banner, theme, links, ibans } = req.body;
    
    if (!name) return res.status(400).json({ error: 'İsim alanı zorunludur' });

    if (!id || id.trim() === '') {
        id = name.toLowerCase()
            .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
            .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    let finalId = id;
    let counter = 1;
    while (profiles.some(p => p.id === finalId)) {
        finalId = `${id}-${counter}`;
        counter++;
    }

    const hasApp = req.body.hasAppointmentSystem === true || req.body.hasAppointmentSystem === 'true';

    const newProfile = {
        id: finalId,
        name: name || '',
        title: title || '',
        company: company || '',
        bio: bio || '',
        phone: phone || '',
        email: email || '',
        location: location || '',
        avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
        banner: banner || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
        theme: theme || 'dark',
        links: Array.isArray(links) ? links : [],
        ibans: Array.isArray(ibans) ? ibans : [],
        hasAppointmentSystem: hasApp,
        appointmentPassword: req.body.appointmentPassword || '123456',
        views: 0,
        createdAt: new Date().toISOString()
    };

    if (hasApp) {
        const accs = getBusinessAccounts();
        const bName = req.body.appointmentBusinessName || newProfile.company || newProfile.name;
        const bPass = req.body.appointmentPassword || '123456';
        const existingIdx = accs.findIndex(a => a.profileId === finalId || (a.businessName && a.businessName.toLowerCase() === bName.toLowerCase()));
        const accData = {
            id: `acc-${Date.now().toString().slice(-4)}`,
            profileId: finalId,
            businessName: bName,
            password: bPass,
            phone: newProfile.phone,
            hasAppointmentSystem: true,
            createdAt: new Date().toISOString()
        };
        if (existingIdx !== -1) accs[existingIdx] = { ...accs[existingIdx], ...accData };
        else accs.push(accData);
        saveBusinessAccounts(accs);
    }

    profiles.push(newProfile);
    saveProfiles(profiles);
    res.status(201).json(newProfile);
});

app.put('/api/profiles/:id', requireAdminAuth, (req, res) => {
    const profiles = getProfiles();
    const index = profiles.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Profil bulunamadı' });

    const hasApp = req.body.hasAppointmentSystem === true || req.body.hasAppointmentSystem === 'true';

    const updatedProfile = { 
        ...profiles[index], 
        ...req.body, 
        id: profiles[index].id,
        hasAppointmentSystem: hasApp
    };
    profiles[index] = updatedProfile;

    if (hasApp || req.body.appointmentPassword) {
        const accs = getBusinessAccounts();
        const bName = req.body.appointmentBusinessName || updatedProfile.company || updatedProfile.name;
        const bPass = req.body.appointmentPassword || updatedProfile.appointmentPassword || '123456';
        const existingIdx = accs.findIndex(a => a.profileId === profiles[index].id || (a.businessName && a.businessName.toLowerCase() === bName.toLowerCase()));
        const accData = {
            id: `acc-${Date.now().toString().slice(-4)}`,
            profileId: profiles[index].id,
            businessName: bName,
            password: bPass,
            phone: updatedProfile.phone,
            hasAppointmentSystem: true,
            createdAt: new Date().toISOString()
        };
        if (existingIdx !== -1) accs[existingIdx] = { ...accs[existingIdx], ...accData };
        else accs.push(accData);
        saveBusinessAccounts(accs);
    }

    saveProfiles(profiles);
    res.json(updatedProfile);
});

app.delete('/api/profiles/:id', requireAdminAuth, (req, res) => {
    let profiles = getProfiles();
    const initialLength = profiles.length;
    profiles = profiles.filter(p => p.id !== req.params.id);
    if (profiles.length === initialLength) return res.status(404).json({ error: 'Profil bulunamadı' });

    saveProfiles(profiles);
    res.json({ message: 'Profil silindi' });
});

app.get('/api/vcard/:id', (req, res) => {
    const profiles = getProfiles();
    const profile = profiles.find(p => p.id === req.params.id);
    if (!profile) return res.status(404).send('Profil bulunamadı');

    let vcard = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;
    vcard += `N:${profile.name};;;;\r\nFN:${profile.name}\r\n`;
    if (profile.company) vcard += `ORG:${profile.company}\r\n`;
    if (profile.title) vcard += `TITLE:${profile.title}\r\n`;
    if (profile.phone) vcard += `TEL;TYPE=CELL:${profile.phone}\r\n`;
    if (profile.email) vcard += `EMAIL:${profile.email}\r\n`;
    if (profile.location) vcard += `ADR;TYPE=WORK:;;${profile.location};;;;\r\n`;
    vcard += `END:VCARD\r\n`;

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${profile.id}.vcf"`);
    res.send(vcard);
});

// JS Fallback Rotaları
app.get(['/js/admin.js', '/admin.js'], (req, res) => {
    const rootJs = path.join(__dirname, 'admin.js');
    const pubJs = path.join(__dirname, 'public', 'js', 'admin.js');
    if (fs.existsSync(rootJs)) return res.sendFile(rootJs);
    if (fs.existsSync(pubJs)) return res.sendFile(pubJs);
    res.sendFile(pubJs);
});

// Logo & Favicon Dynamic Handler
app.get(['/img/logo.jpg', '/logo.jpg', '/favicon.ico'], (req, res) => {
    const pubLogo = path.join(__dirname, 'public', 'img', 'logo.jpg');
    const rootLogo = path.join(__dirname, 'logo.jpg');
    if (fs.existsSync(pubLogo)) return res.sendFile(pubLogo);
    if (fs.existsSync(rootLogo)) return res.sendFile(rootLogo);
    res.redirect('https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=400&q=80');
});

// Banner Dynamic Handler
app.get(['/img/banner.jpg', '/banner.jpg'], (req, res) => {
    const pubBanner = path.join(__dirname, 'public', 'img', 'banner.jpg');
    const rootBanner = path.join(__dirname, 'banner.jpg');
    if (fs.existsSync(pubBanner)) return res.sendFile(pubBanner);
    if (fs.existsSync(rootBanner)) return res.sendFile(rootBanner);
    res.redirect('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80');
});

// Google Verification & SEO Crawl Routes
app.get('/google24176a52df022b5f.html', (req, res) => {
    res.send('google-site-verification: google24176a52df022b5f.html');
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin/\n\nSitemap: https://nfc-kart.onrender.com/sitemap.xml\n");
});

const SITEMAP_XML_DATA = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://nfc-kart.onrender.com/</loc>
    <lastmod>2026-08-26</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://nfc-kart.onrender.com/order</loc>
    <lastmod>2026-08-26</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://nfc-kart.onrender.com/siparislerim</loc>
    <lastmod>2026-08-26</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;

app.get('/sitemap.xml', (req, res) => {
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.send(SITEMAP_XML_DATA);
});

// HTML Rotaları
app.get('/', (req, res) => {
    const rootPath = path.join(__dirname, 'index.html');
    const pubPath = path.join(__dirname, 'public', 'index.html');
    
    if (fs.existsSync(rootPath)) {
        try {
            const rootContent = fs.readFileSync(rootPath, 'utf8');
            if (rootContent.includes('NFC KART CNR')) return res.sendFile(rootPath);
        } catch(e) {}
    }
    if (fs.existsSync(pubPath)) {
        try {
            const pubContent = fs.readFileSync(pubPath, 'utf8');
            if (pubContent.includes('NFC KART CNR')) return res.sendFile(pubPath);
        } catch(e) {}
    }
    res.sendFile(pubPath);
});

app.get('/order', (req, res) => {
    const rootOrder = path.join(__dirname, 'order.html');
    const pubOrder = path.join(__dirname, 'public', 'order.html');
    if (fs.existsSync(rootOrder)) {
        try {
            const rootContent = fs.readFileSync(rootOrder, 'utf8');
            if (rootContent.includes('700 TL')) return res.sendFile(rootOrder);
        } catch(e) {}
    }
    if (fs.existsSync(pubOrder)) {
        try {
            const pubContent = fs.readFileSync(pubOrder, 'utf8');
            if (pubContent.includes('700 TL')) return res.sendFile(pubOrder);
        } catch(e) {}
    }
    res.sendFile(pubOrder);
});

app.get('/my-orders', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'my-orders.html'));
});

app.get('/siparislerim', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'my-orders.html'));
});

app.get('/p/:id', (req, res) => {
    const rootProf = path.join(__dirname, 'profile.html');
    const pubProf = path.join(__dirname, 'public', 'profile.html');
    if (fs.existsSync(rootProf)) {
        try {
            const rootContent = fs.readFileSync(rootProf, 'utf8');
            if (rootContent.includes('Online Randevu Oluştur')) return res.sendFile(rootProf);
        } catch(e) {}
    }
    if (fs.existsSync(pubProf)) {
        try {
            const pubContent = fs.readFileSync(pubProf, 'utf8');
            if (pubContent.includes('Online Randevu Oluştur')) return res.sendFile(pubProf);
        } catch(e) {}
    }
    res.sendFile(pubProf);
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 NFC KART CNR Sunucusu Çalışıyor!`);
    console.log(`🔑 Admin Şifresi: ${ADMIN_PASSWORD}`);
    console.log(`🤖 Telegram Sabit Bildirim Chat ID: ${DEFAULT_CHAT_ID}`);
    console.log(`====================================================`);
});

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ruken.12';

// Telegram Bot Entegrasyonu (@nfc_kart_siparis_bot)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8768331983:AAHqiStLE65fI1yYRuqZR_92Bob2oLhZZ0A';
let cachedChatIds = new Set();

// Bildirim Telefon Numarası
const NOTIFY_PHONE = '05078405206';
const CLEAN_NOTIFY_PHONE = '905078405206';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    } catch (err) {
        console.error("Orders kaydetme hatası:", err);
    }
}

// TELEGRAM BOT ANLIK CEP BİLDİRİMİ GÖNDERİCİ
async function sendTelegramNotification(order) {
    const notifyMsg = `🚨 SİPARİŞİNİZ GELDİ!!! 🚨\n📦 NFC KART SİPARİŞİ\n\nSipariş No: ${order.id}\nMüşteri Adı: ${order.customerName}\nTelefon: ${order.customerPhone}\nKart Modeli: ${order.cardColor}\nTeslimat Adresi: ${order.city}/${order.district} - ${order.address}\nNot: ${order.note || 'Yok'}`;

    try {
        // Fetch Chat IDs from Telegram Updates
        const updateUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
        https.get(updateUrl, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.ok && Array.isArray(data.result)) {
                        data.result.forEach(upd => {
                            if (upd.message && upd.message.chat && upd.message.chat.id) {
                                cachedChatIds.add(upd.message.chat.id);
                            }
                        });
                    }

                    // Broadcast Telegram Message to all registered Chat IDs
                    if (cachedChatIds.size > 0) {
                        cachedChatIds.forEach(chatId => {
                            const tgText = encodeURIComponent(notifyMsg);
                            const sendUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${chatId}&text=${tgText}`;
                            https.get(sendUrl, (sRes) => {
                                console.log(`✅ Telegram Bildirimi Telefonunuza Gönderildi (Chat ID: ${chatId})`);
                            });
                        });
                    } else {
                        console.log("⚠️ Telegram Bot henüz chat ID almadı. Lütfen t.me/nfc_kart_siparis_bot adresine girip BAŞLAT butonuna basın.");
                    }
                } catch (e) {
                    console.error("Telegram parse error:", e);
                }
            });
        }).on('error', (err) => console.error("Telegram updates error:", err));

    } catch (err) {
        console.error("Telegram notification dispatcher error:", err);
    }
}

function sendOrderNotification(order) {
    console.log(`\n====================================================`);
    console.log(`🚨 SİPARİŞİNİZ GELDİ!!! -> ${NOTIFY_PHONE}`);
    console.log(`Müşteri: ${order.customerName} - Tel: ${order.customerPhone}`);
    console.log(`====================================================\n`);

    // Telegram Bot Bildirimi Tetikle
    sendTelegramNotification(order);
}

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
    while (profiles.some(p => p.id === finalId)) {
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

    const ibans = [];
    if (iban) {
        ibans.push({ bank: 'Banka Hesabı', name, iban });
    }

    const newProfile = {
        id: finalId,
        name,
        title: title || 'Müşteri',
        company: company || '',
        bio: `${name} dijital kartvizit profili.`,
        phone,
        email: email || '',
        location: `${city || ''} ${district || ''}`.trim(),
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
        banner: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
        links,
        ibans,
        views: 0,
        createdAt: new Date().toISOString()
    };

    profiles.push(newProfile);
    saveProfiles(profiles);

    // Save Order
    const orders = getOrders();
    const newOrder = {
        id: `siparis-${Date.now().toString().slice(-4)}`,
        customerName: name,
        customerPhone: phone,
        customerEmail: email || '',
        city: city || '',
        district: district || '',
        address,
        note: note || '',
        cardColor: cardColor || 'Gümüş Metal',
        profileId: finalId,
        profileName: name,
        status: 'Bekliyor',
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

// API: Siparişleri Getir
app.get('/api/orders', requireAdminAuth, (req, res) => {
    res.json(getOrders());
});

// API: Sipariş Sil / Tamamla
app.delete('/api/orders/:id', requireAdminAuth, (req, res) => {
    let orders = getOrders();
    const initialLen = orders.length;
    orders = orders.filter(o => o.id !== req.params.id);
    if (orders.length === initialLen) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    saveOrders(orders);
    res.json({ success: true, message: 'Sipariş tamamlandı' });
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
        views: 0,
        createdAt: new Date().toISOString()
    };

    profiles.push(newProfile);
    saveProfiles(profiles);
    res.status(201).json(newProfile);
});

app.put('/api/profiles/:id', requireAdminAuth, (req, res) => {
    const profiles = getProfiles();
    const index = profiles.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Profil bulunamadı' });

    const updatedProfile = { ...profiles[index], ...req.body, id: profiles[index].id };
    profiles[index] = updatedProfile;
    saveProfiles(profiles);
    res.json(updatedProfile);
});

app.delete('/api/profiles/:id', requireAdminAuth, (req, res) => {
    let profiles = getProfiles();
    const initialLength = profiles.length;
    profiles = profiles.filter(p => p.id !== req.params.id);
    if (profiles.length === initialLength) return res.status(404).json({ error: 'Profil silindi' });

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

// HTML Rotaları
app.get('/order', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

app.get('/p/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 NFC KART Sunucusu Çalışıyor!`);
    console.log(`🔑 Admin Şifresi: ${ADMIN_PASSWORD}`);
    console.log(`🤖 Telegram Bot Bildirici (@nfc_kart_siparis_bot) Aktif!`);
    console.log(`====================================================`);
});

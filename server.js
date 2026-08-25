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
let lastTelegramUpdateId = 0;

// Bildirim Telefon Numarası
const NOTIFY_PHONE = '05078405206';

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

// TELEGRAM BOT ANLIK CEP BİLDİRİMİ VE ONAY BUTONU GÖNDERİCİ
async function sendTelegramNotification(order) {
    const qty = order.quantity || 1;
    const price = order.totalPrice || order.price || '1.000 TL';
    const notifyMsg = `🚨 SİPARİŞİNİZ GELDİ!!! 🚨\n📦 NFC KART SİPARİŞİ (${qty} ADET)\n\nSipariş No: ${order.id}\nAdet: ${qty} Adet\nToplam Tutar: ${price}\nÖdeme Yöntemi: ${order.paymentMethod || 'IBAN Havale/EFT'}\nMüşteri Adı: ${order.customerName}\nTelefon: ${order.customerPhone}\nKart Modeli: ${order.cardColor}\nTeslimat Adresi: ${order.city}/${order.district} - ${order.address}\nNot: ${order.note || 'Yok'}\n\nDurum: Bekliyor (Ödeme Onayı Gerekli)`;

    // Telegram Inline Action Button (Ödemeyi Onayla / İptal Et)
    const replyMarkup = JSON.stringify({
        inline_keyboard: [
            [
                { text: '✅ ÖDEMEYİ ONAYLA', callback_data: `approve_${order.id}` },
                { text: '❌ İPTAL ET', callback_data: `cancel_${order.id}` }
            ]
        ]
    });

    try {
        const updateUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastTelegramUpdateId + 1}`;
        https.get(updateUrl, (res) => {
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
                            if (upd.message && upd.message.chat && upd.message.chat.id) {
                                cachedChatIds.add(upd.message.chat.id);
                            }
                        });
                    }

                    if (cachedChatIds.size > 0) {
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
                                console.log(`✅ Telegram Sipariş ve Onay Butonu Gönderildi (Chat ID: ${chatId})`);
                            });
                            req.write(postData);
                            req.end();
                        });
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

                        if (chatId) cachedChatIds.add(chatId);

                        // 1. TELEGRAM INLINE BUTON TIKLANDIĞINDA
                        if (callbackData) {
                            const orders = getOrders();
                            if (callbackData.startsWith('approve_')) {
                                const orderId = callbackData.replace('approve_', '');
                                const order = orders.find(o => o.id === orderId);
                                if (order) {
                                    order.status = 'Ödeme Alındı / Onaylandı';
                                    saveOrders(orders);
                                    sendTelegramMessage(chatId, `🎉 BİLDİRİM: ${orderId} kodlu ${order.customerName} siparişinin ödemesi ONAYLANDI! Kart basılabilir.`);
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
                                const pendingOrder = orders.find(o => o.status === 'Bekliyor');
                                if (pendingOrder) {
                                    pendingOrder.status = 'Ödeme Alındı / Onaylandı';
                                    saveOrders(orders);
                                    sendTelegramMessage(chatId, `🎉 TEBRİKLER! En son bekleyen sipariş (${pendingOrder.id} - ${pendingOrder.customerName}) ONAYLANDI! Kart basıma hazırdır.`);
                                } else {
                                    sendTelegramMessage(chatId, `ℹ️ Şunu an bildirimlerde bekleyen onaylanmamış yeni sipariş bulunmuyor.`);
                                }
                            }
                        }
                    });
                }
            } catch (e) {}
        });
    }).on('error', () => {});
}

// Telegram Mesaj Gönderme Yardımcısı
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

// Periyodik Telegram Dinleyici (Her 5 saniyede bir Telegram'daki 'ONAY' komutlarını kontrol et)
setInterval(pollTelegramCommands, 5000);

function sendOrderNotification(order) {
    console.log(`\n====================================================`);
    console.log(`🚨 SİPARİŞİNİZ GELDİ!!! -> ${NOTIFY_PHONE}`);
    console.log(`Müşteri: ${order.customerName} - Tel: ${order.customerPhone}`);
    console.log(`====================================================\n`);

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
    const qty = parseInt(req.body.quantity) || 1;
    const totalPriceCalc = req.body.totalPrice || req.body.price || `${(qty * 1000).toLocaleString('tr-TR')} TL`;

    const newOrder = {
        id: `siparis-${Date.now().toString().slice(-4)}`,
        customerName: name,
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

// API: Siparişleri Getir
app.get('/api/orders', requireAdminAuth, (req, res) => {
    res.json(getOrders());
});

// API: Sipariş Durumu Güncelle (Tamamlandı / Kargolandı)
app.put('/api/orders/:id/status', requireAdminAuth, (req, res) => {
    let orders = getOrders();
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });

    order.status = req.body.status || 'Tamamlandı / Kargolandı';
    order.completedAt = new Date().toISOString();
    saveOrders(orders);
    res.json({ success: true, message: 'Sipariş durumu güncellendi', order });
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
    console.log(`🤖 Telegram Bot Onay Dinleyicisi Aktif!`);
    console.log(`====================================================`);
});

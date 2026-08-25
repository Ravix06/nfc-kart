const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ruken.12';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read profiles from JSON file
function getProfiles() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            const dataDir = path.dirname(DATA_FILE);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(DATA_FILE, '[]', 'utf8');
            return [];
        }
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error("Profiles okuma hatası:", err);
        return [];
    }
}

// Helper to save profiles to JSON file
function saveProfiles(profiles) {
    try {
        const dataDir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(profiles, null, 2), 'utf8');
    } catch (err) {
        console.error("Profiles kaydetme hatası:", err);
    }
}

// Middleware: Admin Giriş Kontrolü
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['x-admin-password'];
    if (authHeader === ADMIN_PASSWORD || authHeader === `Bearer ${ADMIN_PASSWORD}`) {
        return next();
    }
    return res.status(401).json({ error: 'Yetkisiz erişim! Geçersiz admin şifresi.' });
}

// API: Admin Giriş Doğrulama
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: ADMIN_PASSWORD });
    }
    return res.status(401).json({ success: false, error: 'Hatalı Admin Şifresi!' });
});

// API: Tum profilleri getir (Genel erişim)
app.get('/api/profiles', (req, res) => {
    const profiles = getProfiles();
    res.json(profiles);
});

// API: Tek profil getir (Genel erişim)
app.get('/api/profiles/:id', (req, res) => {
    const profiles = getProfiles();
    const profile = profiles.find(p => p.id === req.params.id);
    if (!profile) {
        return res.status(404).json({ error: 'Profil bulunamadı' });
    }
    profile.views = (profile.views || 0) + 1;
    saveProfiles(profiles);
    res.json(profile);
});

// API: Yeni profil oluştur (ŞİFRE KORUMALI)
app.post('/api/profiles', requireAdminAuth, (req, res) => {
    const profiles = getProfiles();
    let { id, name, title, company, bio, phone, email, location, avatar, banner, theme, links, ibans } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'İsim alanı zorunludur' });
    }

    if (!id || id.trim() === '') {
        id = name.toLowerCase()
            .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
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

// API: Profil Güncelle (ŞİFRE KORUMALI)
app.put('/api/profiles/:id', requireAdminAuth, (req, res) => {
    const profiles = getProfiles();
    const index = profiles.findIndex(p => p.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Profil bulunamadı' });
    }

    const current = profiles[index];
    const updatedProfile = {
        ...current,
        ...req.body,
        id: current.id
    };

    profiles[index] = updatedProfile;
    saveProfiles(profiles);
    res.json(updatedProfile);
});

// API: Profil Sil (ŞİFRE KORUMALI)
app.delete('/api/profiles/:id', requireAdminAuth, (req, res) => {
    let profiles = getProfiles();
    const initialLength = profiles.length;
    profiles = profiles.filter(p => p.id !== req.params.id);
    
    if (profiles.length === initialLength) {
        return res.status(404).json({ error: 'Profil bulunamadı' });
    }

    saveProfiles(profiles);
    res.json({ message: 'Profil başarıyla silindi' });
});

// API: vCard (.vcf) Telefon Rehberine Kaydetme Servisi
app.get('/api/vcard/:id', (req, res) => {
    const profiles = getProfiles();
    const profile = profiles.find(p => p.id === req.params.id);
    if (!profile) {
        return res.status(404).send('Profil bulunamadı');
    }

    let vcard = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;
    vcard += `N:${profile.name};;;;\r\n`;
    vcard += `FN:${profile.name}\r\n`;
    if (profile.company) vcard += `ORG:${profile.company}\r\n`;
    if (profile.title) vcard += `TITLE:${profile.title}\r\n`;
    if (profile.phone) vcard += `TEL;TYPE=CELL:${profile.phone}\r\n`;
    if (profile.email) vcard += `EMAIL:${profile.email}\r\n`;
    if (profile.location) vcard += `ADR;TYPE=WORK:;;${profile.location};;;;\r\n`;
    if (profile.bio) vcard += `NOTE:${profile.bio}\r\n`;
    vcard += `END:VCARD\r\n`;

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${profile.id}.vcf"`);
    res.send(vcard);
});

// Rotalar
app.get('/p/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 NFS Dijital Kartvizit Sunucusu Çalışıyor!`);
    console.log(`🔑 Varsayılan Admin Şifresi: ${ADMIN_PASSWORD}`);
    console.log(`🌐 Ana Sayfa:      http://localhost:${PORT}`);
    console.log(`⚙️ Yönetim Paneli: http://localhost:${PORT}/admin`);
    console.log(`====================================================`);
});

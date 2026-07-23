# NOXXY

NOXXY adalah layanan email sementara berbasis Node.js, MongoDB, Cloudflare Email Routing, dan Server-Sent Events (SSE).

## Fitur

- Pembuatan alamat email otomatis atau dengan nama pilihan sendiri
- Inbox realtime dengan sinkronisasi berkala sebagai cadangan
- Tampilan HTML dan teks untuk setiap email
- Deteksi spam sederhana dan penghapusan email
- Dashboard pengelolaan di `/admin`
- Tampilan responsif tanpa framework frontend

## Menjalankan proyek

Persyaratan: Node.js 18 atau yang lebih baru serta akses ke MongoDB.

```bash
npm install
npm run dev
```

Server lokal tersedia di `http://localhost:5000`.

## Konfigurasi

Konfigurasi utama berada di `config.js`. Untuk deployment, atur variabel lingkungan berikut:

- `MONGODB_URI`: koneksi MongoDB
- `ADMIN_USER`: nama pengguna dashboard
- `ADMIN_PASS`: kata sandi dashboard
- `PORT`: port server lokal

Daftar domain aktif dan masa berlaku inbox juga dapat diubah melalui `config.js`.

## Struktur

```text
api/                    API inbox, email, domain, SSE, dan admin
cloudflare-worker/      Worker penerima email dari Cloudflare
lib/                    Koneksi database, model, parser, dan helper
public/
  css/home.css          Tampilan halaman utama
  css/app.css           Tampilan dashboard
  js/home.js            Logika halaman utama
  js/app.js             Logika dashboard
  index.html            Halaman utama
  admin.html            Dashboard
server.js               Server pengembangan lokal
vercel.json             Konfigurasi deployment Vercel
```

## Alur email

```text
Cloudflare Email Routing
  → Cloudflare Worker
  → /api/inbound-email
  → MongoDB
  → SSE / polling
  → browser
```

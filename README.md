# Barkod Rapor Web

React + Vite ile hazirlanan barkod okutma ve rapor goruntuleme uygulamasi.

## Kurulum

```bash
npm install
```

Windows PowerShell script policy `npm` komutunu engellerse `.cmd` komutlarini kullanin:

```bash
npm.cmd install
npm.cmd run dev
```

## Ortam Degiskenleri

Yeni bilgisayarda uygulamanin acilmasi icin proje kok dizinine `.env.local` dosyasi ekleyin.
Ornek icin `.env.example` dosyasina bakin.

Gerekli frontend degiskenleri:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=
```

Backend/admin bildirimleri icin Vercel ortaminda ayrica su degiskenler gerekir:

```env
SUPABASE_SERVICE_ROLE_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
NOTIFICATION_ADMIN_SECRET=
```

Not: `.env.local` ve diger `.env*` dosyalari GitHub'a gonderilmez. Gizli degerleri sadece yerel dosyada veya Vercel Environment Variables alaninda tutun.

## Gelistirme

Frontend:

```bash
npm.cmd run dev
```

Yerel backend proxy:

```bash
node server.js
```

Frontend varsayilan olarak `http://127.0.0.1:5173`, backend ise `http://localhost:3001` uzerinde calisir.

## Build

```bash
npm.cmd run build
```

## Cihaz Onayi

Uygulama her tarayici icin guclu ve rastgele bir cihaz anahtari olusturur.
Normal kullanicilarin yeni cihazlari admin panelinde onaylanmadan rapor API'lerine
erisemez. Bir kullanici icin yeni cihaz onaylandiginda onceki onayli cihaz iptal
edilir.

Yeni bir cihaz ilk kez onay bekleyen duruma dustugunde, bildirim izni ve push
aboneligi bulunan admin cihazlarina otomatik bildirim gonderilir. Ayni cihaz tekrar
giris denediginde yeni bildirim uretilmez.

Veritabani tablosu ve Supabase fonksiyonlari su migration dosyasindadir:

```text
supabase/migrations/20260620_approved_devices.sql
```

Bu SQL Supabase SQL Editor uzerinden bir kez calistirilmalidir. Migration
uygulanmadan cihaz onayi ozelligi calismaz.

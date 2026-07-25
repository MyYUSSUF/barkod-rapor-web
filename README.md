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

## Kod Kontrolu

```bash
npm.cmd run lint
```

## Android / Google Play

Android uygulamasi Capacitor ile `android/` klasorunde hazirlanir.

Mobil uygulama icinden API isteklerinin canli Vercel backend'ine gitmesi icin
`.env.local` icinde su deger bulunmalidir:

```env
VITE_API_BASE_URL=https://barkod-rapor-web.vercel.app
```

Web build'ini alip Android projesine kopyalamak icin:

```bash
npm.cmd run android:sync
```

Android Studio'da acmak icin:

```bash
npm.cmd run android:open
```

Google Play icin AAB build almak icin:

```bash
npm.cmd run android:bundle
```

Windows'ta Gradle Java bulamazsa once bu oturum icin Android Studio JDK'sini
tanitabilirsiniz:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

Not: Play Store'a yuklenecek release AAB icin Android Studio uzerinden veya
Gradle signing ayarlariyla bir upload/release keystore kullanilmalidir.
`android/keystore.properties` ve keystore dosyalari GitHub'a gonderilmez.

## Cihaz Erisimi

Uygulama her tarayici icin guclu ve rastgele bir cihaz anahtari olusturur.
Aktif kullanicilar yeni cihazlarda yonetici onayi beklemeden giris yapabilir ve
ayni hesabi birden fazla cihazda kullanabilir. Yonetici tarafindan erisimi
kaldirilmis belirli bir cihaz yeniden giris yapamaz.

Veritabani tablosu ve Supabase fonksiyonlari su migration dosyasindadir:

```text
supabase/migrations/20260620_approved_devices.sql
supabase/migrations/20260621_first_device_auto_approval.sql
supabase/migrations/20260621_readable_user_device_views.sql
supabase/migrations/20260725_allow_unlimited_user_devices.sql
```

Bu SQL dosyalari tarih sirasiyla Supabase SQL Editor uzerinden bir kez
calistirilmalidir. Migration uygulanmadan cihaz onayi ozelligi calismaz.

Supabase Table Editor icinde kullanici ve cihaz kayitlarini daha okunur gormek
icin son migration iki salt okunur gorunum olusturur:

```text
user_profiles_readable
user_devices_readable
push_subscriptions_readable
```

Fikse Bekleyenler ve Sevkiyat Takip raporlari kullanici bazli izinle acilir.
Admin panelindeki kullanici tablosundan her iki rapor icin ayri izin verilebilir.

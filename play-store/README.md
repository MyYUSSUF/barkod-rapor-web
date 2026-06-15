# Google Play Store Hazırlığı

Bu klasör Barkod Rapor uygulamasını Google Play Store'a hazırlamak için tutulur.

## Önerilen Yayın Yolu

1. Google Play Console geliştirici hesabı açılır.
2. Uygulama Android için TWA olarak paketlenir.
3. Paket adı: `com.elvandyeing.barkodrapor`
4. Canlı PWA adresi: `https://barkod-rapor-web.vercel.app`
5. Gizlilik politikası: `https://barkod-rapor-web.vercel.app/privacy.html`
6. Android imzalama anahtarı üretildikten sonra `assetlinks.json` hazırlanır.
7. `.aab` dosyası Play Console'a yüklenir.

## Bilgisayarda Gerekenler

- Node.js mevcut.
- Java/JDK ve Android build araçları eksik.
- Bubblewrap kurulumu JDK/Android SDK kurulumunu önerebilir.

## Notlar

- Signing key dosyası repoya commitlenmemelidir.
- `assetlinks.json` imza parmak izi netleşmeden canlıya eklenmemelidir.
- Play Store'da test hesabı gerekir. Apple gibi, Google da uygulamayı inceleyebilir.

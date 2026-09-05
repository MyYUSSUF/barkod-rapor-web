# Yayın kontrol listesi

Her madde ilgili sürüm için tarih, sorumlu ve kanıtla işaretlenir. Bu belge tek
başına yayın izni vermez.

## Ortak web ve API

- [ ] `main` temizdir ve hedef commit GitHub ile eşittir.
- [ ] `npm.cmd run test`, `npm.cmd run lint` ve `npm.cmd run build` hedef commit'te geçti.
- [ ] Ortam değişkenleri yalnız hedef ortamda tanımlıdır; service-role anahtarı istemciye çıkmaz.
- [ ] Yerel/test ortamı üretim Supabase değişkenleri olmadan doğrulanmıştır.
- [ ] Yeni migration varsa Supabase envanteri, RLS testi, yedek/geri dönüş ve geriye uyumluluk kaydı vardır.
- [ ] Vercel önizlemesi üzerinden giriş, rapor erişimi ve ilgili yönetim akışı kontrol edildi.
- [ ] Üretim yayını için kullanıcı onayı, hedef dağıtım ve geri dönüş commit'i kaydedildi.

## Android

- [ ] Ortak değişikliğin `platform/android` başlangıç commit'ine kontrollü aktarıldığı doğrulandı.
- [ ] Android modu ile build/sync geçti; native dosya ve imzalama malzemeleri izlenmiyor.
- [ ] Gerçek cihazda giriş, barkod, rapor/PDF, bağlantı davranışı ve etkilenmiş bildirim akışı denendi.
- [ ] versionCode/versionName, Play Console'daki mevcut sürüm ve hedef kanal doğrulandı.
- [ ] AAB imzalı olarak üretildi; yükleme veya yayın için ayrı kullanıcı onayı var.

## iOS

- [ ] Ortak değişikliğin `platform/ios` başlangıç commit'ine kontrollü aktarıldığı doğrulandı.
- [ ] macOS/Xcode derleme yolu ve imzalama erişimi doğrulandı.
- [ ] Gerçek iPhone'da giriş, barkod, rapor/PDF ve etkilenmiş bildirim akışı denendi.
- [ ] MARKETING_VERSION/build, App Store Connect'teki mevcut sürüm ve hedef dağıtım doğrulandı.
- [ ] Archive/TestFlight/App Store yüklemesi için ayrı kullanıcı onayı var.

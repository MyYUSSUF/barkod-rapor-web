# ELVAN iOS yayın planı

## Uygulama kimliği

- Uygulama adı: ELVAN
- Bundle ID: `com.elvandying.barkodrapor`
- İlk iOS sürümü: `1.0.15`
- İlk iOS build numarası: `1`
- Hedef cihaz ailesi: iPhone
- Ana kategori: Business
- Fiyat: Ücretsiz
- Uygulama içi satın alma: Yok

## App Store bağlantıları

- Gizlilik politikası: `https://barkod-rapor-web.vercel.app/privacy-policy.html`
- Veri silme: `https://barkod-rapor-web.vercel.app/data-deletion.html`
- Destek: `https://barkod-rapor-web.vercel.app/support.html`

## App Privacy beyanı için mevcut veri akışı

- Ad, soyad ve kullanıcı/hesap bilgileri: uygulama işlevselliği ve hesap yönetimi; kullanıcıyla bağlantılı.
- Kullanıcı ve cihaz kimlikleri: oturum güvenliği, cihaz onayı ve bildirim teslimi; kullanıcıyla bağlantılı.
- Barkod ve rapor erişim kayıtları: uygulama işlevselliği ve güvenlik; kullanıcıyla bağlantılı.
- Bildirim cihaz anahtarı: bildirim teslimi; kullanıcıyla bağlantılı.
- Kamera görüntüsü: yalnız barkod taraması sırasında cihazda işlenir; kaydedilmez veya sunucuya gönderilmez.
- Reklam, takip ve üçüncü taraf reklam profillemesi: Yok.

App Store Connect soruları gönderimden önce mevcut üretim davranışıyla yeniden doğrulanmalıdır.

## İnceleme bilgileri

- İnceleme ekibine çalışan bir deneme kullanıcı adı ve şifre App Store Connect üzerinden verilmelidir.
- Deneme cihazı önceden onaylanmalı veya inceleme hesabının yeni cihazda girişine izin veren akış açıkça anlatılmalıdır.
- Kamera yalnız barkod taramak için kullanılır.
- PDF raporları, müşteri/tarih filtreleri, paylaşım ve bildirim akışı inceleme notlarında açıklanmalıdır.
- Deneme parolası veya Apple anahtarları bu depoya yazılmamalıdır.

## MacBook üzerinde tamamlanacaklar

1. Güncel macOS ve Xcode sürümünü doğrula.
2. Projeyi GitHub üzerinden MacBook'a al ve `npm install` çalıştır.
3. Apple hesabını Xcode'a ekle; doğru bireysel takımı seç.
4. `npm run ios:sync:debug` çalıştır ve `npm run ios:open` ile projeyi aç.
5. Signing & Capabilities bölümünde otomatik imzalamayı ve Push Notifications yeteneğini etkinleştir.
6. Gerçek iPhone'u bağla, Developer Mode'u etkinleştir ve uygulamayı debug olarak kur.
7. Kamera, klavye, dil/müşteri/tarih pencereleri, rapor PDF, yakınlaştırma, paylaşım, çentik ve alt güvenli alanları test et.
8. İlk girişte bildirim izninin yalnız bir kez istendiğini doğrula.
9. Apple geliştirme APNs anahtarıyla sandbox bildirimi gönderip gerçek iPhone'da doğrula.
10. Üretim paketi için `npm run ios:sync` çalıştır; Archive ve TestFlight yüklemesini Xcode'dan yap.
11. App Store Connect > Pricing and Availability > iPhone and iPad Apps on Apple Silicon Mac bölümünde `Make this app available` seçeneğini kapalı tut; Mac dağıtımı yapılmayacak.

## APNs sunucu ayarları

Bu değerler yalnız güvenli yayın ortamında saklanmalıdır:

- `APPLE_DEVELOPER_TEAM_ID`
- `APPLE_APNS_PRODUCTION_KEY_ID`
- `APPLE_APNS_PRODUCTION_PRIVATE_KEY`
- `APPLE_APNS_SANDBOX_KEY_ID`
- `APPLE_APNS_SANDBOX_PRIVATE_KEY`
- `IOS_BUNDLE_ID=com.elvandying.barkodrapor`

Apple Developer portalında `com.elvandying.barkodrapor` App ID'si için Push Notifications etkinleştirilmelidir. Yeni APNs anahtarları ortamla sınırlandırıldığı için production ve sandbox anahtarları ayrı oluşturulmalı; tercihen yalnız bu bundle ID'ye bağlı Topic Specific anahtarlar kullanılmalıdır. `.p8` dosyaları yalnız bir kez indirilebilir, depo dışında güvenli biçimde saklanmalı ve içerikleri Vercel gizli ortam değişkenlerine eklenmelidir.

Eski, hem production hem sandbox ortamında çalışan ortak Apple anahtarları için `APPLE_APNS_KEY_ID` ve `APPLE_APNS_PRIVATE_KEY` geriye dönük olarak desteklenir. Yeni kurulumda bu ortak adlar kullanılmamalıdır.

Debug kurulumları `ios-sandbox`, TestFlight ve App Store kurulumları `ios` platform kaydı kullanır.

## iOS zorunlu güncelleme sırası

İlk sürümde eski iOS sürümü olmadığı için politika kapalı tutulur:

- `IOS_FORCE_UPDATE=false`
- `IOS_MIN_BUILD_NUMBER=0`

Sonraki iOS sürümü tamamen App Store'da yayınlandıktan sonra örneğin build `2` için:

1. Yeni sürümü App Store'da tamamen yayınla.
2. App Store bağlantısının çalıştığını doğrula.
3. `IOS_FORCE_UPDATE=true` ayarla.
4. `IOS_MIN_BUILD_NUMBER=2` ayarla.
5. Eski build'in girişinin engellendiğini gerçek cihazda doğrula.

Yeni sürüm mağazada hazır olmadan minimum build yükseltilmemelidir.

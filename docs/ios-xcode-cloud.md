# iOS Xcode Cloud kurulumu

Xcode Cloud henüz etkin değil. Bu depo Xcode Cloud'a GitHub üzerinden yalnız ELVAN RAPOR iOS deposu ve gerekli branch erişimiyle bağlanır; GitHub aktarımı ve Mac'te yeni çalışma kopyası henüz yapılmadı. İlk doğrulama yalnız manuel branch tetiklemeli **Build** çalışması ve iOS Simulator hedefidir; TestFlight veya App Store dağıtımı bu adıma dahil değildir.

Xcode Cloud workflow'unda `ios/App/App.xcodeproj` ve paylaşılan `App` scheme seçilir. `ios/App/ci_scripts/ci_post_clone.sh` repo kökünü `CI_PRIMARY_REPOSITORY_PATH` ile çözer; yoksa script konumundan güvenli relative fallback kullanır. Script Node.js 24 LTS'yi zorunlu tutar; uyumsuz Node veya eksik npm varsa Homebrew `node@24` ile düzeltmeyi dener, mümkün değilse durur. Ardından `npm ci`, `npm run build:ios` ve yerel Capacitor CLI ile `cap sync ios` çalıştırır.

Build ortamına `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` public değişkenleri eklenir; iOS'a ait diğer `VITE_*` değerleri `.env.ios` içinden alınabilir. Eksik değerlerde script açık hata verir; değerleri loglamaz. Server/service-role anahtarları veya APNs özel anahtarları frontend build ortamına eklenmez.

Archive, code signing ve App Store Connect/TestFlight ayarları sonraki ayrı adımdır. Bu belge bunları kurmaz ve yayın başlatmaz.

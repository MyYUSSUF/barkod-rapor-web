# Supabase yapı notları

Bu klasördeki SQL dosyaları geçmişte yapılan değişiklikleri sırayla kaydeder.
Çalışan migration dosyaları sonradan değiştirilmemelidir. Canlı veritabanında
hangi yapının bulunduğu kontrol edilmeden eski bir SQL tekrar çalıştırılmamalıdır.

## Uygulamanın kullandığı ana yapı

- `profiles`: kullanıcı durumu, rolü ve rapor yetkileri
- `user_devices`: cihaz kayıtları; `revoked` dışındaki cihazlar onay beklemez
- `login_logs`: giriş ve çıkış hareketleri
- `report_logs`: açılan rapor hareketleri
- `push_subscriptions`: bildirim abonelikleri
- `native_push_subscriptions`: Android FCM ve iOS APNs bildirim kayıtları

İplik Stok yetkisi `profiles.can_view_yarn_stock_report` alanında tutulur.
Sınırsız cihaz girişi için son iş kuralı
`20260725_allow_unlimited_user_devices.sql` dosyasındadır.

## Readable view hedefi

Günlük kontrollerde ana tablolar yerine aşağıdaki view'lar kullanılır:

- `user_profiles_readable`
- `user_devices_readable`
- `login_logs_readable`
- `report_logs_readable`
- `push_subscriptions_readable`
- `database_overview_readable`

Son kullanılan sade yapı iki aşamadan oluşur:

1. `20260716_simplify_readable_views.sql` readable ekranları sadeleştirir.
2. `20260716_fix_report_logs_readable_order.sql` rapor hareketlerinde tarihi ilk
   kolona alır ve kayıtları `created_at desc, id desc` sırasıyla sabitler.

Bu iki dosya geçmiş migration zincirinin devamıdır. Canlıdaki view tanımları
doğrulanmadan tekrar çalıştırılmamalıdır.

## Geçmiş düzeltme dosyaları

`20260715_fix_report_logs_readable_names.sql`,
`20260715_restore_report_logs_readable_shape.sql` ve
`20260715_revert_report_logs_readable_original.sql` önceki denemeleri ve geri
dönüşleri kaydeder. Bunlar mevcut readable görünümünü kurmak için yeniden
çalıştırılmamalıdır.

## Canlı yapıyı salt okunur kontrol etme

`checks/readable_views.sql` dosyası view tanımlarını, kolonlarını ve kolon
sıralarını okur. DDL çalıştırmaz ve veriyi değiştirmez. Readable yapısında yeni
bir değişiklik hazırlanmadan önce bu dosya Supabase SQL Editor'da çalıştırılmalı,
çıktı mevcut hedefle karşılaştırılmalıdır.

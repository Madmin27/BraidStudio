# 002-publish-nginx

- status: done
- owner: codex
- updated_at: 2026-06-29
- related_files:
  - `server.js`
  - `/etc/nginx/sites-available/braidstudio.minen.com.tr.conf`
  - `/etc/systemd/system/braidstudio.service`

## Not

Hedef domain `braidstudio.minen.com.tr`. Servis varsayılan olarak `127.0.0.1:3017` dinler.
Nginx HTTP -> HTTPS yönlendirme ve HTTPS proxy kuruldu. Sertifika yolu `/etc/letsencrypt/live/braidstudio.minen.com.tr/`.
Hibrit AI analiz akışı için proxy timeout değerleri 240 saniyeye çıkarıldı.

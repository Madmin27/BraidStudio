# BraidStudio

AI destekli örgü/halat reçete sistemi başlangıç projesi.

Ana akış:
1. Kullanıcı ürün/halat görseli yükler.
2. AI görseli analiz eder.
3. AI tahmini seçenek olarak gösterilir.
4. Kullanıcı tahmini onaylar veya değiştirir.
5. Nihai reçete kullanıcı seçimlerinden üretilir.

Kritik ayrım:
- `ai_analysis_result`: modelin görselden çıkardığı öneri/geçmiş.
- `user_selected_options`: kullanıcının onayladığı kalıcı seçim.
- `generated_recipe`: yalnızca kullanıcı seçimlerinden üretilir.

Çalıştırma:

```bash
npm start
```

Varsayılan adres: `http://127.0.0.1:3017`

OpenRouter API:

```bash
nano /root/sunucu/BraidStudio/.env
```

`OPENROUTER_API_KEY` değerini girip servisi yeniden başlat:

```bash
systemctl restart braidstudio.service
```

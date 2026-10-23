<p align="center">
  <img src="assets/icon-1024.png" width="112" alt="Notra uygulama simgesi">
</p>

<h1 align="center">Notra</h1>

<p align="center">
  <strong>Windows için yerel öncelikli not, çizim ve tablo uygulaması.</strong><br>
  Her şey kendi cihazınızda kalır.
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>Türkçe</strong>
</p>

<p align="center">
  <a href="https://github.com/Whitich/Notra/releases/latest/download/Notra-Setup-1.0.0.exe">
    <img src="https://img.shields.io/badge/Notra'y%C4%B1_%C4%B0ndir-Windows_%C4%B0%C3%A7in_Setup_1.0.0-F2B84B?style=for-the-badge&logo=windows&logoColor=1B1C20" alt="Windows için Notra Setup 1.0.0 indir">
  </a>
</p>

<p align="center">
  <a href="https://github.com/Whitich/Notra/releases/latest">Son sürüm</a> ·
  <a href="README.md">English README</a>
</p>

![Notra ekran görüntüsü](docs/notra.png)

## Hakkında

Notra, Windows için hızlı ve yerel öncelikli bir not uygulamasıdır. Not yazıp biçimlendirebilir, fikirlerinizi çizebilir, görsel ekleyebilir, tablolar oluşturabilir ve notlarınızı defterler, etiketler, favoriler, sabitleme, arşiv ve çöp kutusu ile düzenleyebilirsiniz.

Hesap, bulut zorunluluğu veya telemetri yoktur. Notlarınız bilgisayarınızdaki yerel bir SQLite veritabanında tutulur.

## İndirme

Yukarıdaki butonla **Notra Setup 1.0.0** sürümünü doğrudan indirebilirsiniz.

- Kurulum dosyası: `Notra-Setup-1.0.0.exe`
- Boyut: yaklaşık 11,7 MB
- Kurulu boyut: yaklaşık 25 MB
- Kurulum kapsamı: yalnızca mevcut Windows kullanıcısı, yönetici izni gerekmez

> [!NOTE]
> Kurulum dosyası henüz kod imzalı değildir. Windows SmartScreen uyarı gösterirse **Daha fazla bilgi → Yine de çalıştır** seçeneğini kullanın.

## Özellikler

- Başlıklar, listeler, kontrol listeleri, alıntılar, kod, bağlantılar, renkler ve tablolar içeren zengin metin düzenleyici
- Satır ve sütun ekleme/çıkarma araçları ve hücreler arasında Tab ile gezinme
- Çizim stüdyosu; çizimleri doğrudan nota ekleme
- Panodan yapıştırma, sürükle-bırak veya görsel seçici ile görsel ekleme
- Notlar içinde tam metin arama
- Defterler, etiketler, sabitleme, favoriler, arşiv ve çöp kutusu
- Sürüm geçmişi ve geri yükleme
- Otomatik kaydetme ve taslak kurtarma
- JSON yedekleme ve geri yükleme
- HTML, Markdown, düz metin ve PDF dışa aktarma
- Kelime sayısı, okuma süresi ve yazma istatistikleri
- Odak modu, komut paleti ve tam ekran modu
- Açık, koyu ve sistem temaları
- İngilizce ve Türkçe arayüz
- Günlük işler için klavye kısayolları

## Sistem gereksinimleri

- Windows 10 veya Windows 11, 64 bit
- Microsoft Edge WebView2 Runtime
- Kurulumdan sonra internet bağlantısı gerekmez

WebView2 güncel Windows sürümlerinde ve Microsoft Edge ile birlikte gelir. Eksikse [WebView2 resmi sayfasından](https://developer.microsoft.com/microsoft-edge/webview2/) kurabilirsiniz.

## Gizlilik ve veriler

Notra verilerini şu klasörde saklar:

```text
%APPDATA%\Notra
```

Ana dosyalar `notra.db`, `backups` klasörü ve yerel WebView2 önbelleğidir.

- Hesap veya giriş yok
- Bulut senkronizasyonu yok
- Reklam veya telemetri yok
- Yedekler ve dışa aktarımlar yalnızca siz istediğinizde oluşturulur
- Notlarınız cihazınızda kalır

Tam JSON yedeğini **Ayarlar → Veriler** bölümünden alabilirsiniz.

## Klavye kısayolları

| İşlem | Kısayol |
| --- | --- |
| Yeni not | `Ctrl + N` |
| Komut paleti | `Ctrl + K` |
| Notlarda ara | `Ctrl + F` |
| Şimdi kaydet | `Ctrl + S` |
| Çizim stüdyosu | `Ctrl + Shift + D` |
| Odak modu | `Ctrl + Shift + F` |
| Tam ekran | `F11` |
| Ayarlar | `Ctrl + ,` |
| Kalın / italik / altı çizili | `Ctrl + B` / `Ctrl + I` / `Ctrl + U` |
| Kontrol listesi | `Ctrl + Shift + C` |
| Yazdır veya PDF | `Ctrl + P` |
| Yardım | `F1` |
| Tam ekrandan çık veya iletişim kutusunu kapat | `Esc` |

Tablo içinde hücreler arasında geçmek için `Tab` ve `Shift + Tab` kullanın. Son hücrede `Tab` yeni bir satır ekler.

## Geliştirme

Gereksinim: Windows üzerinde Python 3.12.

```powershell
git clone https://github.com/Whitich/Notra.git
cd Notra
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python entry.py
```

Uygulamayı geçici bir veri klasörüyle çalıştırma:

```powershell
$env:NOTRA_DATA_DIR = "$env:TEMP\Notra-Dev"
python entry.py
```

## Windows kurulum dosyasını derleme

[Inno Setup 6](https://jrsoftware.org/isinfo.php) kurun, ardından şu komutu çalıştırın:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Derleme çıktıları:

```text
dist\Notra\Notra.exe
dist\Notra-Setup-1.0.0.exe
```

Derleme betiği Inno Setup'ı standart kurulum klasörlerinde arar. Yalnızca PyInstaller uygulamasını derlemek için `-SkipInstaller` parametresini kullanabilirsiniz.

## Proje yapısı

```text
app/            Python arka ucu, SQLite deposu ve pywebview API'si
ui/             HTML, CSS, JavaScript ve çeviriler
ui/assets/      Arayüzle birlikte paketlenen görseller
assets/         Uygulama simgeleri
docs/           README ekran görüntüleri
build.ps1       PyInstaller ve Inno Setup derleme betiği
installer.iss   Inno Setup yapılandırması
notra.spec      PyInstaller yapılandırması
```

## İndirme doğrulama

`Notra-Setup-1.0.0.exe` için SHA-256:

```text
0AC49CDF1B1D010557720E0B58403BCB239851D63FE0CC7FEF563AF464AB7F8B
```

---

[Mert HARMANKAŞI (@Whitich)](https://github.com/Whitich) tarafından geliştirildi.

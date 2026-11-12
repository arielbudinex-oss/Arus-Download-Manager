(function () {
  'use strict';

  const STORAGE_KEY = 'arus.lang';
  const DICT = {
  "Share to a device": "Bagikan ke perangkat",
  "Share this PC": "Bagikan PC ini",
  "Browse your Downloads folder from a phone or laptop on this network.": "Jelajahi folder Unduhan dari HP atau laptop di jaringan ini.",
  "Scan to open shared files": "Pindai untuk membuka file yang dibagikan",
  "Scan with your phone camera": "Pindai dengan kamera HP",
  "Connect to the same Wi-Fi, then open the link. Keep Arus running and the PC awake.": "Hubungkan ke Wi-Fi yang sama, lalu buka tautannya. Biarkan Arus berjalan dan PC tetap menyala.",
  "Private link": "Tautan privat",
  "Stop sharing": "Hentikan berbagi",
  "Local network": "Jaringan lokal",
  "Folder access": "Akses folder",
  "Anyone you allow can browse every subfolder, view photos, play videos, and save files to their device. New downloads appear right away. Arus never edits or deletes your files while sharing.": "Siapa pun yang kamu izinkan bisa menjelajahi semua subfolder, melihat foto, memutar video, dan menyimpan file ke perangkatnya. Unduhan baru langsung muncul. Arus tidak pernah mengubah atau menghapus file selama berbagi.",
  "Require a password": "Wajibkan password",
  "Access password": "Password akses",
  "Use 8 or more characters. Send the password separately from the QR code.": "Gunakan minimal 8 karakter. Kirim password terpisah dari kode QR.",
  "Use only trusted Wi-Fi. HTTP is not encrypted, even with a password. Anyone with the link and password, if enabled, can open every file in this folder. No router or firewall settings are changed.": "Gunakan hanya Wi-Fi tepercaya. HTTP tidak terenkripsi, meskipun memakai password. Siapa pun dengan tautan dan password, jika diaktifkan, bisa membuka semua file di folder ini. Tidak ada pengaturan router atau firewall yang diubah.",
  "Phone cannot connect?": "HP tidak bisa tersambung?",
  "Use the same Wi-Fi, not a guest network. Disable mobile data for the test. If Windows asks, allow Arus only on a trusted Private network. Never open a router port. If the PC changes network, stop sharing and create a new QR.": "Gunakan Wi-Fi yang sama, bukan jaringan tamu. Matikan data seluler saat tes. Jika Windows bertanya, izinkan Arus hanya di jaringan Privat tepercaya. Jangan buka port router. Jika jaringan PC berubah, hentikan berbagi dan buat QR baru.",
  "Updating creates a new QR and disconnects existing viewers. Re-enter the password if you want to keep password protection.": "Memperbarui membuat QR baru dan memutus akses perangkat sebelumnya. Isi ulang password jika ingin tetap memakai perlindungan password.",
  "In 1 hour": "Dalam 1 jam",
  "In 8 hours": "Dalam 8 jam",
  "In 24 hours": "Dalam 24 jam",
  "No time limit": "Tanpa batas waktu",
  "Access closes when you stop sharing or Arus quits.": "Akses tertutup saat kamu menghentikan berbagi atau Arus ditutup.",
  "No time limit. Access closes when you stop sharing or Arus quits.": "Tanpa batas waktu. Akses tertutup saat kamu menghentikan berbagi atau Arus ditutup.",
  "Access closes when the period is over, when you stop sharing, or when Arus quits.": "Akses tertutup saat periode berakhir, saat kamu menghentikan berbagi, atau saat Arus ditutup.",
  "No time limit. Access ends when you stop sharing or Arus quits.": "Tanpa batas waktu. Akses berakhir saat kamu menghentikan berbagi atau Arus ditutup.",
  "Start sharing": "Mulai berbagi",
  "Update sharing": "Perbarui berbagi",
  "Folder sharing is on. Viewers need the password.": "Berbagi folder aktif. Pengunjung perlu password.",
  "Folder sharing is on. Anyone with this link can browse.": "Berbagi folder aktif. Siapa pun dengan tautan ini bisa menjelajah.",
  "Sharing is off. Allow access to your Downloads folder when you are ready.": "Berbagi nonaktif. Izinkan akses ke folder Unduhan saat kamu siap.",
  "Access ends": "Akses berakhir",
  "Checking local networks…": "Memeriksa jaringan lokal…",
  "No private network found. Connect this PC to trusted Wi-Fi or Ethernet, then reopen this panel.": "Jaringan privat tidak ditemukan. Hubungkan PC ke Wi-Fi atau Ethernet tepercaya, lalu buka ulang panel ini.",
  "Could not reach local sharing. Check that Arus is still running.": "Berbagi lokal tidak dapat dijangkau. Pastikan Arus masih berjalan.",
  "Preparing private access…": "Menyiapkan akses privat…",
  "Private link copied. Share it only with people you trust.": "Tautan privat tersalin. Bagikan hanya kepada orang yang kamu percaya.",
  "Copy the selected link manually.": "Salin tautan yang dipilih secara manual.",
  "The download controls listen on 127.0.0.1 and are not reachable from other machines.": "Kontrol unduhan mendengarkan di 127.0.0.1 dan tidak dapat diakses dari perangkat lain.",
  "Local sharing is off by default. When you enable it, a separate read-only server exposes your Downloads folder on the chosen network, with no write or delete access. Links and optional passwords expire when sharing stops.": "Berbagi lokal nonaktif secara bawaan. Jika diaktifkan, server terpisah yang hanya bisa dibaca membuka folder Unduhan di jaringan yang kamu pilih, tanpa akses tulis atau hapus. Tautan dan password opsional berakhir saat berbagi dihentikan.",
  "There is no automatic telemetry, analytics, account system, or cloud sync. Bug reports are sent only by you. Selected files leave this PC only when a device accesses your active local share.": "Tidak ada telemetri otomatis, analitik, akun, atau sinkronisasi cloud. Laporan bug hanya dikirim olehmu. File pilihan keluar dari PC hanya saat perangkat mengakses berbagi lokal yang kamu aktifkan.",
  "0 active": "0 aktif",
  "0 B in library": "0 B di koleksi",
  "0 files": "0 file",
  "0 queued": "0 mengantre",
  "0 waiting": "0 menunggu",
  "2 tries": "2 percobaan",
  "3 tries": "3 percobaan",
  "4 slots": "4 slot",
  "4 tries": "4 percobaan",
  "5 tries": "5 percobaan",
  "A quiet download manager for Windows.": "Download manager yang tenang untuk Windows.",
  "A report contains your description, optional contact, app and Windows version, a summary of settings, failure counts, and recent error logs.": "Laporan berisi deskripsimu, kontak opsional, versi aplikasi dan Windows, ringkasan pengaturan, jumlah kegagalan, serta log error terbaru.",
  "About": "Tentang",
  "About Arus": "Tentang Arus",
  "above and turn on Developer mode.": "di atas lalu aktifkan Developer mode.",
  "Action failed": "Aksi gagal",
  "Active": "Aktif",
  "Active queue": "Antrean aktif",
  "Add a link": "Tambah tautan",
  "Add a link or scan a page to start a download.": "Tambah tautan atau pindai halaman untuk mulai mengunduh.",
  "Add a link, drop a URL, or scan a web page for video and audio.": "Tambah tautan, tarik URL, atau pindai halaman web untuk video dan audio.",
  "Add a little more detail first.": "Tambahkan sedikit detail dulu.",
  "Add browser capture": "Tambah tangkapan browser",
  "Add download": "Tambah unduhan",
  "Added again": "Ditambahkan lagi",
  "Added to the queue": "Ditambahkan ke antrean",
  "Adding…": "Menambahkan…",
  "After updating the extension, click Reload in chrome://extensions.": "Setelah memperbarui ekstensi, klik Reload di chrome://extensions.",
  "All downloads": "Semua unduhan",
  "All downloads paused": "Semua unduhan dijeda",
  "Alt Shift A": "Alt Shift A",
  "Amount": "Nominal",
  "and choose the folder above.": "dan pilih folder di atas.",
  "and select the folder above.": "dan pilih folder di atas.",
  "Any amount from Rp 1.000. The QR updates as you type.": "Nominal bebas mulai Rp 1.000. QR berubah saat kamu mengetik.",
  "App and Windows version, settings summary, failure counts, and recent errors. Links, folder paths, and URL tokens are removed.": "Versi aplikasi dan Windows, ringkasan pengaturan, jumlah kegagalan, dan error terbaru. Tautan, path folder, dan token URL dihapus.",
  "Appearance": "Tampilan",
  "Applies to the whole app right away.": "Langsung berlaku untuk seluruh aplikasi.",
  "Archive": "Arsip",
  "Archives": "Arsip",
  "Arus bug report": "Laporan bug Arus",
  "Arus can ask GitHub for newer releases at launch and every few hours while it runs.": "Arus bisa menanyakan rilis terbaru ke GitHub saat dibuka dan tiap beberapa jam selama berjalan.",
  "Arus does not upload browsing data anywhere.": "Arus tidak mengunggah data penjelajahan ke mana pun.",
  "Arus downloads files, HLS, and DASH streams with a segment engine written in Rust. The engine runs on this PC and listens only on the local loopback address. Nothing is routed through a cloud service.": "Arus mengunduh file, HLS, dan stream DASH dengan engine segmen yang ditulis di Rust. Engine berjalan di PC ini dan hanya mendengarkan di alamat loopback lokal. Tidak ada yang lewat layanan cloud.",
  "Arus is a desktop utility. Your downloads, history, and preferences stay on this PC.": "Arus adalah aplikasi desktop. Unduhan, riwayat, dan pengaturanmu tersimpan di PC ini.",
  "Arus is free and open source. If it saves you time, you can leave a tip. Never required.": "Arus gratis dan sumber terbuka. Kalau membantumu, kamu bisa memberi dukungan. Tidak wajib.",
  "Arus is not responding": "Arus tidak merespons",
  "Arus is up to date": "Arus sudah versi terbaru",
  "Arus update available": "Pembaruan Arus tersedia",
  "Arus only connects to servers you ask it to download from or scan.": "Arus hanya terhubung ke server yang kamu minta untuk diunduh atau dipindai.",
  "Arus runs entirely on this PC.": "Arus berjalan sepenuhnya di PC ini.",
  "Ask GitHub for the newest release at launch and every few hours while Arus runs.": "Tanya GitHub soal rilis terbaru saat aplikasi dibuka dan tiap beberapa jam selama berjalan.",
  "Ask GitHub for the newest release at launch and while Arus runs. No identifiers are sent.": "Tanya GitHub soal rilis terbaru saat dibuka dan selama berjalan. Tidak ada identitas yang dikirim.",
  "Asking GitHub for the latest release.": "Menanyakan rilis terbaru ke GitHub.",
  "Attached automatically": "Dilampirkan otomatis",
  "Audio": "Audio",
  "Auto-retry failures": "Coba ulang otomatis saat gagal",
  "Backs off after network and server errors.": "Menunggu lebih lama setelah error jaringan dan server.",
  "Batch": "Batch",
  "Batch import": "Impor batch",
  "Batch import complete": "Impor batch selesai",
  "Batch import failed": "Impor batch gagal",
  "Behaviour": "Perilaku",
  "Browse": "Pilih",
  "Browser capture": "Tangkapan browser",
  "Browser capture is ready.": "Tangkapan browser siap.",
  "Browser extension": "Ekstensi browser",
  "Bug report": "Laporan bug",
  "Bug reports": "Laporan bug",
  "Built-in capabilities": "Kemampuan bawaan",
  "Cached with this download. Copy it to compare with the source.": "Disimpan bersama unduhan ini. Salin untuk dibandingkan dengan sumbernya.",
  "Cancel": "Batal",
  "Cancel download": "Batalkan unduhan",
  "Canceled": "Dibatalkan",
  "Cannot reach the engine": "Tidak bisa menjangkau engine",
  "Capture": "Tangkap",
  "Capture from the web": "Tangkap dari web",
  "Captured links and per-site overlay preferences live in Chrome extension storage on this PC.": "Tautan yang ditangkap dan pengaturan overlay per situs tersimpan di penyimpanan ekstensi Chrome di PC ini.",
  "Changes apply immediately after saving.": "Perubahan berlaku langsung setelah disimpan.",
  "Changes apply to new transfers immediately.": "Perubahan langsung berlaku untuk transfer baru.",
  "Changes preview instantly and save with the dialog.": "Perubahan langsung terlihat dan disimpan bersama dialog.",
  "Check again": "Cek lagi",
  "Check for updates": "Cek pembaruan",
  "Check now": "Cek sekarang",
  "Check the start time": "Periksa waktu mulai",
  "Checking extension": "Memeriksa ekstensi",
  "Checking for updates": "Memeriksa pembaruan",
  "Checking…": "Memeriksa…",
  "Choose": "Pilih",
  "Choose a start time when adding a link and it will wait here.": "Pilih waktu mulai saat menambah tautan dan unduhan akan menunggu di sini.",
  "Chrome and Edge can hand video, audio, and links to Arus. Browsers block silent installs, so this takes one manual step and is remembered after.": "Chrome dan Edge bisa mengirim video, audio, dan tautan ke Arus. Browser memblokir pemasangan senyap, jadi ada satu langkah manual yang cukup sekali.",
  "Clear download history?": "Hapus riwayat unduhan?",
  "Clear history": "Hapus riwayat",
  "Clear search": "Bersihkan pencarian",
  "Click": "Klik",
  "Clipboard and telemetry": "Papan klip dan telemetri",
  "Clipboard unavailable. Copy the details manually.": "Papan klip tidak tersedia. Salin detailnya secara manual.",
  "Clipboard watching reads links locally and can be turned off under Behaviour.": "Pemantauan papan klip membaca tautan secara lokal dan bisa dimatikan di Perilaku.",
  "Close": "Tutup",
  "Close details panel": "Tutup panel detail",
  "Close panel": "Tutup panel",
  "Close report": "Tutup laporan",
  "Close setup": "Tutup penyiapan",
  "Close support": "Tutup dukungan",
  "Closing the window keeps Arus running.": "Menutup jendela tidak menghentikan Arus.",
  "Come back here. Arus notices the extension on its own.": "Kembali ke sini. Arus mendeteksi ekstensi sendiri.",
  "comfortable": "nyaman",
  "Comfortable": "Nyaman",
  "compact": "padat",
  "Compact": "Padat",
  "Compact fits more downloads on screen without hiding details.": "Mode padat memuat lebih banyak unduhan tanpa menyembunyikan detail.",
  "Complete": "Selesai",
  "Completed": "Selesai",
  "Completed, failed, and canceled entries are removed from Arus. Downloaded files stay on disk.": "Entri selesai, gagal, dan dibatalkan dihapus dari Arus. File yang sudah diunduh tetap di disk.",
  "Completion popup": "Popup selesai",
  "Compute": "Hitung",
  "Computing…": "Menghitung…",
  "Connecting": "Menghubungkan",
  "Connections": "Koneksi",
  "Connections per file": "Koneksi per file",
  "Contact (optional)": "Kontak (opsional)",
  "Copy": "Salin",
  "Copy diagnostics": "Salin diagnostik",
  "Copy folder path": "Salin path folder",
  "Copy link": "Salin tautan",
  "Copy report": "Salin laporan",
  "Could not add download": "Tidak bisa menambah unduhan",
  "Could not check for updates": "Tidak bisa memeriksa pembaruan",
  "A new version is ready": "Versi baru sudah tersedia",
  "A newer Arus build is available on GitHub.": "Build Arus terbaru tersedia di GitHub.",
  "You are on": "Kamu memakai",
  "Latest version": "Versi terbaru",
  "Share your Downloads folder with a phone or laptop on the same Wi-Fi.": "Bagikan folder Unduhan ke HP atau laptop di Wi-Fi yang sama.",
  "Browse folders, view photos, play videos, and save files straight to the other device.": "Jelajahi folder, lihat foto, putar video, dan simpan file langsung ke perangkat lain.",
  "A refreshed installer and icons that match the current Arus mark.": "Installer dan ikon baru yang sesuai dengan logo Arus saat ini.",
  "The release page opens in your browser so you can download the new installer from GitHub.": "Halaman rilis terbuka di browser supaya kamu bisa mengunduh installer baru dari GitHub.",
  "You can update later from About.": "Kamu bisa memperbarui nanti dari About.",
  "Close update": "Tutup pembaruan",
  "Later": "Nanti",
  "Could not clear history": "Tidak bisa menghapus riwayat",
  "Could not compute checksum": "Tidak bisa menghitung checksum",
  "Could not copy diagnostics": "Tidak bisa menyalin diagnostik",
  "Could not copy the checksum": "Tidak bisa menyalin checksum",
  "Could not copy the link": "Tidak bisa menyalin tautan",
  "Could not copy the path": "Tidak bisa menyalin path",
  "Could not copy the report.": "Tidak bisa menyalin laporan.",
  "Could not open a browser": "Tidak bisa membuka browser",
  "Could not open the data folder": "Tidak bisa membuka folder data",
  "Could not open the extension folder": "Tidak bisa membuka folder ekstensi",
  "Could not open the folder": "Tidak bisa membuka folder",
  "Could not open the link": "Tidak bisa membuka tautan",
  "Could not save settings": "Tidak bisa menyimpan pengaturan",
  "Current view": "Tampilan saat ini",
  "dark": "gelap",
  "Dark": "Gelap",
  "DASH audio": "Audio DASH",
  "DASH video": "Video DASH",
  "Data folder": "Folder data",
  "Default folder": "Folder bawaan",
  "Delete": "Hapus",
  "Delete the file from disk": "Hapus file dari disk",
  "Describe what broke. Recent logs are attached so the same failure can be traced.": "Jelaskan apa yang rusak. Log terbaru ikut dilampirkan agar kegagalannya bisa ditelusuri.",
  "Detected": "Terdeteksi",
  "Developer mode": "Developer mode",
  "Diagnostics copied": "Diagnostik disalin",
  "Diagnostics:": "Diagnostik:",
  "Direct files, HLS, batch links, and browser capture.": "File langsung, HLS, tautan batch, dan tangkapan browser.",
  "Direct link": "Tautan langsung",
  "direct URL": "URL langsung",
  "Discord handle or email if a reply is welcome": "Nama Discord atau email kalau ingin dibalas",
  "Dismiss": "Tutup",
  "Document": "Dokumen",
  "Documents": "Dokumen",
  "Download": "Unduh",
  "Download again": "Unduh lagi",
  "Download canceled": "Unduhan dibatalkan",
  "Download complete": "Unduhan selesai",
  "Download details": "Detail unduhan",
  "Download failed": "Unduhan gagal",
  "Download overview": "Ringkasan unduhan",
  "Download progress": "Progres unduhan",
  "Download records (name, URL, folder, and progress) in": "Catatan unduhan (nama, URL, folder, dan progres) di",
  "Download removed": "Unduhan dihapus",
  "Download source": "Sumber unduhan",
  "Download update": "Unduh pembaruan",
  "Download with Arus": "Unduh dengan Arus",
  "Downloaded": "Terunduh",
  "Downloading": "Mengunduh",
  "Downloads": "Unduhan",
  "Downloads in this category will appear here.": "Unduhan dalam kategori ini akan muncul di sini.",
  "Downloads that need another try will appear here.": "Unduhan yang perlu dicoba lagi akan muncul di sini.",
  "Downloads work already. Browser capture is the only optional step.": "Unduhan sudah bisa dipakai. Tangkapan browser hanyalah langkah opsional.",
  "Downloads you pause will wait here.": "Unduhan yang kamu jeda akan menunggu di sini.",
  "Downloads, interface, and browser capture.": "Unduhan, antarmuka, dan tangkapan browser.",
  "Drop the link": "Jatuhkan tautannya",
  "Engine": "Engine",
  "Enter a page URL": "Masukkan URL halaman",
  "Enter a valid link": "Masukkan tautan yang valid",
  "ETA": "Sisa waktu",
  "Example: a download stopped at 80% and Retry did nothing.": "Contoh: unduhan berhenti di 80% dan Coba lagi tidak berhasil.",
  "Extension connected": "Ekstensi tersambung",
  "extension folder": "folder ekstensi",
  "Extension folder": "Folder ekstensi",
  "Extension folder missing": "Folder ekstensi tidak ditemukan",
  "Extension folder ready": "Folder ekstensi siap",
  "Extension path copied": "Path ekstensi disalin",
  "Failed": "Gagal",
  "Failures": "Kegagalan",
  "Fetching the page and looking for media…": "Mengambil halaman dan mencari media…",
  "ffmpeg detected · changes apply to new transfers immediately.": "ffmpeg terdeteksi · perubahan berlaku untuk transfer baru.",
  "ffmpeg not found · HLS saves as MPEG-TS and DASH tracks cannot be combined.": "ffmpeg tidak ditemukan · HLS disimpan sebagai MPEG-TS dan track DASH tidak bisa digabung.",
  "ffmpeg was not found. HLS is saved as MPEG-TS, and DASH video/audio tracks cannot be combined.": "ffmpeg tidak ditemukan. HLS disimpan sebagai MPEG-TS, dan track video/audio DASH tidak bisa digabung.",
  "file": "file",
  "File": "File",
  "FILE": "FILE",
  "File name": "Nama file",
  "File ready": "File siap",
  "files": "file",
  "Files": "File",
  "Finish setup": "Selesaikan penyiapan",
  "Finished files will be listed here.": "File yang selesai akan tercantum di sini.",
  "Finished. Download again adds a fresh copy to the queue.": "Selesai. Unduh lagi menambahkan salinan baru ke antrean.",
  "First run": "Saat pertama dibuka",
  "folder": "folder",
  "Folder path": "Path folder",
  "Folder paths, download links, and URL query values are stripped before a report leaves this PC.": "Path folder, tautan unduhan, dan nilai query URL dihapus sebelum laporan keluar dari PC ini.",
  "Free and open source under the MIT license. Built with Tauri, axum, and a small Rust engine. No accounts, no ads, no bundled offers.": "Gratis dan sumber terbuka di bawah lisensi MIT. Dibuat dengan Tauri, axum, dan engine Rust kecil. Tanpa akun, tanpa iklan, tanpa tawaran tambahan.",
  "Get Arus ready": "Siapkan Arus",
  "GitHub and Discord open in your default browser when you click them.": "GitHub dan Discord terbuka di browser default saat diklik.",
  "Global speed limit": "Batas kecepatan global",
  "Grab media under cursor": "Ambil media di posisi kursor",
  "Hide progress": "Sembunyikan progres",
  "high": "tinggi",
  "High": "Tinggi",
  "High priority": "Prioritas tinggi",
  "High-priority items leave the queue first.": "Item prioritas tinggi keluar dari antrean lebih dulu.",
  "History cleared": "Riwayat dihapus",
  "History is already clear": "Riwayat sudah kosong",
  "HLS and DASH streams are downloaded as segments; DASH video and audio are combined with ffmpeg.": "Stream HLS dan DASH diunduh sebagai segmen; video dan audio DASH digabung dengan ffmpeg.",
  "HLS streams (m3u8) are downloaded as segments and remuxed to MP4 when ffmpeg is available.": "Stream HLS (m3u8) diunduh sebagai segmen dan diubah ke MP4 saat ffmpeg tersedia.",
  "HLS video": "Video HLS",
  "How Arus reacts to links, finishes, and the window.": "Cara Arus menanggapi tautan, unduhan selesai, dan jendela.",
  "Idle": "Tidak aktif",
  "If update checks are on, Arus asks GitHub for the latest release at launch, every 6 hours while running, and whenever you check manually. GitHub sees those requests like any other web visit; Arus sends no account, machine, or download data.": "Kalau pengecekan pembaruan aktif, Arus menanyakan rilis terbaru ke GitHub saat dibuka, tiap 6 jam selama berjalan, dan saat kamu memeriksa manual. GitHub melihat permintaan itu seperti kunjungan web biasa; Arus tidak mengirim data akun, mesin, atau unduhan.",
  "Image": "Gambar",
  "Images": "Gambar",
  "Import links": "Impor tautan",
  "In library": "Di koleksi",
  "In the page that opens, turn on": "Di halaman yang terbuka, aktifkan",
  "inside the app data folder.": "di dalam folder data aplikasi.",
  "Keep the original": "Biarkan file asli",
  "Keeps this download below the cap, even when the global limit is off.": "Menjaga unduhan ini di bawah batas, bahkan saat batas global dimatikan.",
  "Keyboard shortcuts": "Pintasan keyboard",
  "Language": "Bahasa",
  "last 48 s": "48 dtk terakhir",
  "Last updated 10 November 2026.": "Terakhir diperbarui 10 November 2026.",
  "Leave empty to start now.": "Kosongkan untuk mulai sekarang.",
  "Let the queue work": "Biarkan antrean bekerja",
  "Library": "Koleksi",
  "Lifetime": "Sepanjang waktu",
  "Lifetime counters for files, bytes, failures, and the first-run date shown on the dashboard.": "Hitungan sepanjang waktu untuk file, byte, kegagalan, dan tanggal pertama dibuka yang tampil di dasbor.",
  "light": "terang",
  "Light": "Terang",
  "Link copied": "Tautan disalin",
  "Links": "Tautan",
  "Links and alerts": "Tautan dan notifikasi",
  "Live": "Live",
  "Load the bundled folder once. Arus shows Connected after the extension checks in.": "Muat folder bawaan sekali. Arus menampilkan Tersambung setelah ekstensi masuk.",
  "Load the folder in the extensions page, then check again.": "Muat folder di halaman ekstensi, lalu cek lagi.",
  "Load unpacked": "Load unpacked",
  "Local download manager": "Download manager lokal",
  "Local only": "Hanya lokal",
  "low": "rendah",
  "Low": "Rendah",
  "Low priority": "Prioritas rendah",
  "Maximize": "Perbesar",
  "Maximum is Rp 50.000.000.": "Maksimal Rp 50.000.000.",
  "media element": "elemen media",
  "Minimize": "Perkecil",
  "Minimize to tray": "Perkecil ke tray",
  "Minimum is Rp 1.000.": "Minimal Rp 1.000.",
  "More actions": "Tindakan lain",
  "Needs attention": "Perlu perhatian",
  "Network access": "Akses jaringan",
  "Never": "Tidak pernah",
  "New": "Baru",
  "New download": "Unduhan baru",
  "next in line": "berikutnya",
  "Next start": "Mulai berikutnya",
  "No active transfers": "Tidak ada transfer aktif",
  "No archives": "Tidak ada arsip",
  "No audio files": "Tidak ada file audio",
  "No automatic telemetry, no accounts, no cloud sync.": "Tanpa telemetri otomatis, tanpa akun, tanpa sinkronisasi cloud.",
  "No cap": "Tanpa batas",
  "No completed downloads": "Belum ada unduhan selesai",
  "No direct media sources found. Many sites load video from scripts. The browser extension can catch those streams.": "Tidak ada sumber media langsung. Banyak situs memuat video lewat skrip. Ekstensi browser bisa menangkap stream tersebut.",
  "No documents": "Tidak ada dokumen",
  "No error message": "Tidak ada pesan error",
  "No failures": "Tidak ada kegagalan",
  "No images": "Tidak ada gambar",
  "No matches": "Tidak ada hasil",
  "No other files": "Tidak ada file lain",
  "No programs": "Tidak ada program",
  "No scheduled downloads": "Tidak ada unduhan terjadwal",
  "No videos": "Tidak ada video",
  "None": "Tidak ada",
  "normal": "normal",
  "Normal": "Normal",
  "Not checked yet": "Belum dicek",
  "Not computed": "Belum dihitung",
  "Not connected yet": "Belum tersambung",
  "Not found": "Tidak ditemukan",
  "Nothing downloading": "Tidak ada yang diunduh",
  "Nothing here yet": "Belum ada apa-apa",
  "Nothing is sent until you press Send. Reports are stored privately on arus.xinet.id.": "Tidak ada yang dikirim sampai kamu menekan Kirim. Laporan disimpan secara privat di arus.xinet.id.",
  "Nothing paused": "Tidak ada yang dijeda",
  "now": "sekarang",
  "Offer a download when a link is copied.": "Tawarkan unduhan saat tautan disalin.",
  "on any video or audio.": "pada video atau audio apa pun.",
  "on disk": "di disk",
  "On disk": "Di disk",
  "Once": "Sekali",
  "one failure": "satu kegagalan",
  "one per line": "satu per baris",
  "One URL per line.": "Satu URL per baris.",
  "Only http and https URLs are supported.": "Hanya URL http dan https yang didukung.",
  "Open": "Buka",
  "Open data folder": "Buka folder data",
  "Open downloads folder": "Buka folder unduhan",
  "Open extension": "Buka ekstensi",
  "Open extensions page": "Buka halaman ekstensi",
  "Open file": "Buka file",
  "Open folder": "Buka folder",
  "Open GitHub issue": "Buka issue GitHub",
  "Open settings": "Buka pengaturan",
  "Opens your default browser. Nothing is installed without your click.": "Membuka browser default. Tidak ada yang terpasang tanpa kamu klik.",
  "optional": "opsional",
  "Optional": "Opsional",
  "or drop any link into the window": "atau tarik tautan apa saja ke jendela",
  "Other": "Lainnya",
  "page link": "tautan halaman",
  "page markup": "markup halaman",
  "page metadata": "metadata halaman",
  "Page URL": "URL halaman",
  "Paste a link, or scan a page for video and audio.": "Tempel tautan, atau pindai halaman untuk video dan audio.",
  "Paste at least one link": "Tempel setidaknya satu tautan",
  "Paste, drop, or import a list of URLs.": "Tempel, jatuhkan, atau impor daftar URL.",
  "Pause": "Jeda",
  "Pause all": "Jeda semua",
  "Paused": "Dijeda",
  "Paused. Resume or start now to continue from the saved data.": "Dijeda. Lanjutkan atau mulai sekarang untuk melanjutkan dari data tersimpan.",
  "peak n/a": "puncak n/a",
  "Pick a moment in the future.": "Pilih waktu di masa depan.",
  "Pick a valid date and time.": "Pilih tanggal dan waktu yang valid.",
  "Platform": "Platform",
  "Preferences are stored on this PC.": "Pengaturan tersimpan di PC ini.",
  "Preferences such as folder, limits, theme, and density, in the same local file.": "Pengaturan seperti folder, batas, tema, dan kepadatan di file lokal yang sama.",
  "Previews instantly. Saved with the rest of your settings.": "Pratinjau langsung. Disimpan bersama pengaturan lainnya.",
  "Priority": "Prioritas",
  "priority order": "urutan prioritas",
  "Privacy": "Privasi",
  "Privacy policy": "Kebijakan privasi",
  "program": "program",
  "Program": "Program",
  "Programs": "Program",
  "QRIS is not available": "QRIS tidak tersedia",
  "QRIS is not available in this build.": "QRIS tidak tersedia di versi ini.",
  "Queue": "Antrean",
  "Queue control": "Kendali antrean",
  "Queue held": "Antrean ditahan",
  "Queue resumed": "Antrean dilanjutkan",
  "Queued": "Mengantre",
  "Quick amounts": "Nominal cepat",
  "Quiet by default. Adjust how dense and how still it feels.": "Tenang secara bawaan. Atur kepadatan dan seberapa tenang tampilannya.",
  "Reduce motion": "Kurangi animasi",
  "Referer, cookies, and user-agent values are forwarded only to the file host, so authenticated downloads keep working.": "Nilai referer, cookie, dan user-agent hanya diteruskan ke host file, jadi unduhan yang butuh autentikasi tetap jalan.",
  "Release to start a new download.": "Lepas untuk memulai unduhan baru.",
  "Remove": "Hapus",
  "Remove download": "Hapus unduhan",
  "Remove download?": "Hapus unduhan?",
  "Report a bug": "Laporkan bug",
  "Report copied": "Laporan disalin",
  "Report copied.": "Laporan disalin.",
  "Report copied. Paste it into the issue.": "Laporan disalin. Tempel ke issue.",
  "Report sent": "Laporan terkirim",
  "Report sent. Thank you.": "Laporan terkirim. Terima kasih.",
  "Reports are manual. Arus sends nothing until you open Report a bug under About, describe the problem, and press Send.": "Laporan bersifat manual. Arus tidak mengirim apa pun sampai kamu membuka Laporkan bug di Tentang, menjelaskan masalahnya, dan menekan Kirim.",
  "Reports go to arus.xinet.id and are stored privately, readable by the maintainer only. No account is created.": "Laporan dikirim ke arus.xinet.id dan disimpan privat, hanya bisa dibaca pengelola. Tidak ada akun yang dibuat.",
  "Resume": "Lanjutkan",
  "Resume all": "Lanjutkan semua",
  "Resume now": "Lanjutkan sekarang",
  "Retries exhausted. Retry or start now to try again.": "Percobaan habis. Coba lagi atau mulai sekarang untuk mencoba ulang.",
  "Retry": "Coba lagi",
  "Retrying": "Mencoba lagi",
  "Row density": "Kepadatan baris",
  "Run a checksum to verify the saved file.": "Jalankan checksum untuk memverifikasi file tersimpan.",
  "running": "berjalan",
  "Runs automatically": "Berjalan otomatis",
  "Runs hidden in the tray at login and resumes unfinished downloads.": "Berjalan tersembunyi di tray saat login dan melanjutkan unduhan yang belum selesai.",
  "Save changes": "Simpan perubahan",
  "Save to": "Simpan ke",
  "Save video, audio, documents, and archives into separate folders.": "Simpan video, audio, dokumen, dan arsip ke folder terpisah.",
  "saved": "tersimpan",
  "Saved to": "Disimpan ke",
  "Scan": "Pindai",
  "Scan a page": "Pindai halaman",
  "Scan page": "Pindai halaman",
  "Scan with a bank or e-wallet app that supports QRIS. Payment goes straight to the merchant. Arus never sees your payment details.": "Pindai dengan aplikasi bank atau e-wallet yang mendukung QRIS. Pembayaran langsung ke merchant. Arus tidak pernah melihat data pembayaranmu.",
  "Scheduled": "Terjadwal",
  "Scheduler": "Penjadwal",
  "script data": "data skrip",
  "Search downloads": "Cari unduhan",
  "seen": "terlihat",
  "segment": "segmen",
  "Segments": "Segmen",
  "Segments, retries, and schedules run on their own.": "Segmen, percobaan ulang, dan jadwal berjalan sendiri.",
  "Send media from Chrome or Edge straight to Arus.": "Kirim media dari Chrome atau Edge langsung ke Arus.",
  "Send report": "Kirim laporan",
  "Send video, audio, and HLS from Chrome.": "Kirim video, audio, dan HLS dari Chrome.",
  "Sending report to arus.xinet.id.": "Mengirim laporan ke arus.xinet.id.",
  "Sending…": "Mengirim…",
  "Sent": "Terkirim",
  "Settings": "Pengaturan",
  "Settings saved": "Pengaturan disimpan",
  "Settings sections": "Bagian pengaturan",
  "SHA-256 computed": "SHA-256 dihitung",
  "SHA-256 copied": "SHA-256 disalin",
  "Shared by every active download. Single files can set a lower cap.": "Berlaku untuk semua unduhan aktif. File tertentu bisa memakai batas lebih rendah.",
  "short": "pendek",
  "Show a small Windows popup when a download finishes.": "Tampilkan popup Windows kecil saat unduhan selesai.",
  "Show in folder": "Tampilkan di folder",
  "Simultaneous downloads": "Unduhan bersamaan",
  "Single": "Tunggal",
  "Single connection · the server did not offer byte ranges.": "Satu koneksi · server tidak menawarkan byte range.",
  "Single connection download.": "Unduhan satu koneksi.",
  "Size": "Ukuran",
  "Skip for now": "Lewati dulu",
  "small": "kecil",
  "Sort into type folders": "Kelompokkan ke folder per jenis",
  "Source": "Sumber",
  "source element": "elemen sumber",
  "Speed": "Kecepatan",
  "Speed cap": "Batas kecepatan",
  "Speed cap cleared": "Batas kecepatan dihapus",
  "Speed caps": "Batas kecepatan",
  "stable": "stabil",
  "Start at": "Mulai pukul",
  "Start now": "Mulai sekarang",
  "Start time has passed": "Waktu mulai sudah lewat",
  "Start with Windows": "Jalankan saat Windows menyala",
  "Starting": "Memulai",
  "Starting now": "Mulai sekarang",
  "Status": "Status",
  "structured data": "data terstruktur",
  "Support": "Dukungan",
  "Support Arus": "Dukung Arus",
  "Thanks either way. Arus stays free for everyone.": "Terima kasih apa pun pilihannya. Arus tetap gratis untuk semua.",
  "Thanks, the maintainer can see it now.": "Terima kasih, pengelola sudah bisa melihatnya.",
  "The code carries the amount you choose.": "Kode QR memuat nominal yang kamu pilih.",
  "The downloaded file is removed too.": "File yang sudah diunduh juga dihapus.",
  "The engine listens on 127.0.0.1 and is not reachable from other machines.": "Engine hanya mendengarkan di 127.0.0.1 dan tidak bisa diakses dari mesin lain.",
  "The engine stopped. Retry to continue; finished segments are kept when the server supports ranges.": "Engine berhenti. Coba lagi untuk melanjutkan; segmen yang selesai tetap disimpan saat server mendukung range.",
  "The extension reads media URLs on the page you are viewing so it can offer capture.": "Ekstensi membaca URL media di halaman yang kamu buka agar bisa menawarkan tangkapan.",
  "The media shortcut lives in the extension and can be changed at chrome://extensions/shortcuts.": "Pintasan media ada di ekstensi dan bisa diubah di chrome://extensions/shortcuts.",
  "The QRIS code is generated on this PC from the merchant code. Arus never sees or stores payment details.": "Kode QRIS dibuat di PC ini dari kode merchant. Arus tidak pernah melihat atau menyimpan data pembayaran.",
  "the queue picks it up automatically.": "antrean mengambilnya otomatis.",
  "The release feed is unreachable right now.": "Feed rilis tidak bisa dijangkau saat ini.",
  "The request timed out.": "Permintaan habis waktu.",
  "The scanner reads the page markup for video, audio, and HLS sources.": "Pemindai membaca markup halaman untuk sumber video, audio, dan HLS.",
  "The scanner reads the page markup for video, audio, HLS, and DASH sources.": "Pemindai membaca markup halaman untuk sumber video, audio, HLS, dan DASH.",
  "Theme": "Tema",
  "There is no automatic telemetry, analytics, account system, or cloud sync. Only a bug report you send yourself leaves this PC.": "Tidak ada telemetri otomatis, analitik, sistem akun, atau sinkronisasi cloud. Hanya laporan bug yang kamu kirim sendiri yang keluar dari PC ini.",
  "This cannot be undone.": "Ini tidak bisa dibatalkan.",
  "This policy ships with the app and changes when the app changes.": "Kebijakan ini ikut dibawa aplikasi dan berubah bersama aplikasi.",
  "This removes the entry and any partial data from Arus.": "Ini menghapus entri dan data sebagian dari Arus.",
  "This removes the entry from Arus.": "Ini menghapus entri dari Arus.",
  "This removes the entry from Arus. The downloaded file stays on disk unless you choose to delete it.": "Ini menghapus entri dari Arus. File yang sudah diunduh tetap di disk kecuali kamu memilih untuk menghapusnya.",
  "This stream is not supported": "Stream ini tidak didukung",
  "Throughput": "Laju data",
  "Tip amount in rupiah": "Nominal dukungan dalam rupiah",
  "Total download speed": "Total kecepatan unduhan",
  "Tracking since": "Terhitung sejak",
  "Try again": "Coba lagi",
  "Turn off interface animations and pulsing live indicators.": "Matikan animasi antarmuka dan indikator aktif yang berdenyut.",
  "Turn on Developer mode, then choose Load unpacked.": "Aktifkan Developer mode, lalu pilih Load unpacked.",
  "Type": "Jenis",
  "Types": "Jenis",
  "Unlimited": "Tanpa batas",
  "Unsupported": "Tidak didukung",
  "Up to 50 unique links per import. Each line becomes its own download.": "Maksimal 50 tautan unik per impor. Tiap baris menjadi unduhan tersendiri.",
  "Updates": "Pembaruan",
  "use": "pakai",
  "Use": "Pakai",
  "Version": "Versi",
  "Video": "Video",
  "video + audio": "video + audio",
  "waiting": "menunggu",
  "Waiting": "Menunggu",
  "Waiting for a free slot.": "Menunggu slot kosong.",
  "Waiting for the extension": "Menunggu ekstensi",
  "Watch clipboard": "Pantau papan klip",
  "Web page": "Halaman web",
  "What Arus stores": "Yang disimpan Arus",
  "What happened?": "Apa yang terjadi?",
  "Where files go and how the engine behaves.": "Ke mana file disimpan dan bagaimana engine bekerja.",
  "Window and startup": "Jendela dan startup",
  "Working…": "Bekerja…",
  "You can repeat this later under Settings, then Capture.": "Kamu bisa mengulanginya nanti di Pengaturan, lalu Tangkap."
};
  Object.assign(DICT, {
    'Language': 'Bahasa',
    'Applies to the whole app right away.': 'Langsung berlaku untuk seluruh aplikasi.',
    'Download complete': 'Unduhan selesai',
    'Downloading': 'Mengunduh',
    'Downloading…': 'Mengunduh…'
  });

  const RULES = [
    [/^(\d+)\s+waiting$/i, '$1 menunggu'],
    [/^(\d+)\s+active$/i, '$1 aktif'],
    [/^(\d+)\s+queued$/i, '$1 mengantre'],
    [/^(\d+)\s+slots$/i, '$1 slot'],
    [/^(\d+)\s+files?$/i, '$1 file'],
    [/^(\d+)\s+downloads?$/i, '$1 unduhan'],
    [/^(\d+)\s+in library$/i, '$1 di koleksi'],
    [/^([\d.,]+\s*(?:B|KB|MB|GB|TB)) in library$/i, '$1 di koleksi'],
    [/^(\d+)\s+scheduled$/i, '$1 terjadwal'],
    [/^(\d+)\s+paused$/i, '$1 dijeda'],
    [/^(\d+)\s+items?$/i, '$1 item'],
    [/^(\d+)\s+need(?:s)? attention$/i, '$1 perlu perhatian'],
    [/^(\d+)\s+lifetime files?$/i, '$1 file sepanjang waktu'],
    [/^(\d+)\s+match(?:es)? for “(.+)”$/i, '$1 hasil untuk “$2”'],
    [/^(\d+)\s+downloads? · (.+) completed$/i, '$1 unduhan · $2 selesai'],
    [/^(\d+)\s+downloading · (\d+) queued$/i, '$1 mengunduh · $2 mengantre'],
    [/^(\d+)\s+active · (\d+) queued$/i, '$1 aktif · $2 mengantre'],
    [/^(\d+)\s+active · (\d+) waiting$/i, '$1 aktif · $2 menunggu'],
    [/^(\d+)\s+file(?:s)? · (.+)$/i, '$1 file · $2'],
    [/^(\d+)\s+segments$/i, '$1 segmen'],
    [/^(\d+)\s*\/\s*(\d+) segments$/i, '$1 / $2 segmen'],
    [/^last (\d+) s$/i, '$1 dtk terakhir'],
    [/^peak (.*)$/i, 'puncak $1'],
    [/^(.+) cap$/i, 'batas $1'],
    [/^(\d+)s left$/i, '$1 dtk tersisa'],
    [/^<1s left$/i, 'kurang dari 1 dtk'],
    [/^(\d+)m (\d+)s left$/i, '$1 mnt $2 dtk tersisa'],
    [/^(\d+)h (\d+)m left$/i, '$1 jam $2 mnt tersisa'],
    [/^(.+) left$/i, 'tersisa $1'],
    [/^(.+) downloaded$/i, '$1 diunduh'],
    [/^in (\d+[smhd])$/i, 'dalam $1'],
    [/^try (\d+)$/i, 'percobaan $1'],
    [/^today at (.+)$/i, 'hari ini pukul $1'],
    [/^tomorrow at (.+)$/i, 'besok pukul $1'],
    [/^just now$/i, 'baru saja'],
    [/^yesterday$/i, 'kemarin'],
    [/^(\d+)s ago$/i, '$1 dtk lalu'],
    [/^(\d+)m ago$/i, '$1 mnt lalu'],
    [/^(\d+)h ago$/i, '$1 jam lalu'],
    [/^(\d+\.\d+\.\d+) is available$/i, '$1 tersedia'],
    [/^Arus (\d+\.\d+\.\d+) is available$/i, 'Arus $1 tersedia'],
    [/^You are on (\d+\.\d+\.\d+)\. Download the new installer from GitHub\.$/i, 'Kamu memakai $1. Unduh installer baru dari GitHub.'],
    [/^Version (\d+\.\d+\.\d+) is the latest\.( Checked at .+\.)?$/i, 'Versi $1 adalah yang terbaru.$2'],
    [/^Version (\d+\.\d+\.\d+) is ready\. Open Arus to download it\.$/i, 'Versi $1 siap. Buka Arus untuk mengunduhnya.'],
    [/^Checking at (.+)$/i, 'Dicek pukul $1'],
    [/^Checked at (.+)$/i, 'Dicek pukul $1'],
    [/^(\d+\.\d+\.\d+), (windows|macos|linux) (x86_64|aarch64), (\d+) recent logs?\. Links, folder paths, and URL tokens are removed\.$/i, '$1, $2 $3, $4 log terakhir. Tautan, path folder, dan token URL dihapus.'],
    [/^Arus (\d+\.\d+\.\d+), (windows|macos|linux) (x86_64|aarch64), (\d+) recent logs?\. Links, folder paths, and URL tokens are removed\.$/i, 'Arus $1, $2 $3, $4 log terakhir. Tautan, path folder, dan token URL dihapus.'],
    [/^Completed just now$/i, 'Selesai baru saja'],
    [/^Completed (\d+)s ago$/i, 'Selesai $1 dtk lalu'],
    [/^Completed (\d+)m ago$/i, 'Selesai $1 mnt lalu'],
    [/^Completed (\d+)h ago$/i, 'Selesai $1 jam lalu'],
    [/^Completed today at (.+)$/i, 'Selesai hari ini pukul $1'],
    [/^Completed tomorrow at (.+)$/i, 'Selesai besok pukul $1'],
    [/^Completed yesterday$/i, 'Selesai kemarin'],
    [/^Completed (.+)$/i, 'Selesai $1'],
    [/^Starts today at (.+)$/i, 'Mulai hari ini pukul $1'],
    [/^Starts tomorrow at (.+)$/i, 'Mulai besok pukul $1'],
    [/^Starts (.+)$/i, 'Mulai $1'],
    [/^Waiting for a slot$/i, 'Menunggu slot'],
    [/^(\d+) simultaneous downloads allowed\.?$/i, 'maksimal $1 unduhan bersamaan'],
    [/^Paused at (\d+)%$/i, 'Dijeda di $1%'],
    [/^(.+) saved so far$/i, '$1 tersimpan sejauh ini'],
    [/^([\d.,]+\s*(?:B|KB|MB|GB|TB)) of ([\d.,]+\s*(?:B|KB|MB|GB|TB))$/i, '$1 dari $2'],
    [/^(\d+) of (\d+) segments complete$/i, '$1 dari $2 segmen selesai'],
    [/^(\d+) of (\d+) segments$/i, '$1 dari $2 segmen'],
    [/^(\d+) connections$/i, '$1 koneksi']
  ];

  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  let current = 'en';
  let mo = null;
  const titleSource = typeof document !== 'undefined' ? document.title : '';
  const nodeSource = new WeakMap();
  const nodeApplied = new WeakMap();
  const attrSource = new WeakMap();
  const attrApplied = new WeakMap();

  function normalize(text) {
    return String(text).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function ruleTranslation(text) {
    for (const [pattern, replacement] of RULES) {
      if (pattern.test(text)) return text.replace(pattern, replacement);
    }
    return null;
  }

  function translateString(value) {
    const raw = String(value);
    if (!raw || !/[A-Za-z]/.test(raw)) return raw;
    const leading = raw.match(/^\s*/)[0];
    const trailing = raw.match(/\s*$/)[0];
    const core = normalize(raw);
    if (!core) return raw;
    if (Object.prototype.hasOwnProperty.call(DICT, core)) return leading + DICT[core] + trailing;
    const ruled = ruleTranslation(core);
    return ruled === null ? raw : leading + ruled + trailing;
  }

  function shouldSkip(node) {
    const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!parent || !parent.closest) return false;
    return Boolean(parent.closest('script, style, textarea, pre, code, [data-no-i18n], [translate="no"], [contenteditable="true"]'));
  }

  function translateNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || shouldSkip(node)) return;
    let source = nodeSource.get(node);
    if (source === undefined) {
      source = node.nodeValue;
      nodeSource.set(node, source);
    } else if (node.nodeValue !== source && node.nodeValue !== nodeApplied.get(node)) {
      source = node.nodeValue;
      nodeSource.set(node, source);
    }
    if (current === 'en') {
      if (node.nodeValue !== source) node.nodeValue = source;
      return;
    }
    const translated = translateString(source);
    if (node.nodeValue !== translated) {
      node.nodeValue = translated;
      nodeApplied.set(node, translated);
    }
  }

  function shouldSkipAttrs(node) {
    const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!parent || !parent.closest) return false;
    return Boolean(parent.closest('[data-no-i18n], [translate="no"], [contenteditable="true"]'));
  }

  function translateElementAttrs(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || shouldSkipAttrs(element)) return;
    let sources = attrSource.get(element);
    for (const name of ATTRS) {
      if (!element.hasAttribute(name)) continue;
      if (!sources) {
        sources = {};
        attrSource.set(element, sources);
      }
      if (!Object.prototype.hasOwnProperty.call(sources, name)) sources[name] = element.getAttribute(name);
      const appliedMap = attrApplied.get(element) || {};
      const value = element.getAttribute(name);
      if (value !== sources[name] && value !== appliedMap[name]) sources[name] = value;
      if (current === 'en') {
        if (element.getAttribute(name) !== sources[name]) element.setAttribute(name, sources[name]);
        continue;
      }
      const translated = translateString(sources[name]);
      if (element.getAttribute(name) !== translated) {
        element.setAttribute(name, translated);
        appliedMap[name] = translated;
        attrApplied.set(element, appliedMap);
      }
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateElementAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) translateNode(node);
    if (root.querySelectorAll) {
      for (const element of root.querySelectorAll(ATTRS.map((name) => `[${name}]`).join(','))) {
        translateElementAttrs(element);
      }
    }
  }

  function onMutations(records) {
    if (current !== 'id') return;
    for (const record of records) {
      if (record.type === 'characterData') {
        const node = record.target;
        if (nodeApplied.get(node) === node.nodeValue) continue;
        nodeSource.set(node, node.nodeValue);
        translateNode(node);
      } else if (record.type === 'childList') {
        for (const node of record.addedNodes) translateTree(node);
      } else if (record.type === 'attributes') {
        const element = record.target;
        const attr = record.attributeName;
        if (!ATTRS.includes(attr)) continue;
        const applied = attrApplied.get(element);
        if (applied && applied[attr] === element.getAttribute(attr)) continue;
        let sources = attrSource.get(element);
        if (!sources) {
          sources = {};
          attrSource.set(element, sources);
        }
        sources[attr] = element.getAttribute(attr) ?? '';
        translateElementAttrs(element);
      }
    }
  }

  function updatePickers() {
    for (const button of document.querySelectorAll('[data-lang-value]')) {
      const active = button.getAttribute('data-lang-value') === current;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    document.documentElement.lang = current === 'en' ? 'en' : 'id';
  }

  function apply(root) {
    translateTree(root || document.body);
    document.title = current === 'id' ? translateString(titleSource) : titleSource;
    updatePickers();
  }

  function setLanguage(next, options) {
    const value = next === 'id' ? 'id' : 'en';
    if (value === current) {
      updatePickers();
      return;
    }
    current = value;
    if (!options || options.persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, value); } catch (error) { /* storage can be unavailable */ }
    }
    apply(document.body);
    document.documentElement.lang = value === 'en' ? 'en' : 'id';
    document.dispatchEvent(new CustomEvent('arus:languagechange', { detail: { lang: value } }));
  }

  function initialLanguage() {
    let saved = '';
    try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch (error) { /* ignore */ }
    if (saved === 'id' || saved === 'en') return saved;
    return String(navigator.language || '').toLowerCase().startsWith('id') ? 'id' : 'en';
  }

  function bindPickers() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-lang-value]');
      if (!button) return;
      event.preventDefault();
      setLanguage(button.getAttribute('data-lang-value'));
    });
  }

  current = initialLanguage();
  document.documentElement.lang = current === 'en' ? 'en' : 'id';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      apply(document.body);
      bindPickers();
      mo = new MutationObserver(onMutations);
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    });
  } else {
    apply(document.body);
    bindPickers();
    mo = new MutationObserver(onMutations);
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  window.ArusLang = {
    get current() { return current; },
    get locale() { return current === 'id' ? 'id-ID' : 'en-US'; },
    set: setLanguage,
    apply,
    t: (value) => (current === 'id' ? translateString(value) : value),
    translate: translateString
  };
})();

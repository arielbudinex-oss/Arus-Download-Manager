(function () {
  'use strict';

  const STORAGE_KEY = 'arus.site.lang';
  const DICT = {
  "1–32 koneksi": "1–32 connections",
  "300 MB ke atas": "300 MB and up",
  "Angka Arus diukur pada rilis 1.0.1 di Windows 11. Angka pembanding adalah kisaran umum aplikasi sejenis, bukan benchmark resmi.": "Arus figures were measured on release 1.0.1 on Windows 11. The comparison figures are typical ranges for similar apps, not an official benchmark.",
  "Angka pembanding.": "Comparison figures.",
  "Antarmuka web ringan": "Lightweight web interface",
  "Apakah Arus benar-benar gratis?": "Is Arus really free?",
  "Apakah Arus mengecek versi terbaru?": "Does Arus check for new versions?",
  "Apakah ekstensi browser otomatis terpasang?": "Does the browser extension install automatically?",
  "Apakah perlu memasang ffmpeg?": "Do I need to install ffmpeg?",
  "Apakah popup dukungan muncul terus?": "Does the support popup keep appearing?",
  "Apakah unduhan bisa dilanjutkan?": "Can downloads be resumed?",
  "Aplikasi Electron": "Electron apps",
  "Arus gratis. Kalau berguna, boleh traktir kopi.": "Arus is free. If it is useful to you, you can buy me a coffee.",
  "Arus membaca manifest HLS atau DASH, mengunduh segmennya, lalu menggabungkannya dengan ffmpeg yang sudah terpasang.": "Arus reads the HLS or DASH manifest, downloads the segments, then joins them with the ffmpeg already installed on your machine.",
  "Arus membagi file menjadi beberapa bagian dan mengunduhnya bersamaan, lalu menulis hasilnya langsung ke disk. UI memakai WebView2 yang sudah ada di Windows, jadi installer sekitar 4,1 MB dan RAM idle sekitar 19 MB.": "Arus splits a file into several parts and downloads them at the same time, then writes the result straight to disk. The UI uses WebView2, which is already part of Windows, so the installer is about 4.1 MB and idle RAM is around 19 MB.",
  "Arus tidak memiliki telemetri otomatis. Riwayat unduhan, pengaturan, dan statistik tersimpan lokal di folder data aplikasi di PC-mu. Koneksi keluar hanya terjadi saat mengunduh, memindai halaman, mengecek rilis ke GitHub, dan saat kamu sendiri mengirim laporan bug. Pengecekan rilis bisa dimatikan.": "Arus has no automatic telemetry. Download history, settings, and statistics are stored locally in the app data folder on your PC. Arus only connects out when downloading, scanning a page, checking for releases on GitHub, and when you send a bug report yourself. Release checks can be turned off.",
  "Arus tidak mengambil stream dari situs yang memproteksi kontennya. Fitur seperti itu melanggar ketentuan platform, jadi tidak akan ditambahkan. Gunakan Arus untuk file yang memang boleh kamu unduh.": "Arus does not capture streams from sites that protect their content. That kind of feature violates platform terms, so it will not be added. Use Arus for files you are allowed to download.",
  "Arus tidak punya iklan, langganan, atau fitur berbayar. Kalau kamu ingin mendukung pengembangan berikutnya, bisa lewat QRIS dengan nominal bebas.": "Arus has no ads, subscriptions, or paid features. If you want to support the next round of development, you can do it through QRIS with any amount you like.",
  "Arus · Download manager Rust untuk Windows": "Arus · Rust download manager for Windows",
  "Aspek": "Aspect",
  "Bagaimana cara melaporkan bug?": "How do I report a bug?",
  "Banyak aplikasi desktop membawa Chromium sendiri agar tampilannya seragam. Arus memakai WebView2 yang sudah terpasang di Windows, jadi tidak perlu browser kedua. Engine Rust menangani koneksi dan penulisan file di belakangnya.": "Many desktop apps bundle their own Chromium so the interface looks the same everywhere. Arus uses WebView2, which is already installed on Windows, so there is no need for a second browser. A Rust engine handles connections and file writes behind it.",
  "Batas kecepatan": "Speed limits",
  "Batasi kecepatan untuk semua unduhan atau satu per satu. Berguna saat sedang meeting atau ada orang lain yang memakai jaringan.": "Limit the speed of all downloads or a single one. Useful during a meeting or when someone else is using the network.",
  "Bervariasi": "Varies",
  "Bisa. Arus memeriksa rilis lebih baru saat dibuka, tiap 6 jam selama berjalan, dan saat kamu menekan Check now. Pengecekan otomatis bisa dimatikan di Behaviour. Kalau ada versi baru, Arus menampilkan dialog pembaruan dengan tombol ke halaman unduhan.": "Yes. Arus checks for newer releases at launch, every 6 hours while running, and when you press Check now. Automatic checks can be turned off in Behaviour. When a new version is available, Arus shows an update dialog with a button to the download page.",
  "Buka Settings, lalu About, dan pilih Report a bug. Tulis apa yang terjadi dan tekan Send. Arus melampirkan versi aplikasi, versi Windows, ringkasan pengaturan, dan log error terakhir. Link unduhan, path folder, dan token URL dibersihkan dulu. Laporan masuk ke server arus.xinet.id dan hanya bisa dibaca pemilik. Tidak ada laporan yang terkirim otomatis.": "Open Settings, then About, and choose Report a bug. Describe what happened and press Send. Arus attaches the app version, the Windows version, a summary of your settings, and the last error log. Download links, folder paths, and URL tokens are stripped first. Reports go to the arus.xinet.id server and can only be read by the owner. Nothing is ever sent automatically.",
  "Bukan produk IDM dan tidak berafiliasi dengan Internet Download Manager.": "Not an IDM product and not affiliated with Internet Download Manager.",
  "bintang": "stars",
  "Chrome dan Edge tidak mengizinkan pemasangan senyap. Karena itu Arus menampilkan panduan sekali saat pertama dibuka: buka halaman ekstensi, aktifkan Developer mode, pilih Load unpacked, lalu arahkan ke folder ekstensi. Setelah itu browser mengingatnya. Langkah ini opsional.": "Chrome and Edge do not allow silent installs. So Arus shows a guide once, the first time you open it: open the extensions page, turn on Developer mode, choose Load unpacked, then point it at the extension folder. The browser remembers it after that. This step is optional.",
  "Coba Arus di Windows.": "Try Arus on Windows.",
  "Contoh Rp 25.000": "Example Rp 25.000",
  "Data ditulis sambil diunduh, bukan ditampung di RAM. Mengunduh file ISO 5 GB tidak membuat pemakaian memori ikut naik.": "Data is written as it downloads instead of being buffered in RAM. Downloading a 5 GB ISO does not make memory use climb with it.",
  "Data saya dikirim ke mana?": "Where is my data sent?",
  "Ditulis bertahap, RAM tidak membengkak": "Written in stages, RAM stays flat",
  "Dirilis 12 November 2026": "Released November 12, 2026",
  "Download manager untuk Windows. Dibuat dengan Rust dan Tauri.": "A download manager for Windows. Built with Rust and Tauri.",
  "Dukungan": "Support",
  "Dukungan QRIS": "QRIS support",
  "Dukung lewat QRIS": "Support via QRIS",
  "Ekstensi browser": "Browser extension",
  "Ekstensi browser dan clipboard": "Browser extension and clipboard",
  "Ekstensi untuk Chrome dan Edge menangkap tautan unduhan. Saat Arus pertama dibuka, panduan pemasangan muncul sekali. Kalau dilewati, cukup salin URL dan Arus tetap menawarkannya.": "Extensions for Chrome and Edge capture download links. The first time you open Arus, the setup guide appears once. If you skip it, just copy the URL and Arus will still offer it.",
  "Electron mengemas Chromium dan Node ke dalam aplikasinya. Arus hanya memakai WebView2 yang sudah ada, sehingga installer dan pemakaian memori jauh lebih kecil.": "Electron packs Chromium and Node into the app itself. Arus only uses WebView2, which is already there, so the installer and memory use are much smaller.",
  "Engine terpisah di Rust": "A separate engine in Rust",
  "Fitur": "Features",
  "Fitur yang paling sering dipakai saat mengunduh file besar, dari pemecahan koneksi sampai pemeriksaan file.": "The features used most often when downloading large files, from splitting connections to verifying the file.",
  "Gabung Discord": "Join Discord",
  "Gunakan untuk konten yang kamu berhak unduh.": "Use it for content you have the right to download.",
  "HLS & DASH": "HLS & DASH",
  "HLS dan DASH": "HLS and DASH",
  "Hanya untuk HLS dan DASH. Arus mendeteksi ffmpeg yang sudah terpasang dan memakainya untuk menggabungkan segmen. Unduhan file biasa tidak memerlukan ffmpeg.": "Only for HLS and DASH. Arus detects an installed ffmpeg and uses it to join the segments. Regular file downloads do not need ffmpeg.",
  "Ikut mengembangkan Arus.": "Help build Arus.",
  "Installer 4,1 MB untuk Windows 10/11 64-bit. Tidak perlu akun.": "A 4.1 MB installer for Windows 10/11 64-bit. No account needed.",
  "Itu tawaran dukungan yang muncul setelah unduhan dimulai. Sifatnya opsional. Tutup dengan tombol Selesai atau Esc; unduhan tetap berjalan.": "That is the support offer that appears after a download starts. It is optional. Close it with Done or Esc; the download keeps running.",
  "Jadwal dan antrean": "Scheduling and queues",
  "Jadwal dan prioritas": "Scheduling and priority",
  "Jadwal unduhan": "Download scheduling",
  "Jadwalkan unduhan untuk jam tertentu, batasi jumlah yang berjalan bersamaan, dan atur urutannya.": "Schedule downloads for a specific time, limit how many run at once, and set their order.",
  "Jarang": "Rarely",
  "Kalau server mendukung range request, file dipecah menjadi beberapa bagian dan diunduh bersamaan. Satu koneksi yang lambat tidak menghentikan bagian lain.": "If the server supports range requests, the file is split into parts and downloaded at the same time. One slow connection does not hold up the other parts.",
  "Kenapa Arus bisa tetap kecil.": "Why Arus stays small.",
  "Kenapa YouTube dan situs berproteksi tidak didukung?": "Why are YouTube and protected sites not supported?",
  "Kenapa ada popup setelah saya menekan unduh?": "Why is there a popup after I press download?",
  "Kenapa ringan": "Why it's lightweight",
  "Klik untuk ubah nominal": "Click to change the amount",
  "Kode dan diskusi terbuka. Laporkan bug di GitHub, atau mampir ke Discord kalau ingin bertanya.": "Code and discussion in the open. Report bugs on GitHub, or drop by Discord if you have questions.",
  "Kode sumber": "Source code",
  "Kode sumber, rilis, dan issue tracker.": "Source code, releases, and issue tracker.",
  "Komunitas": "Community",
  "Komunitas terbuka": "Open community",
  "Koneksi paralel, antrean, dan penulisan file dijalankan oleh proses Rust. UI hanya mengirim perintah dan menampilkan progres.": "Parallel connections, queues, and file writes run in a Rust process. The UI only sends commands and shows progress.",
  "kali diunduh": "times downloaded",
  "unduhan installer": "installer downloads",
  "Langsung ke konten": "Skip to content",
  "Laporkan bug": "Report a bug",
  "Lisensi MIT": "MIT license",
  "Lisensi pihak ketiga": "Third-party licenses",
  "Memakai WebView2 milik Windows": "Uses the WebView2 that ships with Windows",
  "Menghitung unduhan…": "Counting downloads…",
  "Menulis langsung ke disk": "Writes straight to disk",
  "Multi-koneksi": "Multi-connection",
  "Multikoneksi": "Multi-connection",
  "Nominal bebas, minimal Rp 1.000.": "Any amount from Rp 1,000.",
  "Nominal dukungan": "Support amount",
  "Nominal yang kamu pilih dimasukkan ke kode QR. Arus tidak menyimpan data pembayaran. Pembayaran diproses oleh penyedia QRIS dan aplikasi bank atau e-wallet kamu.": "The amount you choose is encoded in the QR code. Arus does not store payment data. Payment is processed by the QRIS provider and your bank or e-wallet app.",
  "Pembayaran diproses oleh aplikasi bank atau e-wallet kamu. Arus tidak melihat data pembayaran.": "Payment is processed by your bank or e-wallet app. Arus does not see your payment data.",
  "Pertanyaan yang sering muncul.": "Frequently asked questions.",
  "Popup muncul di pojok saat unduhan berjalan atau selesai, lalu menutup sendiri. Tampilannya bisa diatur lewat pengaturan notifikasi.": "A popup appears in the corner while a download runs or finishes, then closes on its own. How it looks can be set in the notification settings.",
  "Popup progres yang singkat": "A short progress popup",
  "Produk": "Product",
  "RAM idle": "Idle RAM",
  "RAM saat idle": "RAM when idle",
  "Rilis 1.1.1": "Release 1.1.1",
  "Ringan": "Lightweight",
  "Saat tidak ada unduhan, Arus hanya menunggu di tray. CPU hampir nol, dan popup hanya muncul untuk unduhan yang sedang berjalan.": "When nothing is downloading, Arus just waits in the tray. CPU use is close to zero, and popups only appear for downloads that are running.",
  "Satu file, banyak koneksi": "One file, many connections",
  "Scan dengan aplikasi bank atau e-wallet yang mendukung QRIS.": "Scan with a bank or e-wallet app that supports QRIS.",
  "Sebagian": "Partly",
  "Segmen, antrean, HLS/DASH, hash": "Segments, queues, HLS/DASH, hashes",
  "Selesai": "Done",
  "Semua rilis": "All releases",
  "Setelah unduhan selesai, Arus menghitung SHA-256 file agar bisa kamu cocokkan dengan nilai dari situs sumber.": "When a download finishes, Arus computes the file's SHA-256 so you can compare it with the value from the source site.",
  "Simpan gambar QR": "Save QR image",
  "Situs ini mencatat statistik kunjungan sederhana: halaman yang dibuka, tombol yang diklik, alamat IP, dan perkiraan wilayah. Tidak ada cookie iklan.": "This site keeps simple visit statistics: pages opened, buttons clicked, IP address, and approximate region. No advertising cookies.",
  "Streaming ke disk": "Streaming to disk",
  "Tambah ke Arus": "Add to Arus",
  "Tampilan asli Arus. Data pada gambar adalah contoh.": "The real Arus interface. The data in the image is sample data.",
  "Tanpa syarat": "No strings attached",
  "Tanpa telemetri": "No telemetry",
  "Tanya di Discord": "Ask on Discord",
  "Telemetri": "Telemetry",
  "Tempat bertanya dan berdiskusi soal Arus. Terbuka untuk siapa saja.": "A place to ask questions and talk about Arus. Open to everyone.",
  "Tenang saat tidak dipakai": "Quiet when idle",
  "Tidak": "No",
  "Tidak ada": "None",
  "Tidak. Di aplikasi, tawaran dukungan hanya muncul sekali setelah setup selesai. Setelah itu bisa dibuka dari tombol Support Arus. Di website, popup hanya muncul setelah kamu menekan tombol unduh.": "No. In the app, the support offer appears only once after setup is complete. After that you can open it from the Support Arus button. On the website, the popup only appears after you press the download button.",
  "Umumnya ada": "Usually present",
  "Umumnya ya": "Usually yes",
  "Unduh": "Download",
  "Unduh Arus 1.1.1": "Download Arus 1.1.1",
  "Unduh ulang installer": "Download the installer again",
  "Unduh untuk Windows": "Download for Windows",
  "Unduhan dimulai": "Download started",
  "Unduhan installer sudah dimulai. Kalau Arus berguna, kamu bisa memberi dukungan lewat QRIS. Nominalnya bebas dan tidak memengaruhi fitur apa pun.": "The installer download has started. If Arus is useful to you, you can support it through QRIS. The amount is up to you and does not affect any feature.",
  "Verifikasi SHA-256": "SHA-256 verification",
  "WebView2 bawaan Windows": "WebView2 bundled with Windows",
  "Windows 10 dan 11 64-bit dengan WebView2. WebView2 umumnya sudah terpasang di Windows modern, dan installer dapat memasangnya jika belum ada.": "Windows 10 and 11 64-bit with WebView2. WebView2 is usually already installed on modern Windows, and the installer can add it if it is missing.",
  "Windows 10/11 · 64-bit · 4,1 MB": "Windows 10/11 · 64-bit · 4.1 MB",
  "Windows versi apa yang didukung?": "Which Windows versions are supported?",
  "Ya": "Yes",
  "Ya, 1–32": "Yes, 1–32",
  "Ya, selama server sumber mendukung range request. Arus melanjutkan dari bagian yang belum selesai, bukan mengulang dari awal.": "Yes, as long as the source server supports range requests. Arus picks up from the part that did not finish instead of starting over.",
  "Ya. Lisensinya MIT, jadi kamu bisa memakai, mengubah, dan membagikannya. Tidak ada iklan atau fitur berbayar. Dukungan QRIS sifatnya opsional.": "Yes. It is MIT licensed, so you can use, change, and share it. There are no ads or paid features. QRIS support is optional.",
  "Yang bisa dilakukan Arus.": "What Arus can do.",
  "bebas dipakai dan diubah": "free to use and change",
  "ffmpeg terdeteksi otomatis": "ffmpeg detected automatically",
  "koneksi paralel, bisa diatur sampai 32": "parallel connections, adjustable up to 32",
  "telemetri otomatis yang dikirim": "automatic telemetry sent",
  "unduhan": "downloads",
  "untuk Windows.": "for Windows.",
  "© 2026 Arus. Sumber terbuka di bawah lisensi MIT.": "© 2026 Arus. Open source under the MIT license.",
  "Angka Arus": "Arus in numbers",
  "Arsitektur Arus: UI WebView2, engine Rust, dan penulisan langsung ke disk": "Arus architecture: WebView2 UI, Rust engine, and direct writes to disk",
  "Arus di GitHub": "Arus on GitHub",
  "Arus, kembali ke atas": "Arus, back to top",
  "Buka dukungan QRIS dengan nominal bebas": "Open QRIS support with a custom amount",
  "Buka menu": "Open menu",
  "Komunitas Discord Arus": "Arus Discord community",
  "Navigasi seluler": "Mobile navigation",
  "Navigasi utama": "Main navigation",
  "Nominal dukungan dalam rupiah": "Support amount in rupiah",
  "Pilih nominal cepat": "Choose a quick amount",
  "Tutup dialog": "Close dialog",
  "Maksimal Rp 50.000.": "Maximum Rp 50,000.",
  "Minimal Rp 1.000.": "Minimum Rp 1,000.",
  "QR tidak tersedia": "QR code unavailable"
};

  Object.assign(DICT, {
    'Terima kasih sudah mengunduh Arus.': 'Thanks for downloading Arus.',
    'Installer Arus mulai diunduh. Semoga aplikasinya membantu pekerjaanmu.': 'The Arus installer is downloading now. Hope it helps with your work.',
    'Kalau mau, kamu bisa traktir kopi untuk mendukung pengembangan berikutnya. Nominal bebas, dan semua fitur tetap gratis.': 'If you like, you can buy me a coffee to support the next round of development. Any amount, and every feature stays free.',
    'Dukung Arus': 'Support Arus',
    'Nanti saja': 'Maybe later',
    'Kembali': 'Back',
    'Nominal bebas, mulai Rp 1.000. Kode QR mengikuti nominal yang kamu pilih.': 'Any amount from Rp 1,000. The QR code follows the amount you choose.',
    'Download manager untuk Windows': 'Download manager for Windows',
    'Tidak membawa bundel Chromium': 'No bundled Chromium',
    'Tampilan Arus: antrean unduhan dengan satu transfer aktif, kartu throughput, dan riwayat unduhan selesai.': 'Arus interface: download queue with one active transfer, a throughput card, and finished download history.',
    'Rp 10 rb': 'Rp 10k',
    'Rp 25 rb': 'Rp 25k',
    'Rp 50 rb': 'Rp 50k',
    'Rp 100 rb': 'Rp 100k',
    'Rp 25.000': 'Rp 25,000',
    'Contoh Rp 25.000': 'Example Rp 25,000',
    'Maksimal Rp 50.000.000.': 'Maximum Rp 50,000,000.'
  });

  Object.assign(DICT, {
    /* interactive transfer study */
    'Tangkapan layar antarmuka Arus': 'Screenshot of the Arus interface',
    'Kenapa Arus tetap kecil.': 'Why Arus stays small.',
    'Di balik satu unduhan': 'Inside a download',
    'Satu bagian lambat.': 'One part slows down.',
    'Yang lain tetap jalan.': 'The others keep going.',
    'Empat koneksi mengambil bagian berbeda dari file yang sama. Setiap bagian langsung ditulis ke posisinya di disk, tanpa menunggu koneksi lain.': 'Four connections fetch different parts of the same file. Each part writes straight to its position on disk, without waiting for the other connections.',
    'Jalankan simulasi': 'Run simulation',
    'Jeda simulasi': 'Pause simulation',
    'Lanjutkan simulasi': 'Resume simulation',
    'Ulangi simulasi': 'Replay simulation',
    'Tampilkan hasil': 'Show result',
    'Perlambat koneksi 02': 'Slow down connection 02',
    'Simulasi · bukan uji kecepatan': 'Simulation · not a speed test',
    'Ditulis ke disk': 'Written to disk',
    'Butuh dukungan range request. Kecepatan nyata bergantung pada server dan jaringan, bukan hanya jumlah koneksi.': 'Requires range request support. Actual speed depends on the server and network, not just the number of connections.',
    'Siap. Coba perlambat satu koneksi.': 'Ready. Try slowing down one connection.',
    'Selesai. Semua bagian sudah ditulis ke disk.': 'Complete. All parts have been written to disk.',
    '01, 03, 04 selesai. Hanya koneksi 02 yang masih berjalan.': '01, 03, 04 are done. Only connection 02 is still running.',
    'Cuplikan: 01, 03, 04 selesai; 02 masih setengah jalan.': 'Snapshot: 01, 03, 04 are done; 02 is still halfway through.',
    'Dijeda. Progres setiap bagian tetap tersimpan.': 'Paused. Each part keeps its progress.',
    'Empat bagian diunduh dan ditulis bersamaan.': 'Four parts are downloading and writing at the same time.',
    'Koneksi 02 diperlambat. Tiga bagian lain tidak terpengaruh.': 'Connection 02 is slower. The other three parts are unaffected.',
    'Keempat koneksi berjalan tanpa perlambatan tambahan.': 'All four connections run without an added slowdown.',

    /* hero */
    'File besar,': 'Big files,',
    'tanpa bikin PC berat.': 'without slowing your PC.',
    'Arus memecah file menjadi beberapa bagian, mengunduhnya bersamaan, lalu menulis langsung ke disk. Installer cukup 4,1 MB karena antarmuka memakai WebView2 yang sudah ada di Windows.': 'Arus splits a file into parts, downloads them at the same time, then writes straight to disk. The installer is only 4.1 MB because the interface uses the WebView2 that is already part of Windows.',
    'Versi 1.1.1': 'Version 1.1.1',
    'Tanpa akun': 'No account',
    'Antrean unduhan': 'Download queue',
    'Tangkapan layar asli. Data di dalamnya hanya contoh.': 'A real screenshot. The data in it is sample data.',
    'Unduhan installer': 'Installer downloads',
    'Installer': 'Installer',
    'Koneksi paralel': 'Parallel connections',
    'Lisensi': 'License',
    '4,1 MB': '4.1 MB',
    'Angka Arus diukur di Windows 11 64-bit. Kolom lain adalah kisaran umum aplikasi sejenis, bukan benchmark resmi.': 'Arus figures were measured on Windows 11 64-bit. The other columns are typical ranges for similar apps, not an official benchmark.',

    /* use cases */
    'Kapan berguna': 'When it helps',
    'Tiga situasi yang paling sering.': 'Three situations that come up most.',
    'Kalau salah satunya terdengar familiar, bagian ini menjelaskan apa yang Arus lakukan di situasi tersebut.': 'If one of them sounds familiar, this is what Arus does in that situation.',
    'File besar': 'Large files',
    'Jaringan terbatas': 'Limited network',
    'File yang harus utuh': 'Files that must stay intact',
    'ISO, installer game, arsip dataset.': 'ISOs, game installers, dataset archives.',
    'Unduhan besar yang putus di tengah jalan paling menyakitkan. Arus memecah file, mengunduh bagiannya bersamaan, lalu melanjutkan dari bagian terakhir selama server mendukung range request.': 'Large downloads that die halfway are the most painful. Arus splits the file, downloads the parts at the same time, then resumes from the last part as long as the server supports range requests.',
    'Rapat tetap lancar.': 'Meetings stay smooth.',
    'Batasi kecepatan total atau hanya untuk unduhan tertentu, dan tentukan berapa unduhan yang boleh berjalan bersamaan. Bandwidth tidak lagi dihabiskan satu antrean panjang.': 'Limit the total speed or just one download, and decide how many downloads may run at once. A long queue no longer eats all the bandwidth.',
    'Tahu persis isinya tidak berubah.': 'Know exactly that it did not change.',
    'Setelah selesai, Arus menghitung SHA-256 file. Cocokkan dengan nilai dari sumber sebelum file dipakai, dipasang, atau dibagikan ke orang lain.': 'When it finishes, Arus computes the file SHA-256. Compare it with the value from the source before the file is used, installed, or shared.',

    /* features */
    'Yang dipakai setiap hari.': 'What gets used every day.',
    'Bukan daftar fitur untuk halaman promosi. Ini yang muncul saat kamu benar-benar mengunduh file besar.': 'Not a feature list for a promo page. These are the things that show up when you actually download large files.',
    'Kalau server mendukung range request, file dipecah dan diunduh bersamaan. Satu koneksi yang lambat tidak menahan bagian lain.': 'If the server supports range requests, the file is split and downloaded at the same time. One slow connection does not hold up the other parts.',
    'Tentukan jam mulai, batasi unduhan yang berjalan bersamaan, dan atur urutannya.': 'Set a start time, limit how many downloads run at once, and arrange their order.',
    'Atur batas per unduhan atau untuk semuanya. Berguna saat rapat atau saat jaringan dipakai bersama.': 'Set a limit per download or for all of them. Useful during a meeting or when the network is shared.',
    'Arus menghitung hash setelah file selesai, supaya bisa kamu cocokkan dengan nilai dari sumbernya.': 'Arus computes the hash when the file finishes, so you can compare it with the value from the source.',
    'Ekstensi Chrome dan Edge menangkap tautan unduhan. Panduan pemasangan muncul sekali saat Arus pertama dibuka; kalau dilewati, cukup salin URL dan Arus menawarkannya.': 'The Chrome and Edge extensions capture download links. The setup guide appears once when Arus first opens; if you skip it, just copy the URL and Arus will offer it.',
    'Popup di pojok muncul saat unduhan berjalan atau selesai, lalu menutup sendiri. Bisa diatur di preferensi notifikasi.': 'A popup in the corner appears while a download runs or finishes, then closes on its own. It can be adjusted in the notification settings.',
    '1–32 koneksi · range request': '1–32 connections · range requests',
    'Butuh ffmpeg': 'Requires ffmpeg',
    'Jam mulai · batas antrean': 'Start time · queue limit',
    'Global atau per file': 'Global or per file',
    'Setelah unduhan selesai': 'After the download finishes',
    'Tutup otomatis': 'Closes itself',

    /* limits */
    'Batas': 'Limits',
    'Yang tidak Arus lakukan.': 'What Arus does not do.',
    'Batas ini disengaja. Kalau salah satunya justru yang kamu cari, lebih baik tahu sekarang.': 'These limits are intentional. If one of them is exactly what you are looking for, better to know now.',
    'Stream berproteksi': 'Protected streams',
    'Tidak ada unduhan dari YouTube atau situs yang memproteksi kontennya. Fitur seperti itu melanggar ketentuan platform dan tidak akan ditambahkan.': 'There are no downloads from YouTube or sites that protect their content. That kind of feature violates platform terms and will not be added.',
    'Telemetri otomatis': 'Automatic telemetry',
    'Tidak ada laporan pemakaian yang dikirim diam-diam. Arus hanya terhubung keluar saat mengunduh, mengecek rilis, atau saat kamu mengirim laporan bug sendiri.': 'No usage reports are sent quietly. Arus only connects out when downloading, checking for releases, or when you send a bug report yourself.',
    'Akun dan iklan': 'Accounts and ads',
    'Tidak perlu mendaftar, tidak ada iklan, dan tidak ada fitur yang dikunci di balik pembayaran. Dukungan QRIS sepenuhnya opsional.': 'No sign-up, no ads, and no features locked behind a payment. QRIS support is entirely optional.',

    /* community */
    'Dikembangkan terbuka.': 'Built in the open.',
    'Kode, rilis, dan diskusi ada di tempat terbuka. Laporkan bug di GitHub, atau mampir ke Discord kalau ingin bertanya.': 'Code, releases, and discussion are out in the open. Report bugs on GitHub, or drop by Discord if you have questions.',
    'Discord · komunitas': 'Discord · community',
    'Kode sumber dan rilis': 'Source code and releases',
    'Tanya dan diskusi': 'Questions and discussion',
    'Seluruh kode tersedia, termasuk riwayat rilis dan issue tracker.': 'All the code is available, including the release history and issue tracker.',
    'Tempat bertanya soal pemakaian, laporan awal, atau sekadar ngobrol soal download manager.': 'A place to ask about usage, early reports, or just talk about download managers.',
    'Buka GitHub': 'Open GitHub',
    'Terbuka untuk siapa saja': 'Open to everyone',


    /* what's new */
    'Baru': 'New',
    'Apa yang baru': "What's new",
    'Arus 1.1.1: Cek pembaruan yang lebih andal.': 'Arus 1.1.1: More reliable update checks.',
    'Rilis 12 November 2026. Pemeriksaan manual sekarang selalu menanyakan GitHub, dan Arus memeriksa ulang sendiri selama berjalan supaya rilis baru tidak terlewat.': 'Released November 12, 2026. Manual checks now always ask GitHub, and Arus rechecks on its own while running so new releases are not missed.',
    '12 November 2026': 'November 12, 2026',
    'Cek manual selalu ke GitHub': 'Manual checks always reach GitHub',
    'Tombol Check now melewati cache lokal dan langsung menanyakan rilis terbaru, jadi versi yang baru terbit langsung terdeteksi.': 'The Check now button skips the local cache and asks for the latest release directly, so a freshly published version is detected right away.',
    'Pemeriksaan berkala saat berjalan': 'Periodic checks while running',
    'Arus memeriksa ulang tiap 6 jam selama berjalan dan saat jendela dibuka kembali setelah lama di belakang. Kalau update ditemukan ketika jendela tidak aktif, notifikasi Windows muncul.': 'Arus rechecks every 6 hours while running and when the window is reopened after a long time in the background. If an update is found while the window is inactive, a Windows notification appears.',
    'Cache lebih pendek': 'A shorter cache',
    'Hasil pemeriksaan disimpan 15 menit, bukan 6 jam. Rilis baru tidak lagi tertutup hasil pemeriksaan lama.': 'Check results are kept for 15 minutes instead of 6 hours. A new release is no longer hidden by an older result.',
    'Baca catatan rilis': 'Read the release notes',
    'Berbagi folder dari 1.1.0 tetap tersedia. Data pada tangkapan layar hanya contoh.': 'Folder sharing from 1.1.0 is still here. The data in the screenshot is sample data.',
    'Folder foto di tampilan berbagi Arus pada layar HP: breadcrumb, pencarian, filter jenis file, dan tombol unduh.': 'A photo folder in the Arus sharing view on a phone: breadcrumbs, search, a file type filter, and download buttons.',
    'Folder Downloads di perangkat lain': 'Your Downloads folder on another device',
    'Bagikan folder unduhan lewat Wi-Fi lokal. HP atau laptop membuka tautan, menelusuri subfolder, melihat foto, memutar video, dan menyimpan file tanpa mengunggahnya ke internet.': 'Share your Downloads folder over local Wi-Fi. A phone or laptop opens the link, browses subfolders, views photos, plays videos, and saves files without uploading anything to the internet.',
    'Masa akses · kata sandi opsional': 'Access periods · optional password',

    /* closing */
    'Pasang Arus, lalu biarkan ia bekerja.': 'Install Arus, then let it work.',
    'Installer 4,1 MB untuk Windows 10/11 64-bit. Panduan ekstensi muncul sekali setelah dibuka. Tidak ada akun, tidak ada iklan.': 'A 4.1 MB installer for Windows 10/11 64-bit. The extension guide appears once after it opens. No account, no ads.',
    'Versi 1.1.1 · Rilis 12 November 2026': 'Version 1.1.1 · Released November 12, 2026',

    /* footer */
    'Batasan': 'Limits',

    /* guide */
    'Panduan': 'Guide',
    'Isi panduan': 'Guide contents',
    'Dari installer sampai unduhan pertama.': 'From installer to your first download.',
    'Tiga tahap, sekitar tiga menit. Ekstensi hanya perlu dipasang sekali per browser; setelah itu Arus menerima tautan dari halaman yang kamu buka.': 'Three stages, about three minutes. The extension only has to be installed once per browser; after that, Arus accepts links from the pages you open.',
    'Pasang aplikasi': 'Install the app',
    'Sambungkan browser': 'Connect your browser',
    'Unduh pertama': 'First download',
    'Yang perlu disiapkan: Windows 10/11 64-bit. Chrome, Edge, Brave, atau Chromium hanya untuk menangkap media. ffmpeg hanya untuk HLS/DASH.': 'What you need: Windows 10/11 64-bit. Chrome, Edge, Brave, or Chromium only for capturing media. ffmpeg only for HLS/DASH.',
    '±1 menit': '±1 min',
    '±2 menit': '±2 min',
    '±30 detik': '±30 sec',
    'Tekan Unduh untuk Windows di halaman ini. Installer': 'Press Download for Windows on this page. The installer',
    'berukuran sekitar 4,1 MB.': 'is about 4.1 MB.',
    'Jalankan installer. Karena belum ditandatangani, Windows SmartScreen bisa meminta konfirmasi: pilih More info, lalu Run anyway.': 'Run the installer. Because it is not code-signed, Windows SmartScreen may ask for confirmation: choose More info, then Run anyway.',
    'Ikuti proses pemasangan. Setelah selesai, Arus terbuka dan tetap tersedia di tray meski jendelanya ditutup.': 'Follow the setup. When it finishes, Arus opens and stays available in the tray even after you close its window.',
    'Panduan ekstensi muncul sekali setelah setup. Kamu bisa mengikutinya langsung, atau menutupnya dan membuka Pengaturan → Tangkapan browser kapan saja.': 'The extension guide appears once after setup. You can follow it right away, or close it and open Settings → Browser capture whenever you like.',
    'Di Arus, buka Pengaturan → Tangkapan browser. Status di sana menunjukkan apakah ekstensi sudah terdeteksi.': 'In Arus, open Settings → Browser capture. The status there shows whether the extension has been detected.',
    'Klik Buka folder. Folder': 'Click Open folder. The',
    'sudah menyertai aplikasi, jadi tidak ada file terpisah yang perlu diunduh.': 'folder ships with the app, so there is no separate file to download.',
    'Klik Buka halaman ekstensi. Kalau Chrome atau Edge menampilkan pemilihan profil, pilih profil yang biasa dipakai lalu buka': 'Click Open extensions page. If Chrome or Edge shows a profile picker, choose the profile you normally use and open',
    '. Di Edge, alamatnya': '. In Edge, the address is',
    'Aktifkan Developer mode di pojok kanan atas, pilih Load unpacked, lalu arahkan ke folder': 'Turn on Developer mode in the top right corner, choose Load unpacked, then point it at the',
    'tadi.': 'folder.',
    'Kembali ke Arus. Status berubah menjadi Ekstensi tersambung. Kalau belum, tekan tombol periksa sekali lagi.': 'Go back to Arus. The status changes to Extension connected. If it does not, press the check button once more.',
    'Chrome dan Edge tidak mengizinkan pemasangan senyap, jadi langkah ini memang manual. Cukup sekali per browser. Saat Arus diperbarui, klik Reload di halaman ekstensi.': 'Chrome and Edge do not allow silent installs, so this step is manual. Once per browser is enough. When Arus is updated, click Reload on the extensions page.',
    'membuka unduhan baru. Tempel URL, lalu pilih folder simpan.': 'opens a new download. Paste the URL, then choose a save folder.',
    'Atur jumlah koneksi 1–32 dan batas kecepatan bila perlu. Untuk file biasa, pengaturan awal sudah cukup.': 'Set the number of connections (1–32) and a speed limit if you need one. For regular files, the defaults are enough.',
    'Untuk video atau audio, klik tombol ekstensi Unduh dengan Arus, atau arahkan kursor ke media dan tekan': 'For video or audio, click the Download with Arus extension button, or point at the media and press',
    'Menyalin URL juga cukup: Arus menawarkan tautan yang ada di clipboard. Ekstensi dan clipboard sama-sama membutuhkan Arus yang sedang berjalan.': 'Copying the URL also works: Arus offers links found in your clipboard. Both the extension and the clipboard need Arus to be running.',
    'Pantau antrean. Jeda dan Lanjutkan bekerja selama server mendukung range request, jadi unduhan tidak mengulang dari nol.': 'Watch the queue. Pause and Resume work as long as the server supports range requests, so the download does not start over.',
    'Setelah selesai, Arus menghitung SHA-256 dan menampilkan popup singkat. Buka folder dari baris unduhan, atau cocokkan hash dengan nilai dari sumber.': 'When it finishes, Arus computes SHA-256 and shows a brief popup. Open the folder from the download row, or compare the hash with the value from the source.',
    'HLS dan DASH memerlukan ffmpeg untuk menggabungkan segmen. Pintasan lain:': 'HLS and DASH require ffmpeg to join segments. Other shortcuts:',
    'mencari di antrean,': 'searches the queue,',
    'membuka pengaturan.': 'opens settings.'
  });

  const RULES = [
    [/^([\d.,]+) unduhan$/i, '$1 downloads'],
    [/^segmen (\d+)$/i, 'segment $1'],
    [/^Rilis (\d+\.\d+\.\d+)$/i, 'Release $1'],
    [/^Unduh Arus (\d+\.\d+\.\d+)$/i, 'Download Arus $1'],
    [/^(\d+) unduhan$/i, '$1 downloads'],
    [/^Menghitung unduhan…$/i, 'Counting downloads…'],
    [/^Minimal (Rp [\d.]+)\.$/i, 'Minimum $1.'],
    [/^Maksimal (Rp [\d.]+)\.$/i, 'Maximum $1.'],
    [/^Nominal bebas, minimal (Rp [\d.]+)\.$/i, 'Any amount, starting at $1.'],
    [/^QR tidak tersedia$/i, 'QR is not available']
  ];

  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  let current = 'id';
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
    if (current === 'id') {
      if (node.nodeValue !== source) node.nodeValue = source;
      return;
    }
    const translated = translateString(source);
    if (node.nodeValue !== translated) {
      node.nodeValue = translated;
      nodeApplied.set(node, translated);
    }
  }

  function translateElementAttrs(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || shouldSkip(element)) return;
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
      if (current === 'id') {
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
    if (current !== 'en') return;
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
    document.title = current === 'en' ? translateString(titleSource) : titleSource;
    updatePickers();
  }

  function setLanguage(next, options) {
    const value = next === 'en' ? 'en' : 'id';
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
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'id') return saved;
    } catch (error) { /* ignore */ }
    return 'id';
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

  window.ArusSiteLang = {
    get current() { return current; },
    get locale() { return current === 'en' ? 'en-US' : 'id-ID'; },
    set: setLanguage,
    apply,
    t: (value) => (current === 'en' ? translateString(value) : value),
    translate: translateString
  };
})();

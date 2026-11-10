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
  "Arus membagi file menjadi beberapa bagian dan mengunduhnya bersamaan, lalu menulis hasilnya langsung ke disk. UI memakai WebView2 yang sudah ada di Windows, jadi installer sekitar 3,5 MB dan RAM idle sekitar 19 MB.": "Arus splits a file into several parts and downloads them at the same time, then writes the result straight to disk. The UI uses WebView2, which is already part of Windows, so the installer is about 3.5 MB and idle RAM is around 19 MB.",
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
  "Bisa. Setelah dibuka, Arus dapat bertanya ke GitHub apakah ada rilis lebih baru. Pengecekan ini bisa dimatikan di Behaviour. Kalau ada versi baru, Arus menampilkan tombol untuk membuka halaman unduhan.": "Yes. After it starts, Arus can ask GitHub whether a newer release exists. This check can be turned off in Behaviour. When a new version is available, Arus shows a button that opens the download page.",
  "Buka Settings, lalu About, dan pilih Report a bug. Tulis apa yang terjadi dan tekan Send. Arus melampirkan versi aplikasi, versi Windows, ringkasan pengaturan, dan log error terakhir. Link unduhan, path folder, dan token URL dibersihkan dulu. Laporan masuk ke server arus.xinet.id dan hanya bisa dibaca pemilik. Tidak ada laporan yang terkirim otomatis.": "Open Settings, then About, and choose Report a bug. Describe what happened and press Send. Arus attaches the app version, the Windows version, a summary of your settings, and the last error log. Download links, folder paths, and URL tokens are stripped first. Reports go to the arus.xinet.id server and can only be read by the owner. Nothing is ever sent automatically.",
  "Bukan produk IDM dan tidak berafiliasi dengan Internet Download Manager.": "Not an IDM product and not affiliated with Internet Download Manager.",
  "bintang": "stars",
  "Chrome dan Edge tidak mengizinkan pemasangan senyap. Karena itu Arus menampilkan panduan sekali saat pertama dibuka: buka halaman ekstensi, aktifkan Developer mode, pilih Load unpacked, lalu arahkan ke folder ekstensi. Setelah itu browser mengingatnya. Langkah ini opsional.": "Chrome and Edge do not allow silent installs. So Arus shows a guide once, the first time you open it: open the extensions page, turn on Developer mode, choose Load unpacked, then point it at the extension folder. The browser remembers it after that. This step is optional.",
  "Coba Arus di Windows.": "Try Arus on Windows.",
  "Contoh Rp 25.000": "Example Rp 25.000",
  "Data ditulis sambil diunduh, bukan ditampung di RAM. Mengunduh file ISO 5 GB tidak membuat pemakaian memori ikut naik.": "Data is written as it downloads instead of being buffered in RAM. Downloading a 5 GB ISO does not make memory use climb with it.",
  "Data saya dikirim ke mana?": "Where is my data sent?",
  "Ditulis bertahap, RAM tidak membengkak": "Written in stages, RAM stays flat",
  "Dirilis 10 November 2026": "Released November 10, 2026",
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
  "Installer 3,5 MB untuk Windows 10/11 64-bit. Tidak perlu akun.": "A 3.5 MB installer for Windows 10/11 64-bit. No account needed.",
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
  "Rilis 1.0.2": "Release 1.0.2",
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
  "Unduh Arus 1.0.2": "Download Arus 1.0.2",
  "Unduh ulang installer": "Download the installer again",
  "Unduh untuk Windows": "Download for Windows",
  "Unduhan dimulai": "Download started",
  "Unduhan installer sudah dimulai. Kalau Arus berguna, kamu bisa memberi dukungan lewat QRIS. Nominalnya bebas dan tidak memengaruhi fitur apa pun.": "The installer download has started. If Arus is useful to you, you can support it through QRIS. The amount is up to you and does not affect any feature.",
  "Verifikasi SHA-256": "SHA-256 verification",
  "WebView2 bawaan Windows": "WebView2 bundled with Windows",
  "Windows 10 dan 11 64-bit dengan WebView2. WebView2 umumnya sudah terpasang di Windows modern, dan installer dapat memasangnya jika belum ada.": "Windows 10 and 11 64-bit with WebView2. WebView2 is usually already installed on modern Windows, and the installer can add it if it is missing.",
  "Windows 10/11 · 64-bit · 3,5 MB": "Windows 10/11 · 64-bit · 3.5 MB",
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

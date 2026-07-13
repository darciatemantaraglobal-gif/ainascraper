# Manajemen Pengguna

Kelola akun dan peran tim AINA (hanya admin).

## Spesifikasi

### Tujuan
Memberikan admin kemampuan penuh mengelola akun dan peran anggota tim AINA, memastikan hanya pengguna sah yang bisa mengakses aplikasi.
### Selesai bila
- Admin dapat melihat daftar seluruh pengguna beserta perannya.
- Hanya admin yang dapat mengakses halaman manajemen pengguna (kontributor tidak memiliki akses).
- Admin dapat menambah akun baru, mengubah peran, mereset password, dan menghapus akun.
- Semua perubahan tersimpan langsung di database dan tercermin di daftar pengguna.
- Tidak ada fitur registrasi mandiri; akun hanya dibuat oleh admin.

## Sub-fitur: Tambah Pengguna

Admin menambahkan akun baru untuk kontributor atau admin lain.

### Tujuan
Admin dapat membuat akun baru untuk anggota tim (kontributor atau admin) dengan menyediakan kredensial awal yang akan disampaikan secara manual.
### Selesai bila
- Admin melihat formulir Tambah Pengguna berisi kolom username, password awal, dan pilihan peran (contributor/admin).
- Setelah mengisi dan menekan tombol "Tambah", akun tersimpan di database dan muncul dalam daftar pengguna.
- Pesan sukses "Akun berhasil dibuat" ditampilkan, dan admin dapat menyalin kredensial untuk diberikan kepada anggota tim.
- Password disimpan dalam bentuk ter-hash, bukan teks biasa.

## Sub-fitur: Edit Pengguna

Ubah peran (role) atau reset password pengguna.

### Tujuan
Admin dapat mengubah peran pengguna atau mereset password akun tanpa membuat akun baru.
### Selesai bila
- Admin dapat memilih pengguna dari daftar, lalu mengklik tombol "Edit".
- Muncul halaman edit yang menampilkan username (tidak bisa diubah) dan dropdown peran saat ini.
- Admin dapat mengubah peran (contributor ⇄ admin) dan menyimpan perubahan; jika berhasil, tampil pesan sukses "Peran berhasil diperbarui".
- Tombol "Reset Password" tersedia; setelah diklik, sistem menghasilkan password baru acak, menampilkannya sekali ke admin, dan menyimpan hash-nya. Pesan "Password baru: [password]" muncul agar admin bisa memberikannya ke pengguna.
- Tidak ada email atau notifikasi otomatis; perubahan diketahui manual.

## Sub-fitur: Hapus Pengguna

Nonaktifkan akun pengguna yang sudah tidak diperlukan.

### Tujuan
Admin dapat menonaktifkan akun pengguna yang sudah tidak digunakan dengan menghapusnya permanen dari sistem.
### Selesai bila
- Dalam daftar pengguna, setiap baris memiliki tombol "Hapus".
- Saat tombol diklik, muncul konfirmasi berbunyi "Yakin hapus pengguna [username]? Akun akan dihapus permanen."
- Setelah admin mengonfirmasi, akun dihapus dari database, dan pengguna tidak bisa login lagi.
- Daftar pengguna diperbarui tanpa menyertakan akun yang dihapus, dan muncul pesan sukses "Akun berhasil dihapus".

## Task

### 1. Form Pembuatan User manual oleh Admin

Membangun antarmuka di Dashboard Admin untuk mendaftarkan anggota tim baru secara manual (hanya bisa diakses peran Admin).

**Prompt:**

```
Buat halaman/form 'Tambah Anggota' di panel Manajemen Pengguna. Form mencakup input: Username, Password (set awal), dan Role (Contributor/Admin). Fungsi backend harus melakukan hashing pada password sebelum disimpan ke tabel 'scraper_users' di Supabase. Pastikan ada pengecekan agar username tidak duplikat.
```

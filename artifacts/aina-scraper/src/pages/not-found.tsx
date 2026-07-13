import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="text-center p-8 max-w-md">
        <div className="w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h1 className="text-6xl font-bold font-heading mb-4 text-foreground">404</h1>
        <p className="text-xl font-medium mb-2">Halaman Tidak Ditemukan</p>
        <p className="text-muted-foreground mb-8">
          Halaman yang Anda tuju mungkin telah dihapus, pindah nama, atau tidak pernah ada.
        </p>
        <Button asChild className="w-full">
          <Link href="/">Kembali ke Beranda</Link>
        </Button>
      </div>
    </div>
  );
}

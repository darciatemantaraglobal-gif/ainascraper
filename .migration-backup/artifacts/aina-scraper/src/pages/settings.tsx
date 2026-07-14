import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useUpdateUser } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';

const passwordSchema = z.object({
  password: z.string().min(6, 'Password baru minimal 6 karakter'),
  confirm: z.string()
}).refine((data) => data.password === data.confirm, {
  message: "Konfirmasi password tidak cocok",
  path: ["confirm"],
});

export default function SettingsPage() {
  const { user } = useAuth();
  const updateMutation = useUpdateUser();

  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: '',
      confirm: ''
    }
  });

  const onSubmit = (values: z.infer<typeof passwordSchema>) => {
    if (!user) return;
    
    updateMutation.mutate({ 
      username: user.username, 
      data: { password: values.password } 
    }, {
      onSuccess: () => {
        toast.success('Password berhasil diperbarui', {
          icon: <ShieldCheck className="w-5 h-5 text-success" />
        });
        form.reset();
      },
      onError: (err: any) => {
        toast.error(err.message || 'Gagal memperbarui password');
      }
    });
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-heading mb-2">Pengaturan Akun</h1>
        <p className="text-muted-foreground">Kelola keamanan dan profil Anda.</p>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" /> Ubah Password
          </CardTitle>
          <CardDescription>
            Password baru harus terdiri dari minimal 6 karakter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password Baru</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Konfirmasi Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <div className="pt-8 text-center text-sm text-muted-foreground font-mono">
        AINA Knowledge Scraper v2.0
      </div>
    </div>
  );
}

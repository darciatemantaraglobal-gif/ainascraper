import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useLogin } from '@workspace/api-client-react';
import { setToken } from '@/lib/auth-token';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Bot, Lock, User, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
});

export default function LoginPage() {
  const [_, setLocation] = useLocation();
  const { refetchUser } = useAuth();
  
  const loginMutation = useLogin();
  
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: async (data) => {
          // BE mengembalikan bearer token di samping {username, role}.
          // Simpan DULU, sebelum refetchUser() — kalau tidak, /auth/me akan
          // jalan tanpa Authorization header dan langsung 401.
          const token = (data as { token?: string } | undefined)?.token;
          if (token) setToken(token);

          await refetchUser();
          toast.success('Login berhasil!');
          setLocation('/');
        },
        onError: (err) => {
          const status = (err as { status?: number } | null)?.status;
          toast.error(
            status === 401
              ? 'Login gagal. Periksa username dan password.'
              : 'Tidak bisa terhubung ke server. Cek koneksi atau hubungi admin.',
          );
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background glowing effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-md px-4 relative z-10">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Bot className="w-8 h-8 text-white" />
          </div>
        </div>
        
        <Card className="border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold font-heading">AINA Scraper</CardTitle>
            <CardDescription className="text-sm">
              Sistem manajemen knowledge base untuk AINA
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input 
                            placeholder="admin" 
                            className="pl-10" 
                            {...field} 
                            disabled={loginMutation.isPending}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input 
                            type="password" 
                            placeholder="••••••••" 
                            className="pl-10" 
                            {...field} 
                            disabled={loginMutation.isPending}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full h-11 text-base font-semibold" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4 mr-2" />
                      Masuk
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

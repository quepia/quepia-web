'use client';

import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { Suspense, useState } from 'react';
import { Shield, Sparkles } from 'lucide-react';

function LoginContent() {
    const searchParams = useSearchParams();
    const redirectTo = searchParams?.get('redirectTo') || '/admin';
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        const supabase = createClient();

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
            },
        });

        if (error) {
            console.error('Login error:', error);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 bg-[#0a0a0a]">
                {/* Gradient orbs */}
                <motion.div
                    className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full"
                    style={{
                        background: 'radial-gradient(circle, rgba(42,231,228,0.15) 0%, transparent 70%)',
                        filter: 'blur(60px)',
                    }}
                    animate={{
                        scale: [1, 1.2, 1],
                        x: [0, 50, 0],
                        y: [0, -30, 0],
                    }}
                    transition={{
                        duration: 15,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
                <motion.div
                    className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full"
                    style={{
                        background: 'radial-gradient(circle, rgba(136,16,120,0.15) 0%, transparent 70%)',
                        filter: 'blur(60px)',
                    }}
                    animate={{
                        scale: [1, 1.3, 1],
                        x: [0, -40, 0],
                        y: [0, 40, 0],
                    }}
                    transition={{
                        duration: 18,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
                
                {/* Grid pattern */}
                <div 
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                                          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '50px 50px',
                    }}
                />
            </div>

            {/* Content */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 w-full max-w-md"
            >
                {/* Card */}
                <div className="relative">
                    {/* Glow effect */}
                    <div className="absolute -inset-px bg-gradient-to-b from-white/10 to-transparent rounded-2xl blur-sm" />
                    
                    <div className="relative liquid-glass p-8 md:p-12">
                        {/* Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2, duration: 0.6 }}
                            className="text-center mb-10"
                        >
                            {/* Icon */}
                            <motion.div
                                className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-quepia-cyan/20 to-quepia-purple/20 flex items-center justify-center"
                                whileHover={{ scale: 1.05, rotate: 5 }}
                                transition={{ type: 'spring', stiffness: 400 }}
                            >
                                <Shield className="w-8 h-8 text-quepia-cyan" />
                            </motion.div>

                            {/* Title */}
                            <h1 className="font-display text-3xl md:text-4xl font-light text-white mb-3">
                                Quepia <span className="text-white/60">Admin</span>
                            </h1>
                            
                            <p className="text-white/50 text-sm">
                                Acceso exclusivo para equipo autorizado
                            </p>
                        </motion.div>

                        {/* Login Button */}
                        <motion.button
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, duration: 0.6 }}
                            onClick={handleGoogleLogin}
                            disabled={isLoading}
                            className="group w-full relative overflow-hidden"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-white/5 rounded-xl" />
                            <div className="relative flex items-center justify-center gap-3 px-6 py-4 border border-white/10 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300">
                                {isLoading ? (
                                    <motion.div
                                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    />
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                                            <path
                                                fill="#4285F4"
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            />
                                            <path
                                                fill="#34A853"
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            />
                                            <path
                                                fill="#FBBC05"
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                            />
                                            <path
                                                fill="#EA4335"
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                            />
                                        </svg>
                                        <span className="text-white font-medium">Continuar con Google</span>
                                    </>
                                )}
                            </div>
                        </motion.button>

                        {/* Divider */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="flex items-center gap-4 my-8"
                        >
                            <div className="flex-1 h-px bg-white/10" />
                            <Sparkles className="w-4 h-4 text-white/30" />
                            <div className="flex-1 h-px bg-white/10" />
                        </motion.div>

                        {/* Footer */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6 }}
                            className="text-center text-xs text-white/40"
                        >
                            Solo usuarios autorizados pueden acceder al sistema.
                            <br />
                            Si necesitas acceso, contacta al administrador.
                        </motion.p>

                        {/* Back link */}
                        <motion.a
                            href="/"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7 }}
                            className="mt-8 flex items-center justify-center gap-2 text-white/40 hover:text-white text-sm transition-colors group"
                        >
                            <svg 
                                className="w-4 h-4 transition-transform group-hover:-translate-x-1" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Volver al sitio
                        </motion.a>
                    </div>
                </div>

                {/* Decorative elements */}
                <motion.div
                    className="absolute -top-4 -right-4 w-24 h-24 border border-white/5 rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                    className="absolute -bottom-6 -left-6 w-32 h-32 border border-white/5 rounded-full"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                />
            </motion.div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
                <motion.div
                    className="w-8 h-8 border-2 border-quepia-cyan/30 border-t-quepia-cyan rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}

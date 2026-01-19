'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
    LayoutDashboard,
    FolderOpen,
    Briefcase,
    Users,
    Settings,
    LogOut,
    Menu,
    X,
    Home,
    ShieldCheck
} from 'lucide-react';

const sidebarItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Usuarios', path: '/admin/usuarios', icon: ShieldCheck },
    { name: 'Proyectos', path: '/admin/proyectos', icon: FolderOpen },
    { name: 'Servicios', path: '/admin/servicios', icon: Briefcase },
    { name: 'Equipo', path: '/admin/equipo', icon: Users },
    { name: 'Configuración', path: '/admin/configuracion', icon: Settings },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/');
    };

    return (
        <div className="min-h-screen bg-[#050505] flex">
            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center justify-between">
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-2 rounded-lg bg-white/10 text-white"
                >
                    {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
                <span className="text-lg font-bold gradient-text">Quepia Admin</span>
                <Link href="/" className="p-2 rounded-lg bg-white/10 text-white">
                    <Home size={20} />
                </Link>
            </div>

            {/* Sidebar */}
            <aside
                className={`fixed lg:static inset-y-0 left-0 z-40 w-64 admin-sidebar transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    }`}
            >
                <div className="flex flex-col h-full p-6 pt-20 lg:pt-6">
                    {/* Logo - Desktop only */}
                    <div className="mb-8 hidden lg:block">
                        <Link href="/admin" className="flex items-center gap-3">
                            <Image
                                src="/Logo_Quepia.svg"
                                alt="Quepia"
                                width={100}
                                height={30}
                                className="h-8 w-auto"
                            />
                            <span className="text-sm font-medium text-gray-400">Admin</span>
                        </Link>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 space-y-2">
                        {sidebarItems.map((item) => {
                            const isActive = pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
                                        ? 'bg-gradient-to-r from-quepia-purple/20 to-quepia-cyan/20 text-white border border-quepia-cyan/30'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <item.icon size={20} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Bottom actions */}
                    <div className="space-y-2 mt-auto">
                        {/* Back to site */}
                        <Link
                            href="/"
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-quepia-cyan hover:bg-quepia-cyan/10 transition-all"
                        >
                            <Home size={20} />
                            Ir al sitio
                        </Link>

                        {/* Logout */}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-all w-full"
                        >
                            <LogOut size={20} />
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </aside>

            {/* Mobile overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Main content */}
            <main className="flex-1 p-4 lg:p-8 pt-20 lg:pt-8 overflow-auto min-h-screen">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}

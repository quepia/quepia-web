import { createClient } from '@/lib/supabase/server';
import { FolderOpen, Briefcase, Plus } from 'lucide-react';
import Link from 'next/link';

export default async function AdminDashboard() {
    const supabase = await createClient();

    // Get counts
    const { count: proyectosCount } = await supabase
        .from('proyectos')
        .select('*', { count: 'exact', head: true });

    const { count: serviciosCount } = await supabase
        .from('servicios')
        .select('*', { count: 'exact', head: true });

    const stats = [
        {
            name: 'Proyectos',
            count: proyectosCount || 0,
            icon: FolderOpen,
            href: '/admin/proyectos',
            color: 'from-quepia-purple to-pink-500'
        },
        {
            name: 'Servicios',
            count: serviciosCount || 0,
            icon: Briefcase,
            href: '/admin/servicios',
            color: 'from-quepia-cyan to-blue-500'
        },
    ];

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
                <p className="text-gray-400">Bienvenido al panel de administración de Quepia</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                {stats.map((stat) => (
                    <Link
                        key={stat.name}
                        href={stat.href}
                        className="admin-card p-6 hover:border-white/20 transition-all group"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-sm mb-1">{stat.name}</p>
                                <p className="text-4xl font-bold text-white">{stat.count}</p>
                            </div>
                            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                <stat.icon size={28} className="text-white" />
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Acciones Rápidas</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link
                        href="/admin/proyectos?action=new"
                        className="flex items-center gap-3 p-4 admin-card hover:border-quepia-purple/50 transition-all group"
                    >
                        <div className="w-10 h-10 rounded-lg bg-quepia-purple/20 flex items-center justify-center group-hover:bg-quepia-purple/30 transition-colors">
                            <Plus size={20} className="text-quepia-purple" />
                        </div>
                        <span className="text-white font-medium">Nuevo Proyecto</span>
                    </Link>
                    <Link
                        href="/admin/servicios?action=new"
                        className="flex items-center gap-3 p-4 admin-card hover:border-quepia-cyan/50 transition-all group"
                    >
                        <div className="w-10 h-10 rounded-lg bg-quepia-cyan/20 flex items-center justify-center group-hover:bg-quepia-cyan/30 transition-colors">
                            <Plus size={20} className="text-quepia-cyan" />
                        </div>
                        <span className="text-white font-medium">Nuevo Servicio</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}

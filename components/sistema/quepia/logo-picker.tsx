"use client"

import { useState, useRef } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { uploadImage } from "@/lib/storage"
import {
    Loader2,
    Upload,
    Image as ImageIcon,
    Type,
    Briefcase,
    Building2,
    Store,
    Globe,
    Laptop,
    Megaphone,
    Camera,
    PenTool,
    Music,
    Video,
    Code
} from "lucide-react"

interface LogoPickerProps {
    currentLogo?: string | null
    currentIcon?: string | null
    onLogoChange: (url: string | null) => void
    onIconChange: (icon: string) => void
}

const ICONS = [
    { id: "briefcase", icon: Briefcase, label: "Maletín" },
    { id: "building-2", icon: Building2, label: "Edificio" },
    { id: "store", icon: Store, label: "Tienda" },
    { id: "globe", icon: Globe, label: "Global" },
    { id: "laptop", icon: Laptop, label: "Laptop" },
    { id: "megaphone", icon: Megaphone, label: "Marketing" },
    { id: "camera", icon: Camera, label: "Foto" },
    { id: "pen-tool", icon: PenTool, label: "Diseño" },
    { id: "music", icon: Music, label: "Música" },
    { id: "video", icon: Video, label: "Video" },
    { id: "code", icon: Code, label: "Código" },
    { id: "type", icon: Type, label: "Texto" },
]

export function LogoPicker({ currentLogo, currentIcon, onLogoChange, onIconChange }: LogoPickerProps) {
    const [uploading, setUploading] = useState(false)
    const [activeTab, setActiveTab] = useState(currentLogo ? "image" : "icon")
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const url = await uploadImage(file, "logos")
            onLogoChange(url)
        } catch (error) {
            console.error("Error uploading logo:", error)
            alert("Error al subir la imagen")
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-white/5 p-1 rounded-lg pb-0">
                    <TabsTrigger
                        value="icon"
                        className="rounded-md py-2 text-sm font-medium transition-all data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=inactive]:text-white/40 hover:text-white/60"
                    >
                        Iconos
                    </TabsTrigger>
                    <TabsTrigger
                        value="image"
                        className="rounded-md py-2 text-sm font-medium transition-all data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=inactive]:text-white/40 hover:text-white/60"
                    >
                        Subir Logo
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="icon" className="mt-4">
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                        {ICONS.map((item) => {
                            const Icon = item.icon
                            const isSelected = !currentLogo && currentIcon === item.id
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        onIconChange(item.id)
                                        onLogoChange(null) // Clear logo when icon is selected
                                    }}
                                    className={`aspect-square p-2 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all duration-200 group ${isSelected
                                            ? "border-quepia-cyan bg-quepia-cyan/10 text-white shadow-[0_0_15px_-3px_rgba(42,231,228,0.3)]"
                                            : "border-white/5 bg-white/[0.02] text-white/40 hover:bg-white/5 hover:border-white/10 hover:text-white"
                                        }`}
                                >
                                    <Icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${isSelected ? "text-quepia-cyan" : ""}`} />
                                    <span className="text-[9px] font-medium tracking-wide">{item.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </TabsContent>

                <TabsContent value="image" className="mt-4">
                    <div className="space-y-4">
                        {currentLogo ? (
                            <div className="relative group aspect-video w-full rounded-xl overflow-hidden border border-white/10 bg-[url('/grid-pattern.svg')] bg-center">
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
                                <img src={currentLogo} alt="Logo actual" className="relative z-10 w-full h-full object-contain p-8" />
                                <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="bg-white text-black px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider hover:bg-white/90 transform transition-transform active:scale-95"
                                    >
                                        Cambiar imagen
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-quepia-cyan/50 hover:bg-quepia-cyan/5 transition-all duration-300 group"
                            >
                                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-quepia-cyan/10 transition-colors duration-300">
                                    {uploading ? (
                                        <Loader2 className="w-5 h-5 text-quepia-cyan animate-spin" />
                                    ) : (
                                        <Upload className="w-5 h-5 text-white/40 group-hover:text-quepia-cyan transition-colors duration-300" />
                                    )}
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-white/70 font-medium group-hover:text-white transition-colors">Click para subir logo</p>
                                    <p className="text-[10px] text-white/30 uppercase tracking-wide mt-1">PNG, JPG, WEBP (Max 2MB)</p>
                                </div>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileUpload}
                        />

                        {!currentLogo && (
                            <div className="space-y-3 pt-2">
                                <div className="flex items-center gap-3">
                                    <div className="h-px bg-white/10 flex-1" />
                                    <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">o mediante URL</span>
                                    <div className="h-px bg-white/10 flex-1" />
                                </div>

                                <div className="relative group">
                                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-quepia-cyan transition-colors" />
                                    <input
                                        type="text"
                                        placeholder="https://ejemplo.com/logo.png"
                                        className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-9 pr-4 text-xs text-white placeholder:text-white/20 outline-none focus:border-quepia-cyan/50 focus:bg-white/[0.07] transition-all"
                                        onChange={(e) => {
                                            if (e.target.value.startsWith('http')) {
                                                onLogoChange(e.target.value)
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}

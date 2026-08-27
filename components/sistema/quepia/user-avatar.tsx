"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/sistema/utils"

const DEFAULT_FALLBACK_CLASS = "bg-gradient-to-br from-quepia-cyan/70 to-quepia-magenta/70"

export function getUserInitials(name?: string | null, fallback = "?") {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return fallback
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase()
}

interface UserAvatarProps {
    name?: string | null
    avatarUrl?: string | null
    /** Diámetro en píxeles. */
    size?: number
    /** Tamaño de las iniciales; por defecto se deriva de `size`. */
    fontSize?: number
    /** Degradado de respaldo cuando no hay foto (ej.: otro color para clientes). */
    fallbackClassName?: string
    /** Texto de respaldo si no se quiere derivar de `name`. */
    fallbackLabel?: string
    title?: string
    className?: string
}

/**
 * Avatar de usuario con la foto real cuando existe. Cae a las iniciales si el
 * perfil no tiene foto o si la imagen no carga (URL vencida, host caído).
 */
export function UserAvatar({
    name,
    avatarUrl,
    size = 24,
    fontSize,
    fallbackClassName,
    fallbackLabel,
    title,
    className,
}: UserAvatarProps) {
    const [failed, setFailed] = useState(false)

    // Una URL nueva merece otro intento aunque la anterior haya fallado.
    useEffect(() => {
        setFailed(false)
    }, [avatarUrl])

    const showPhoto = Boolean(avatarUrl) && !failed

    return (
        <span
            title={title ?? name ?? undefined}
            style={{
                width: size,
                height: size,
                fontSize: fontSize ?? Math.max(8, Math.round(size * 0.4)),
            }}
            className={cn(
                "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium leading-none text-white",
                !showPhoto && (fallbackClassName || DEFAULT_FALLBACK_CLASS),
                className
            )}
        >
            {showPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar remoto de host variable; next/image exigiría whitelistear cada proveedor
                <img
                    src={avatarUrl as string}
                    alt={name || "Usuario"}
                    width={size}
                    height={size}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                    className="h-full w-full object-cover"
                />
            ) : (
                fallbackLabel ?? getUserInitials(name)
            )}
        </span>
    )
}

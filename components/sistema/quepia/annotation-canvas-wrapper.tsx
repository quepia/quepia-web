"use client"

import dynamic from "next/dynamic"

const AnnotationCanvas = dynamic(() => import("./annotation-canvas"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-black/20 text-white/30">
            Cargando canvas...
        </div>
    ),
})

export default AnnotationCanvas

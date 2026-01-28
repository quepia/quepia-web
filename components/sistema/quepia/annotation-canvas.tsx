"use client"

import { useState, useRef, useEffect } from "react"
import { Stage, Layer, Image as KonvaImage, Circle, Group, Text, Rect } from "react-konva"
import useImage from "use-image"
import { useResizeObserver } from "usehooks-ts"
import { FEEDBACK_TYPE_COLORS, type Annotation, type FeedbackType } from "@/types/sistema"

interface AnnotationCanvasProps {
    imageUrl: string
    annotations: Annotation[]
    onAddAnnotation?: (xPercent: number, yPercent: number) => void
    onSelectAnnotation?: (annotation: Annotation) => void
    selectedAnnotationId?: string | null
    readOnly?: boolean
}

export default function AnnotationCanvas({
    imageUrl,
    annotations,
    onAddAnnotation,
    onSelectAnnotation,
    selectedAnnotationId,
    readOnly = false,
}: AnnotationCanvasProps) {
    const [image] = useImage(imageUrl, "anonymous")
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
    const [scale, setScale] = useState(1)

    // Use ResizeObserver to handle responsive container sizing
    useEffect(() => {
        if (!containerRef.current) return

        const updateSize = () => {
            if (!containerRef.current || !image) return

            const containerWidth = containerRef.current.offsetWidth
            const containerHeight = containerRef.current.offsetHeight

            // Calculate aspect ratio fit
            const imageRatio = image.width / image.height
            const containerRatio = containerWidth / containerHeight

            let finalWidth, finalHeight, newScale

            if (containerRatio > imageRatio) {
                finalHeight = containerHeight
                finalWidth = finalHeight * imageRatio
                newScale = finalHeight / image.height
            } else {
                finalWidth = containerWidth
                finalHeight = finalWidth / imageRatio
                newScale = finalWidth / image.width
            }

            setDimensions({ width: finalWidth, height: finalHeight })
            setScale(newScale)
        }

        updateSize()
        window.addEventListener('resize', updateSize)
        return () => window.removeEventListener('resize', updateSize)
    }, [image])

    // Also update when image loads
    useEffect(() => {
        if (image && containerRef.current) {
            const containerWidth = containerRef.current.offsetWidth
            const containerHeight = containerRef.current.offsetHeight
            const imageRatio = image.width / image.height
            const containerRatio = containerWidth / containerHeight

            let finalWidth, finalHeight, newScale

            if (containerRatio > imageRatio) {
                finalHeight = containerHeight
                finalWidth = finalHeight * imageRatio
                newScale = finalHeight / image.height
            } else {
                finalWidth = containerWidth
                finalHeight = finalWidth / imageRatio
                newScale = finalWidth / image.width
            }
            setDimensions({ width: finalWidth, height: finalHeight })
            setScale(newScale)
        }
    }, [image])


    const handleClick = (e: any) => {
        if (readOnly || !onAddAnnotation || !image) return

        // Don't trigger if clicking on an existing annotation
        if (e.target.className === "Circle" || e.target.parent?.className === "Group") return

        const stage = e.target.getStage()
        const pointerPosition = stage.getPointerPosition()

        if (pointerPosition) {
            // Calculate percentage relative to the image logic
            // We need to account that the Stage might be centered or offset?
            // In this simple implementation, Stage equals image display size

            const xPercent = (pointerPosition.x / dimensions.width) * 100
            const yPercent = (pointerPosition.y / dimensions.height) * 100

            onAddAnnotation(xPercent, yPercent)
        }
    }

    if (!image) {
        return <div ref={containerRef} className="w-full h-full min-h-[300px] flex items-center justify-center bg-black/20 text-white/30">Cargando imagen...</div>
    }

    return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-[#050505] overflow-hidden relative">
            <Stage
                width={dimensions.width}
                height={dimensions.height}
                onClick={handleClick}
                onTap={handleClick}
                style={{ cursor: readOnly ? 'default' : 'crosshair' }}
            >
                <Layer>
                    <KonvaImage
                        image={image}
                        width={dimensions.width}
                        height={dimensions.height}
                    />

                    {annotations.map((ann) => {
                        const x = (ann.x_percent / 100) * dimensions.width
                        const y = (ann.y_percent / 100) * dimensions.height
                        const isSelected = selectedAnnotationId === ann.id
                        const color = FEEDBACK_TYPE_COLORS[ann.feedback_type] || '#fff'

                        return (
                            <Group
                                key={ann.id}
                                x={x}
                                y={y}
                                onClick={(e) => {
                                    e.cancelBubble = true
                                    onSelectAnnotation?.(ann)
                                }}
                                onTap={(e) => {
                                    e.cancelBubble = true
                                    onSelectAnnotation?.(ann)
                                }}
                                onMouseEnter={(e) => {
                                    const container = e.target.getStage()?.container()
                                    if (container) container.style.cursor = "pointer"
                                }}
                                onMouseLeave={(e) => {
                                    const container = e.target.getStage()?.container()
                                    if (container) container.style.cursor = readOnly ? "default" : "crosshair"
                                }}
                            >
                                {/* Selection halo */}
                                {isSelected && (
                                    <Circle
                                        radius={16}
                                        stroke="white"
                                        strokeWidth={2}
                                        opacity={0.5}
                                        fill={color} // faint background fill
                                        fillOpacity={0.2}
                                    />
                                )}
                                {/* Pin body */}
                                <Circle
                                    radius={8}
                                    fill={color}
                                    stroke="white"
                                    strokeWidth={2}
                                    shadowColor="black"
                                    shadowBlur={4}
                                    shadowOpacity={0.5}
                                />
                                {/* Number or Index could go here if annotations were ordered */}
                                {ann.resolved && (
                                    // visual indicator for resolved (small checkmark simulation or dot)
                                    <Circle
                                        radius={3}
                                        fill="white"
                                    />
                                )}
                            </Group>
                        )
                    })}
                </Layer>
            </Stage>
        </div>
    )
}

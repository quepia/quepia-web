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
    const [zoom, setZoom] = useState(1)
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
    const lastDistRef = useRef<number | null>(null)

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

            let finalWidth, finalHeight

            if (containerRatio > imageRatio) {
                finalHeight = containerHeight
                finalWidth = finalHeight * imageRatio
            } else {
                finalWidth = containerWidth
                finalHeight = finalWidth / imageRatio
            }

            setDimensions({ width: finalWidth, height: finalHeight })
            setZoom(1)
            setStagePos({ x: 0, y: 0 })
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

            let finalWidth, finalHeight

            if (containerRatio > imageRatio) {
                finalHeight = containerHeight
                finalWidth = finalHeight * imageRatio
            } else {
                finalWidth = containerWidth
                finalHeight = finalWidth / imageRatio
            }
            setDimensions({ width: finalWidth, height: finalHeight })
            setZoom(1)
            setStagePos({ x: 0, y: 0 })
        }
    }, [image])

    const clampZoom = (value: number) => Math.max(1, Math.min(4, value))

    const handleWheel = (e: any) => {
        e.evt.preventDefault()
        const stage = e.target.getStage()
        if (!stage) return

        const oldScale = zoom
        const pointer = stage.getPointerPosition()
        if (!pointer) return

        const scaleBy = 1.08
        const direction = e.evt.deltaY > 0 ? -1 : 1
        const newScale = clampZoom(oldScale * (direction > 0 ? scaleBy : 1 / scaleBy))

        const mousePointTo = {
            x: (pointer.x - stagePos.x) / oldScale,
            y: (pointer.y - stagePos.y) / oldScale,
        }

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        }

        setZoom(newScale)
        setStagePos(newPos)
    }

    const handleTouchStart = (e: any) => {
        const touches = e.evt.touches
        if (touches && touches.length === 2) {
            const dx = touches[0].clientX - touches[1].clientX
            const dy = touches[0].clientY - touches[1].clientY
            lastDistRef.current = Math.sqrt(dx * dx + dy * dy)
        }
    }

    const handleTouchMove = (e: any) => {
        const touches = e.evt.touches
        if (!touches || touches.length !== 2) return
        e.evt.preventDefault()

        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const lastDist = lastDistRef.current
        if (!lastDist) {
            lastDistRef.current = dist
            return
        }

        const scaleBy = dist / lastDist
        const newScale = clampZoom(zoom * scaleBy)
        setZoom(newScale)
        lastDistRef.current = dist
    }

    const handleClick = (e: any) => {
        if (readOnly || !onAddAnnotation || !image) return

        // Don't trigger if clicking on an existing annotation
        if (e.target.className === "Circle" || e.target.parent?.className === "Group") return

        const stage = e.target.getStage()
        const pointerPosition = stage.getPointerPosition()

        if (pointerPosition) {
            const currentScale = stage.scaleX() || 1
            const stagePosition = stage.position()
            const x = (pointerPosition.x - stagePosition.x) / currentScale
            const y = (pointerPosition.y - stagePosition.y) / currentScale

            const xPercent = (x / dimensions.width) * 100
            const yPercent = (y / dimensions.height) * 100

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
                scaleX={zoom}
                scaleY={zoom}
                x={stagePos.x}
                y={stagePos.y}
                draggable={zoom > 1}
                onDragEnd={(e) => setStagePos(e.target.position())}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
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

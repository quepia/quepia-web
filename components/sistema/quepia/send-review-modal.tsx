"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import Button from "@/components/ui/Button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Copy, Check } from "lucide-react"
import type { Task } from "@/types/sistema"
import { createReview } from "@/lib/sistema/actions/reviews"

interface SendReviewModalProps {
    task: Task | null
    isOpen: boolean
    onClose: () => void
}

export function SendReviewModal({ task, isOpen, onClose }: SendReviewModalProps) {
    const [url, setUrl] = useState("")
    const [loading, setLoading] = useState(false)
    const [generatedLink, setGeneratedLink] = useState("")
    const [copied, setCopied] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!task || !url) return

        setLoading(true)
        try {
            const result = await createReview(task.id, url)
            if (result.success && result.data) {
                // Assuming route structure
                const link = `${window.location.origin}/review/${result.data.token}`
                setGeneratedLink(link)
            }
        } catch (error) {
            console.error("Error creating review:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleClose = () => {
        setGeneratedLink("")
        setUrl("")
        setCopied(false)
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md bg-[#1a1a1a] border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Enviar a Revisión - {task?.titulo}</DialogTitle>
                </DialogHeader>

                {!generatedLink ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="url" className="text-white/70">
                                Link del Entregable (Drive, WeTransfer, etc.)
                            </Label>
                            <Input
                                id="url"
                                placeholder="https://..."
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-quepia-cyan"
                                required
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleClose}
                                className="text-white/70 hover:text-white hover:bg-white/5"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading || !url}
                                className="bg-quepia-cyan text-black hover:bg-quepia-cyan/90"
                            >
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Generar Link de Revisión
                            </Button>
                        </DialogFooter>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                            <p className="text-sm text-green-400 font-medium mb-1">Link generado exitosamente</p>
                            <p className="text-xs text-white/50">Envía este link al cliente para que revise el entregable.</p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Input
                                readOnly
                                value={generatedLink}
                                className="bg-white/5 border-white/10 text-white font-mono text-xs"
                            />
                            <Button
                                size="icon"
                                onClick={handleCopy}
                                className="shrink-0 bg-white/10 hover:bg-white/20"
                            >
                                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>

                        <DialogFooter>
                            <Button onClick={handleClose} className="w-full bg-white/10 hover:bg-white/20 text-white">
                                Cerrar
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

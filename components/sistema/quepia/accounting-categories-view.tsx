"use client"

import { useState, useMemo } from "react"
import { Tags, Plus, Edit2, Trash2, X, Check, Loader2, Palette, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { ExpenseCategory, ExpenseCategoryInsert, ExpenseCategoryUpdate, ExpenseSubcategory, ExpenseSubcategoryInsert } from "@/types/accounting"

interface AccountingCategoriesViewProps {
    categories: ExpenseCategory[]
    loading: boolean
    subcategories: ExpenseSubcategory[]
    onCreateCategory: (category: ExpenseCategoryInsert) => Promise<any>
    onUpdateCategory: (id: string, updates: ExpenseCategoryUpdate) => Promise<boolean>
    onDeleteCategory: (id: string) => Promise<boolean>
    onCreateSubcategory: (subcategory: ExpenseSubcategoryInsert) => Promise<any>
    onDeleteSubcategory: (id: string) => Promise<boolean>
    onRefresh: () => void
}

const PRESET_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#6b7280',
]

export function AccountingCategoriesView({
    categories,
    loading,
    subcategories,
    onCreateCategory,
    onUpdateCategory,
    onDeleteCategory,
    onCreateSubcategory,
    onDeleteSubcategory,
    onRefresh,
}: AccountingCategoriesViewProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    // Form state
    const [formName, setFormName] = useState("")
    const [formDescription, setFormDescription] = useState("")
    const [formColor, setFormColor] = useState("#6366f1")

    // Subcategory state
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
    const [newSubcategoryName, setNewSubcategoryName] = useState("")
    const [addingSubcategoryTo, setAddingSubcategoryTo] = useState<string | null>(null)

    // Get subcategories for a category
    const getSubcategoriesForCategory = (categoryId: string) => {
        return subcategories.filter(s => s.category_id === categoryId)
    }

    const resetForm = () => {
        setFormName("")
        setFormDescription("")
        setFormColor("#6366f1")
        setEditingCategory(null)
    }

    const openCreateModal = () => {
        resetForm()
        setIsModalOpen(true)
    }

    const openEditModal = (category: ExpenseCategory) => {
        setEditingCategory(category)
        setFormName(category.name)
        setFormDescription(category.description || "")
        setFormColor(category.color)
        setIsModalOpen(true)
    }

    const handleSubmit = async () => {
        if (!formName.trim()) return

        setIsSubmitting(true)
        try {
            const categoryData = {
                name: formName.trim(),
                description: formDescription.trim() || null,
                color: formColor,
            }

            if (editingCategory) {
                await onUpdateCategory(editingCategory.id, categoryData)
            } else {
                await onCreateCategory(categoryData)
            }

            setIsModalOpen(false)
            resetForm()
            onRefresh()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        await onDeleteCategory(id)
        setDeleteConfirm(null)
        onRefresh()
    }

    const handleAddSubcategory = async (categoryId: string) => {
        if (!newSubcategoryName.trim()) return
        await onCreateSubcategory({
            category_id: categoryId,
            name: newSubcategoryName.trim()
        })
        setNewSubcategoryName("")
        setAddingSubcategoryTo(null)
        onRefresh()
    }

    const handleDeleteSubcategory = async (id: string) => {
        await onDeleteSubcategory(id)
        onRefresh()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-purple-400 rounded-full" />
            </div>
        )
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">Categorías de Gastos</h2>
                    <p className="text-white/40 text-sm">Organiza tus gastos en categorías personalizadas</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Nueva Categoría
                </button>
            </div>

            {/* Categories Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-white/40">
                        No hay categorías. Crea una para empezar.
                    </div>
                ) : (
                    categories.map((category) => (
                        <div
                            key={category.id}
                            className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.1] transition-colors"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: `${category.color}20` }}
                                    >
                                        <Tags className="h-5 w-5" style={{ color: category.color }} />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-white">{category.name}</h3>
                                        {category.is_default && (
                                            <span className="text-[10px] bg-white/[0.1] px-2 py-0.5 rounded-full text-white/50">
                                                Por defecto
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(category)}
                                        className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                    {deleteConfirm === category.id ? (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleDelete(category.id)}
                                                className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg"
                                            >
                                                <Check className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(null)}
                                                className="p-1.5 text-white/40 hover:bg-white/[0.05] rounded-lg"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setDeleteConfirm(category.id)}
                                            className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {category.description && (
                                <p className="text-white/40 text-sm line-clamp-2">{category.description}</p>
                            )}

                            {/* Subcategories section */}
                            <div className="mt-3 pt-3 border-t border-white/[0.06]">
                                <button
                                    onClick={() => setExpandedCategory(expandedCategory === category.id ? null : category.id)}
                                    className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors w-full"
                                >
                                    {expandedCategory === category.id ? (
                                        <ChevronDown className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                    <span>Subcategorías ({getSubcategoriesForCategory(category.id).length})</span>
                                </button>

                                {expandedCategory === category.id && (
                                    <div className="mt-2 space-y-1.5 pl-6">
                                        {getSubcategoriesForCategory(category.id).map(sub => (
                                            <div key={sub.id} className="flex items-center justify-between group">
                                                <span className="text-sm text-white/60">{sub.name}</span>
                                                <button
                                                    onClick={() => handleDeleteSubcategory(sub.id)}
                                                    className="p-1 text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}

                                        {addingSubcategoryTo === category.id ? (
                                            <div className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="text"
                                                    value={newSubcategoryName}
                                                    onChange={(e) => setNewSubcategoryName(e.target.value)}
                                                    placeholder="Nombre..."
                                                    className="flex-1 px-2 py-1 bg-white/[0.05] border border-white/[0.1] rounded text-sm text-white placeholder:text-white/40 outline-none focus:border-purple-500"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleAddSubcategory(category.id)
                                                        if (e.key === 'Escape') setAddingSubcategoryTo(null)
                                                    }}
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => handleAddSubcategory(category.id)}
                                                    className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded"
                                                >
                                                    <Check className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setAddingSubcategoryTo(null)
                                                        setNewSubcategoryName("")
                                                    }}
                                                    className="p-1 text-white/40 hover:bg-white/[0.05] rounded"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setAddingSubcategoryTo(category.id)
                                                    setExpandedCategory(category.id)
                                                }}
                                                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 mt-2 transition-colors"
                                            >
                                                <Plus className="h-3 w-3" />
                                                Agregar subcategoría
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Color indicator */}
                            <div className="mt-3 flex items-center gap-2">
                                <div
                                    className="w-4 h-4 rounded-full border border-white/20"
                                    style={{ backgroundColor: category.color }}
                                />
                                <span className="text-white/30 text-xs uppercase">{category.color}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    />
                    <div className="relative bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-md p-6 border border-white/10">
                        <h2 className="text-xl font-bold text-white mb-6">
                            {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
                        </h2>

                        <div className="space-y-4">
                            {/* Nombre */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Nombre *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="Ej: Marketing"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-purple-500 transition-colors"
                                />
                            </div>

                            {/* Descripción */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Descripción</label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    placeholder="Descripción opcional..."
                                    rows={2}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-purple-500 resize-none"
                                />
                            </div>

                            {/* Color */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    <div className="flex items-center gap-2">
                                        <Palette className="h-4 w-4" />
                                        Color
                                    </div>
                                </label>
                                <div className="grid grid-cols-9 gap-2">
                                    {PRESET_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setFormColor(color)}
                                            className={cn(
                                                "w-8 h-8 rounded-lg border-2 transition-all",
                                                formColor === color
                                                    ? "border-white scale-110"
                                                    : "border-transparent hover:scale-105"
                                            )}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                                <div className="mt-3 flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={formColor}
                                        onChange={(e) => setFormColor(e.target.value)}
                                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={formColor}
                                        onChange={(e) => setFormColor(e.target.value)}
                                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm uppercase outline-none focus:border-purple-500"
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleSubmit}
                                disabled={!formName.trim() || isSubmitting}
                                className="w-full mt-2 px-4 py-3 bg-purple-500 text-white font-medium rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    editingCategory ? "Guardar Cambios" : "Crear Categoría"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

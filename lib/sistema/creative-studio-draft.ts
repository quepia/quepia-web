import type { CreativeStudioDraft } from "@/lib/ai/creative-studio-types"

const DATABASE_NAME = "quepia-creative-studio"
const STORE_NAME = "drafts"
const DATABASE_VERSION = 1

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento de borradores"))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "taskId" })
      }
    }
  })
}

export async function readCreativeStudioDraft(taskId: string) {
  if (typeof window === "undefined" || !taskId) return null
  const database = await openDraftDatabase()
  try {
    return await new Promise<CreativeStudioDraft | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly")
      const request = transaction.objectStore(STORE_NAME).get(taskId)
      request.onerror = () => reject(request.error || new Error("No se pudo leer el borrador"))
      request.onsuccess = () => resolve((request.result as CreativeStudioDraft | undefined) || null)
    })
  } finally {
    database.close()
  }
}

export async function saveCreativeStudioDraft(draft: CreativeStudioDraft) {
  if (typeof window === "undefined" || !draft.taskId) return
  const database = await openDraftDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite")
      transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el borrador"))
      transaction.oncomplete = () => resolve()
      transaction.objectStore(STORE_NAME).put(draft)
    })
  } finally {
    database.close()
  }
}

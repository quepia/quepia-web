'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/sistema/supabase/client'

export interface SistemaNotification {
  id: string
  user_id: string
  actor_id: string | null
  type: 'mention' | 'assignment' | 'approval_request' | 'status_change' | 'comment' | 'system'
  title: string
  content: string | null
  link: string | null
  data: Record<string, unknown> | null
  read: boolean
  read_at: string | null
  created_at: string
}

interface UseNotificationsOptions {
  enabled?: boolean
  limit?: number
}

export function useNotifications(userId?: string, options?: UseNotificationsOptions) {
  const enabled = options?.enabled ?? true
  const limit = options?.limit ?? 24

  const [notifications, setNotifications] = useState<SistemaNotification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!enabled || !userId) {
      setNotifications([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('sistema_notifications')
        .select('id, user_id, actor_id, type, title, content, link, data, read, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw error
      }

      setNotifications((data || []) as SistemaNotification[])
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [enabled, limit, userId])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const markAsRead = useCallback(async (notificationId: string) => {
    const now = new Date().toISOString()

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true, read_at: now }
          : notification
      )
    )

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('sistema_notifications')
        .update({ read: true, read_at: now })
        .eq('id', notificationId)

      if (error) {
        throw error
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
      fetchNotifications()
    }
  }, [fetchNotifications])

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return

    const now = new Date().toISOString()
    setNotifications((current) =>
      current.map((notification) =>
        notification.read ? notification : { ...notification, read: true, read_at: now }
      )
    )

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('sistema_notifications')
        .update({ read: true, read_at: now })
        .eq('user_id', userId)
        .eq('read', false)

      if (error) {
        throw error
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      fetchNotifications()
    }
  }, [fetchNotifications, notifications, userId])

  const unreadCount = useMemo(
    () => notifications.reduce((total, notification) => total + (notification.read ? 0 : 1), 0),
    [notifications]
  )

  return {
    notifications,
    loading,
    unreadCount,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
  }
}


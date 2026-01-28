'use server'

import { createClient } from '@/lib/sistema/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createReview(taskId: string, deliverableUrl: string) {
    const supabase = await createClient()

    try {
        const { data, error } = await supabase
            .from('sistema_reviews')
            .insert({
                task_id: taskId,
                deliverable_url: deliverableUrl,
                status: 'pending'
            })
            .select()
            .single()

        if (error) throw error

        revalidatePath('/sistema')
        return { success: true, data }
    } catch (error) {
        console.error('Error creating review:', error)
        return { success: false, error }
    }
}

export async function getReviewByToken(token: string) {
    const supabase = await createClient()

    try {
        const { data: review, error } = await supabase
            .from('sistema_reviews')
            .select(`
        *,
        task:sistema_tasks(
            *,
            project:sistema_projects(*)
        ),
        comments:sistema_review_comments(
            *,
            id,
            content,
            author_name,
            created_at
        )
      `)
            .eq('token', token)
            .order('created_at', { foreignTable: 'sistema_review_comments', ascending: true })
            .single()

        if (error) throw error
        return { success: true, data: review }
    } catch (error) {
        console.error('Error fetching review:', error)
        return { success: false, error }
    }
}

export async function submitReviewDecision(token: string, status: 'approved' | 'changes_requested') {
    const supabase = await createClient()

    try {
        const { data, error } = await supabase
            .from('sistema_reviews')
            .update({ status })
            .eq('token', token)
            .select()

        if (error) throw error

        revalidatePath(`/review/${token}`)
        return { success: true, data }
    } catch (error) {
        console.error('Error submitting decision:', error)
        return { success: false, error }
    }
}

export async function postReviewComment(reviewId: string, content: string, authorName: string) {
    const supabase = await createClient()

    try {
        const { data, error } = await supabase
            .from('sistema_review_comments')
            .insert({
                review_id: reviewId,
                content,
                author_name: authorName
            })
            .select()

        if (error) throw error

        // We revalidate the review page to show the new comment
        // Need to find the token since we only have ID here, but usually revalidation is by path.
        // Or cleaner: return the comment and let client update state? 
        // Revalidating the specific path might be hard without token.
        // Actually, preventing full page reload is better. We return data.

        return { success: true, data }
    } catch (error) {
        console.error('Error posting comment:', error)
        return { success: false, error }
    }
}

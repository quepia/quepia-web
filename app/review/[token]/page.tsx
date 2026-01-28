import { notFound } from "next/navigation"
import { getReviewByToken } from "@/lib/sistema/actions/reviews"
import { ReviewInterface } from "@/components/sistema/quepia/review-interface"

interface PageProps {
    params: Promise<{
        token: string
    }>
}

export default async function ReviewPage({ params }: PageProps) {
    const { token } = await params
    const { data: review, success } = await getReviewByToken(token)

    if (!success || !review) {
        notFound()
    }

    return <ReviewInterface review={review} />
}

import { notFound } from "next/navigation"
import { getProposalByToken } from "@/lib/sistema/actions/proposals"
import { ProposalClientView } from "@/components/sistema/quepia/proposal-client-view"

interface PageProps {
  params: Promise<{
    token: string
  }>
}

export default async function ProposalPage({ params }: PageProps) {
  const { token } = await params
  const { data: proposal, success } = await getProposalByToken(token)

  if (!success || !proposal) {
    notFound()
  }

  return <ProposalClientView proposal={proposal} />
}

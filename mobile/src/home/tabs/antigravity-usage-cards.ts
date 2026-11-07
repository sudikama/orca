import type { AntigravityAccountsData } from '../../accounts/add-account/use-antigravity-accounts'
import type { HomeUsageCard } from './home-usage-cards'

/** One card per saved Antigravity account, the active one first; quota is whatever the host last read. */
export function selectAntigravityCards(data: AntigravityAccountsData): HomeUsageCard[] {
  const { accounts, activeAccountId } = data.state
  return accounts
    .map((account) => {
      const usage = data.usage.find((entry) => entry.accountId === account.id)
      const limits = usage?.limits ?? null
      return {
        accountId: account.id,
        email: account.email,
        subtitle: limits?.error ?? null,
        active: account.id === activeAccountId,
        limits,
        fetching: usage?.fetching === true || limits === null,
        metered: true
      }
    })
    .sort((left, right) => Number(right.active) - Number(left.active))
}

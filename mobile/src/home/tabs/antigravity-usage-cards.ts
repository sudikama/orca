import type { AntigravityAccountsData } from '../../accounts/add-account/use-antigravity-accounts'
import type { HomeUsageCard } from './home-usage-cards'

/** One card per saved Antigravity account, the active one first; quota is what the host last recorded. */
export function selectAntigravityCards(data: AntigravityAccountsData): HomeUsageCard[] {
  const { accounts, activeAccountId } = data.state
  return accounts
    .map((account) => {
      const limits = data.usage.find((entry) => entry.accountId === account.id)?.limits ?? null
      return {
        accountId: account.id,
        email: account.email,
        subtitle: limits?.error ?? null,
        active: account.id === activeAccountId,
        limits,
        fetching: false,
        metered: true
      }
    })
    .sort((left, right) => Number(right.active) - Number(left.active))
}

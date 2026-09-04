export const STALE_PROTOCOL_MESSAGE = 'Protocol changed. Refresh before continuing.'
export const RETRY_PROTOCOL_MESSAGE = 'Protocol command unavailable. Your entries are still available to retry.'

export function requiresMealConfirmation(command) {
  return command === 'log'
}

export function shouldStartCommand(pending) {
  return pending !== true
}

export function commandErrorMessage(error) {
  return error?.status === 409 ? STALE_PROTOCOL_MESSAGE : RETRY_PROTOCOL_MESSAGE
}

export async function loadProtocolSnapshot(getProtocol, getReview) {
  const [protocolResult, reviewResult] = await Promise.allSettled([getProtocol(), getReview()])
  if (protocolResult.status === 'rejected') throw protocolResult.reason
  return {
    protocol: protocolResult.value,
    review: reviewResult.status === 'fulfilled' ? reviewResult.value : null,
    reviewUnavailable: reviewResult.status === 'rejected',
  }
}

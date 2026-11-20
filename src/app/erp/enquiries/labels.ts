/** The shared badge humanises the status code; BOQ is an acronym and must stay upper case. */
export const statusLabel = (s: string | null | undefined): string | undefined => (s === 'BOQ_SUBMITTED' ? 'BOQ submitted' : undefined)

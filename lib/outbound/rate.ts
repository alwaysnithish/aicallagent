/** Price per started minute of outbound calling, in paise. Configurable via OUTBOUND_RATE_PAISE_PER_MIN. */
export const ratePaise = () => Math.max(100, Number(process.env.OUTBOUND_RATE_PAISE_PER_MIN) || 500);

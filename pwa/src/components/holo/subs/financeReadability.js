import { ACC, W, BODY, FM, FD, FB, a, mix } from '../holoTokens'

const smoothText = {
  textRendering: 'geometricPrecision',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
}

export const FINANCE_TEXT_SYSTEM = {
  micro: {
    ...smoothText,
    fontFamily: FM,
    fontSize: 9,
    letterSpacing: '.12em',
    lineHeight: 1.45,
    color: a(ACC, '99'),
  },
  label: {
    ...smoothText,
    fontFamily: FM,
    fontSize: 10,
    letterSpacing: '.14em',
    lineHeight: 1.35,
    color: a(ACC, 'cc'),
  },
  body: {
    ...smoothText,
    fontFamily: FB,
    fontSize: 14,
    fontWeight: 300,
    lineHeight: 1.65,
    color: mix(BODY, 88),
  },
  monoBody: {
    ...smoothText,
    fontFamily: FM,
    fontSize: '14.5px',
    lineHeight: 1.78,
    letterSpacing: '.035em',
    color: mix(BODY, 96),
  },
  value: {
    ...smoothText,
    fontFamily: FD,
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.12,
    color: W,
  },
  button: {
    ...smoothText,
    fontFamily: FM,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '.14em',
    lineHeight: 1.2,
  },
}

export const FINANCE_READABILITY_CSS = `
.holo-finance-room-shell {
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.holo-finance-room-shell button,
.holo-finance-room-shell input,
.holo-finance-room-shell select,
.holo-finance-room-shell textarea {
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`

export const financeMicro = (style = {}) => ({ ...FINANCE_TEXT_SYSTEM.micro, ...style })
export const financeLabel = (style = {}) => ({ ...FINANCE_TEXT_SYSTEM.label, ...style })
export const financeBody = (style = {}) => ({ ...FINANCE_TEXT_SYSTEM.body, ...style })
export const financeMonoBody = (style = {}) => ({ ...FINANCE_TEXT_SYSTEM.monoBody, ...style })
export const financeValue = (style = {}) => ({ ...FINANCE_TEXT_SYSTEM.value, ...style })
export const financeButton = (style = {}) => ({ ...FINANCE_TEXT_SYSTEM.button, ...style })

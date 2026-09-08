import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tokens.css'
import App from './App'
import AccessGate from './components/AccessGate'
import { registerPhoenixServiceWorker } from './pwaUpdate'

registerPhoenixServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AccessGate><App /></AccessGate>
  </StrictMode>
)

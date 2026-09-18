import HoloCommand from './components/holo/HoloCommand'
import InstallPhoenix from './components/InstallPhoenix'

// Holo Command hosts all five domains itself (dock, keys 1–5, ESC walkback).
// The install action lives in the shell chrome so it never covers screen content.
export default function App() {
  return (
    <>
      <HoloCommand />
      <InstallPhoenix placement="chrome" />
    </>
  )
}

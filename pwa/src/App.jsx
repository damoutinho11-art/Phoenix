import { useState } from 'react'
import Chat from './components/Chat'
import BottomNav from './components/BottomNav'
import NutritionDashboard from './components/nutrition/NutritionDashboard'
import RecipeList from './components/nutrition/RecipeList'
import LogMeal from './components/nutrition/LogMeal'
import WeightHistory from './components/nutrition/WeightHistory'
import TrainingMetrics from './components/training/TrainingMetrics'

export default function App() {
  const [tab, setTab] = useState('chat')
  const [nutritionScreen, setNutritionScreen] = useState('dashboard')
  const [chatPrefill, setChatPrefill] = useState(null)

  function switchTab(t) {
    setTab(t)
    if (t === 'nutrition') setNutritionScreen('dashboard')
  }

  function handleQuickAsk(message) {
    setChatPrefill(message)
    setTab('chat')
  }

  function renderContent() {
    if (tab === 'chat') return <Chat prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill(null)} />
    if (tab === 'training') return <TrainingMetrics onQuickAsk={handleQuickAsk} />
    // nutrition screens
    switch (nutritionScreen) {
      case 'dashboard':
        return (
          <NutritionDashboard
            onLogMeal={() => setNutritionScreen('log')}
            onRecipes={() => setNutritionScreen('recipes')}
            onWeight={() => setNutritionScreen('weight')}
            onQuickAsk={handleQuickAsk}
          />
        )
      case 'recipes':
        return <RecipeList onBack={() => setNutritionScreen('dashboard')} />
      case 'log':
        return (
          <LogMeal
            onBack={() => setNutritionScreen('dashboard')}
            onSuccess={() => setNutritionScreen('dashboard')}
          />
        )
      case 'weight':
        return <WeightHistory onBack={() => setNutritionScreen('dashboard')} />
      default:
        return null
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0a0a' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {renderContent()}
      </div>
      <BottomNav tab={tab} onTab={switchTab} />
    </div>
  )
}

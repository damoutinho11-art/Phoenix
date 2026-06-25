import { useState } from 'react'
import Chat from './components/Chat'
import BottomNav from './components/BottomNav'
import NutritionDashboard from './components/nutrition/NutritionDashboard'
import RecipeList from './components/nutrition/RecipeList'
import LogMeal from './components/nutrition/LogMeal'
import WeightHistory from './components/nutrition/WeightHistory'
import TrainingMetrics from './components/training/TrainingMetrics'
import FinanceDashboard from './components/finance/FinanceDashboard'
import WeeklyBrief from './components/finance/WeeklyBrief'
import Holdings from './components/finance/Holdings'
import BriefHistory from './components/finance/BriefHistory'
import Performance from './components/finance/Performance'

export default function App() {
  const [tab, setTab] = useState('chat')
  const [nutritionScreen, setNutritionScreen] = useState('dashboard')
  const [financeScreen, setFinanceScreen] = useState('dashboard')
  const [chatPrefill, setChatPrefill] = useState(null)

  function switchTab(t) {
    setTab(t)
    if (t === 'nutrition') setNutritionScreen('dashboard')
    if (t === 'finance') setFinanceScreen('dashboard')
  }

  function handleQuickAsk(message) {
    setChatPrefill(message)
    setTab('chat')
  }

  function renderContent() {
    if (tab === 'chat') return <Chat prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill(null)} />
    if (tab === 'training') return <TrainingMetrics onQuickAsk={handleQuickAsk} />
    if (tab === 'finance') {
      switch (financeScreen) {
        case 'dashboard':
          return <FinanceDashboard onNav={setFinanceScreen} onQuickAsk={handleQuickAsk} />
        case 'brief':
          return <WeeklyBrief onBack={() => setFinanceScreen('dashboard')} />
        case 'holdings':
          return <Holdings onBack={() => setFinanceScreen('dashboard')} onQuickAsk={handleQuickAsk} />
        case 'performance':
          return <Performance onBack={() => setFinanceScreen('dashboard')} />
        case 'history':
          return <BriefHistory onBack={() => setFinanceScreen('dashboard')} />
        default:
          return null
      }
    }
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

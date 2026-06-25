import { useState } from 'react'
import Chat from './components/Chat'
import HomeScreen from './components/HomeScreen'
import BottomNav from './components/BottomNav'
import NutritionDashboard from './components/nutrition/NutritionDashboard'
import RecipeList from './components/nutrition/RecipeList'
import LogMeal from './components/nutrition/LogMeal'
import WeightHistory from './components/nutrition/WeightHistory'
import TrainingMetrics from './components/training/TrainingMetrics'
import ActiveSession from './components/training/ActiveSession'
import FinanceDashboard from './components/finance/FinanceDashboard'
import WeeklyBrief from './components/finance/WeeklyBrief'
import Holdings from './components/finance/Holdings'
import BriefHistory from './components/finance/BriefHistory'
import Performance from './components/finance/Performance'
import CalendarDashboard from './components/calendar/CalendarDashboard'
import EventDetail from './components/calendar/EventDetail'
import WeekView from './components/calendar/WeekView'

export default function App() {
  const [tab, setTab] = useState('home')
  const [trainingScreen, setTrainingScreen] = useState('dashboard')
  const [nutritionScreen, setNutritionScreen] = useState('dashboard')
  const [financeScreen, setFinanceScreen] = useState('dashboard')
  const [calendarScreen, setCalendarScreen] = useState('dashboard')
  const [calendarEvent, setCalendarEvent] = useState(null)
  const [chatPrefill, setChatPrefill] = useState(null)

  function switchTab(t) {
    setTab(t)
    if (t === 'training') setTrainingScreen('dashboard')
    if (t === 'nutrition') setNutritionScreen('dashboard')
    if (t === 'finance') setFinanceScreen('dashboard')
    if (t === 'calendar') { setCalendarScreen('dashboard'); setCalendarEvent(null) }
  }

  function handleQuickAsk(message) {
    setChatPrefill(message)
    setTab('chat')
  }

  function renderContent() {
    if (tab === 'home') return (
      <HomeScreen onOpenCockpit={() => { setChatPrefill(null); setTab('chat') }} />
    )
    if (tab === 'chat') return <Chat prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill(null)} />
    if (tab === 'training') {
      if (trainingScreen === 'active-session')
        return <ActiveSession onBack={() => setTrainingScreen('dashboard')} />
      return <TrainingMetrics onQuickAsk={handleQuickAsk} onNav={setTrainingScreen} />
    }
    if (tab === 'calendar') {
      switch (calendarScreen) {
        case 'dashboard':
          return (
            <CalendarDashboard
              onEvent={ev => { setCalendarEvent(ev); setCalendarScreen('detail') }}
              onWeekView={() => setCalendarScreen('week')}
              onQuickAsk={handleQuickAsk}
            />
          )
        case 'detail':
          return (
            <EventDetail
              event={calendarEvent}
              onBack={() => setCalendarScreen('dashboard')}
            />
          )
        case 'week':
          return (
            <WeekView
              onBack={() => setCalendarScreen('dashboard')}
              onEvent={ev => { setCalendarEvent(ev); setCalendarScreen('detail') }}
            />
          )
        default:
          return null
      }
    }
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
      <div style={{ position: 'relative', zIndex: 30, flexShrink: 0 }}>
        <BottomNav tab={tab} onTab={switchTab} />
      </div>
    </div>
  )
}

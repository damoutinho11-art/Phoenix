import { useState } from 'react'
import Chat from './components/Chat'
import PhoenixOpeningScreen from './components/PhoenixOpeningScreen'
import BottomNav from './components/BottomNav'
import NutritionDashboard from './components/nutrition/NutritionDashboard'
import RecipeList from './components/nutrition/RecipeList'
import LogMeal from './components/nutrition/LogMeal'
import WeightHistory from './components/nutrition/WeightHistory'
import MealBuilder from './components/nutrition/MealBuilder'
import DayPlanner from './components/nutrition/DayPlanner'
import NutritionMemory from './components/nutrition/NutritionMemory'
import ShoppingList from './components/nutrition/ShoppingList'
import WeeklyPlanner from './components/nutrition/WeeklyPlanner'
import NutritionAcceptanceGate from './components/nutrition/NutritionAcceptanceGate'
import CalendarNutritionBridge from './components/nutrition/CalendarNutritionBridge'
import TrainingMetrics from './components/training/TrainingMetrics'
import ActiveSession from './components/training/ActiveSession'
import JumpLog from './components/training/JumpLog'
import SessionHistory from './components/training/SessionHistory'
import Body from './components/training/Body'
import FinanceDashboard from './components/finance/FinanceDashboard'
import WeeklyBrief from './components/finance/WeeklyBrief'
import Holdings from './components/finance/Holdings'
import BriefHistory from './components/finance/BriefHistory'
import Performance from './components/finance/Performance'
import Research from './components/finance/Research'
import BudgetDashboard from './components/finance/BudgetDashboard'
import BudgetUpload from './components/finance/BudgetUpload'
import BudgetMemory from './components/finance/BudgetMemory'
import CalendarDashboard from './components/calendar/CalendarDashboard'
import EventDetail from './components/calendar/EventDetail'
import WeekView from './components/calendar/WeekView'
import CalendarFeedPublisher from './components/calendar/CalendarFeedPublisher'

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

  function openPhoenixDomain(domain) {
    if (domain === 'finance') {
      switchTab('finance')
      return
    }

    if (domain === 'training') {
      switchTab('training')
      return
    }

    if (domain === 'recovery' || domain === 'nutrition') {
      switchTab('nutrition')
      return
    }

    if (domain === 'calendar') {
      switchTab('calendar')
      return
    }

    setChatPrefill(null)
    setTab('chat')
  }

  function handleQuickAsk(message) {
    setChatPrefill(message)
    setTab('chat')
  }

  function renderContent() {
    if (tab === 'chat') return <Chat prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill(null)} />
    if (tab === 'training') {
      switch (trainingScreen) {
        case 'active-session':
          return <ActiveSession onBack={() => setTrainingScreen('dashboard')} />
        case 'jump-log':
          return <JumpLog onBack={() => setTrainingScreen('dashboard')} />
        case 'training-history':
          return <SessionHistory onBack={() => setTrainingScreen('dashboard')} />
        case 'body':
          return <Body onBack={() => setTrainingScreen('dashboard')} />
        default:
          return <TrainingMetrics onQuickAsk={handleQuickAsk} onNav={setTrainingScreen} />
      }
    }
    if (tab === 'calendar') {
      switch (calendarScreen) {
        case 'dashboard':
          return (
            <CalendarDashboard
              onEvent={ev => { setCalendarEvent(ev); setCalendarScreen('detail') }}
              onWeekView={() => setCalendarScreen('week')}
              onFeed={() => setCalendarScreen('feed')}
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
        case 'feed':
          return <CalendarFeedPublisher onBack={() => setCalendarScreen('dashboard')} />
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
        case 'research':
          return <Research onBack={() => setFinanceScreen('dashboard')} />
        case 'budget':
          return <BudgetDashboard onBack={() => setFinanceScreen('dashboard')} onUpload={() => setFinanceScreen('budget-upload')} onMemory={() => setFinanceScreen('budget-memory')} />
        case 'budget-upload':
          return <BudgetUpload onBack={() => setFinanceScreen('budget')} onSaved={() => setFinanceScreen('budget')} />
        case 'budget-memory':
          return <BudgetMemory onBack={() => setFinanceScreen('budget')} />
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
            onMealBuilder={() => setNutritionScreen('builder')}
            onDayPlanner={() => setNutritionScreen('day-plan')}
            onMemory={() => setNutritionScreen('memory')}
            onShopping={() => setNutritionScreen('shopping')}
            onWeeklyPlanner={() => setNutritionScreen('weekly-plan')}
            onAcceptanceGate={() => setNutritionScreen('acceptance-gate')}
            onCalendarBridge={() => setNutritionScreen('calendar-bridge')}
          />
        )
      case 'recipes':
        return <RecipeList onBack={() => setNutritionScreen('dashboard')} />
      case 'builder':
        return (
          <MealBuilder
            onBack={() => setNutritionScreen('dashboard')}
            onSuccess={() => setNutritionScreen('dashboard')}
          />
        )
      case 'day-plan':
        return (
          <DayPlanner
            onBack={() => setNutritionScreen('dashboard')}
            onSuccess={() => setNutritionScreen('dashboard')}
          />
        )
      case 'memory':
        return (
          <NutritionMemory
            onBack={() => setNutritionScreen('dashboard')}
            onSuccess={() => setNutritionScreen('dashboard')}
          />
        )
      case 'shopping':
        return <ShoppingList onBack={() => setNutritionScreen('dashboard')} />
      case 'acceptance-gate':
        return <NutritionAcceptanceGate onBack={() => setNutritionScreen('dashboard')} />
      case 'calendar-bridge':
        return <CalendarNutritionBridge onBack={() => setNutritionScreen('dashboard')} />
      case 'weekly-plan':
        return (
          <WeeklyPlanner
            onBack={() => setNutritionScreen('dashboard')}
            onSuccess={() => setNutritionScreen('dashboard')}
          />
        )
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

  if (tab === 'home') {
    return (
      <PhoenixOpeningScreen
        onOpenDomain={openPhoenixDomain}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-title">PHOENIX</div>
            <div className="brand-sub">PERSONAL HEURISTIC OPERATING ENGINE</div>
          </div>
        </div>
        <div className="hud-chip">● ONLINE</div>
      </div>
      <div key={tab} className="screen-enter" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {renderContent()}
      </div>
      <div style={{ flexShrink: 0 }}>
        <BottomNav tab={tab} onTab={switchTab} />
      </div>
    </div>
  )
}

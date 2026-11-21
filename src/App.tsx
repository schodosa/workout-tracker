import { Redirect, Route, Switch } from 'wouter'
import { TabBar } from './components/TabBar.tsx'
import { HistoryScreen } from './features/history/HistoryScreen.tsx'
import { SettingsScreen } from './features/settings/SettingsScreen.tsx'
import { TemplateScreen } from './features/templates/TemplateScreen.tsx'
import { TodayScreen } from './features/today/TodayScreen.tsx'

export default function App() {
  return (
    <div className="app">
      <main className="screen">
        <Switch>
          <Route path="/" component={TodayScreen} />
          <Route path="/templates/:id" component={TemplateScreen} />
          <Route path="/history" component={HistoryScreen} />
          <Route path="/settings" component={SettingsScreen} />
          {/* Any unknown URL goes back to Today. */}
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </main>
      <TabBar />
    </div>
  )
}

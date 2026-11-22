import { lazy, Suspense } from 'react'
import { Redirect, Route, Switch } from 'wouter'
import { CatalogProvider } from './components/CatalogProvider.tsx'
import { ActivitiesScreen, ActivityEditorScreen, LogPastActivityScreen } from './features/activities/ActivitiesScreen.tsx'
import { TabBar } from './components/TabBar.tsx'
import { HistoryScreen } from './features/history/HistoryScreen.tsx'
import { SessionDetailScreen } from './features/history/SessionDetailScreen.tsx'
import { CustomExerciseScreen } from './features/library/CustomExerciseScreen.tsx'
import { ExerciseScreen } from './features/library/ExerciseScreen.tsx'
import { LibraryScreen } from './features/library/LibraryScreen.tsx'
import { SessionScreen } from './features/session/SessionScreen.tsx'
import { EquipmentScreen } from './features/settings/EquipmentScreen.tsx'
import { PlanScreen } from './features/settings/PlanScreen.tsx'
import { SuggestionsScreen } from './features/settings/SuggestionsScreen.tsx'
import { ProgressionScreen } from './features/settings/ProgressionScreen.tsx'
import { SettingsScreen } from './features/settings/SettingsScreen.tsx'
import { ProfileScreen } from './features/settings/ProfileScreen.tsx'
import { OnboardingScreen } from './features/onboarding/OnboardingScreen.tsx'

// Loaded on demand: the backup screen pulls in Zod (~60 KB gzipped), which nothing else needs.
// Vite turns the dynamic import() into a separate file; the service worker still pre-caches it,
// so it opens offline too.
const BackupScreen = lazy(() => import('./features/settings/BackupScreen.tsx').then((m) => ({ default: m.BackupScreen })))
// Same for presets (Zod again).
const PresetScreen = lazy(() => import('./features/onboarding/PresetScreen.tsx').then((m) => ({ default: m.PresetScreen })))
import { TemplateEditorScreen } from './features/templates/TemplateEditorScreen.tsx'
import { TemplateScreen } from './features/templates/TemplateScreen.tsx'
import { TodayScreen } from './features/today/TodayScreen.tsx'
import { WeekScreen } from './features/week/WeekScreen.tsx'

export default function App() {
  return (
    <CatalogProvider>
      <div className="app">
        <main className="screen">
          <Switch>
            <Route path="/" component={TodayScreen} />
            <Route path="/templates/new" component={TemplateEditorScreen} />
            <Route path="/templates/:id/edit" component={TemplateEditorScreen} />
            <Route path="/templates/:id" component={TemplateScreen} />
            <Route path="/session/:id" component={SessionScreen} />
            <Route path="/week" component={WeekScreen} />
            <Route path="/library" component={LibraryScreen} />
            <Route path="/library/new" component={CustomExerciseScreen} />
            <Route path="/library/:id/edit" component={CustomExerciseScreen} />
            <Route path="/library/:id" component={ExerciseScreen} />
            <Route path="/history" component={HistoryScreen} />
            <Route path="/history/:id" component={SessionDetailScreen} />
            <Route path="/welcome/preset">
              <Suspense fallback={null}>
                <PresetScreen />
              </Suspense>
            </Route>
            <Route path="/welcome/:step?" component={OnboardingScreen} />
            <Route path="/settings" component={SettingsScreen} />
            <Route path="/settings/profile" component={ProfileScreen} />
            <Route path="/settings/equipment" component={EquipmentScreen} />
            <Route path="/settings/plan" component={PlanScreen} />
            <Route path="/settings/activities" component={ActivitiesScreen} />
            <Route path="/settings/suggestions" component={SuggestionsScreen} />
            <Route path="/settings/progression" component={ProgressionScreen} />
            <Route path="/settings/activities/:id" component={ActivityEditorScreen} />
            <Route path="/activities/log" component={LogPastActivityScreen} />
            <Route path="/settings/backup">
              <Suspense fallback={null}>
                <BackupScreen />
              </Suspense>
            </Route>
            {/* Any unknown URL goes back to Today. */}
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </main>
        <TabBar />
      </div>
    </CatalogProvider>
  )
}

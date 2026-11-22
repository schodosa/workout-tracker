import { lazy, Suspense, type ComponentType } from 'react'
import { Redirect, Route, Switch } from 'wouter'
import { CatalogProvider } from './components/CatalogProvider.tsx'
import { TabBar } from './components/TabBar.tsx'
import { CheckinScreen } from './features/checkins/CheckinScreen.tsx'
import { HistoryScreen } from './features/history/HistoryScreen.tsx'
import { SessionDetailScreen } from './features/history/SessionDetailScreen.tsx'
import { ExerciseScreen } from './features/library/ExerciseScreen.tsx'
import { LibraryScreen } from './features/library/LibraryScreen.tsx'
import { SessionScreen } from './features/session/SessionScreen.tsx'
import { SettingsScreen } from './features/settings/SettingsScreen.tsx'
import { TemplateScreen } from './features/templates/TemplateScreen.tsx'
import { TodayScreen } from './features/today/TodayScreen.tsx'
import { WeekScreen } from './features/week/WeekScreen.tsx'

/**
 * A screen loaded on demand. Screens used every day (Today, Week, a session, History, Library)
 * are in the main bundle; setup screens (onboarding, editors, settings pages) load when opened.
 * Vite turns each dynamic import() into its own file and the service worker pre-caches them all,
 * so they still open offline. Backup and presets also keep Zod out of the main bundle this way.
 */
function lazyScreen<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  const Screen = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })))
  return function LazyScreen() {
    return (
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    )
  }
}

const BackupScreen = lazyScreen(() => import('./features/settings/BackupScreen.tsx'), 'BackupScreen')
const PresetScreen = lazyScreen(() => import('./features/onboarding/PresetScreen.tsx'), 'PresetScreen')
const OnboardingScreen = lazyScreen(() => import('./features/onboarding/OnboardingScreen.tsx'), 'OnboardingScreen')
const ProfileScreen = lazyScreen(() => import('./features/settings/ProfileScreen.tsx'), 'ProfileScreen')
const TemplateEditorScreen = lazyScreen(() => import('./features/templates/TemplateEditorScreen.tsx'), 'TemplateEditorScreen')
const CustomExerciseScreen = lazyScreen(() => import('./features/library/CustomExerciseScreen.tsx'), 'CustomExerciseScreen')
const EquipmentScreen = lazyScreen(() => import('./features/settings/EquipmentScreen.tsx'), 'EquipmentScreen')
const PlanScreen = lazyScreen(() => import('./features/settings/PlanScreen.tsx'), 'PlanScreen')
const SuggestionsScreen = lazyScreen(() => import('./features/settings/SuggestionsScreen.tsx'), 'SuggestionsScreen')
const ProgressionScreen = lazyScreen(() => import('./features/settings/ProgressionScreen.tsx'), 'ProgressionScreen')
const TrainingDefaultsScreen = lazyScreen(() => import('./features/settings/TrainingDefaultsScreen.tsx'), 'TrainingDefaultsScreen')
const CheckinSettingsScreen = lazyScreen(() => import('./features/checkins/CheckinSettingsScreen.tsx'), 'CheckinSettingsScreen')
const ActivitiesScreen = lazyScreen(() => import('./features/activities/ActivitiesScreen.tsx'), 'ActivitiesScreen')
const ActivityEditorScreen = lazyScreen(() => import('./features/activities/ActivitiesScreen.tsx'), 'ActivityEditorScreen')
const LogPastActivityScreen = lazyScreen(() => import('./features/activities/ActivitiesScreen.tsx'), 'LogPastActivityScreen')

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
            <Route path="/checkin/:id" component={CheckinScreen} />
            <Route path="/welcome/preset" component={PresetScreen} />
            <Route path="/welcome/:step?" component={OnboardingScreen} />
            <Route path="/settings" component={SettingsScreen} />
            <Route path="/settings/profile" component={ProfileScreen} />
            <Route path="/settings/training" component={TrainingDefaultsScreen} />
            <Route path="/settings/checkins" component={CheckinSettingsScreen} />
            <Route path="/settings/equipment" component={EquipmentScreen} />
            <Route path="/settings/plan" component={PlanScreen} />
            <Route path="/settings/activities" component={ActivitiesScreen} />
            <Route path="/settings/suggestions" component={SuggestionsScreen} />
            <Route path="/settings/progression" component={ProgressionScreen} />
            <Route path="/settings/activities/:id" component={ActivityEditorScreen} />
            <Route path="/activities/log" component={LogPastActivityScreen} />
            <Route path="/settings/backup" component={BackupScreen} />
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

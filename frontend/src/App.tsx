import { Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import Login from './auth/Login'
import Respond from './pages/Respond'
import { MainFlowShell } from './components/layout/MainFlowShell'
import { Spinner } from './components/ui/Spinner'

export default function App() {
  const { user, loading } = useAuth()

  return (
    <Routes>
      <Route path="/respond/:token" element={<Respond />} />
      <Route
        path="/*"
        element={
          loading ? (
            <div className="flex h-screen items-center justify-center">
              <Spinner />
            </div>
          ) : user ? (
            <MainFlowShell />
          ) : (
            <Login />
          )
        }
      />
    </Routes>
  )
}

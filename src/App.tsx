import { Route, Routes } from 'react-router-dom'
import { Shell } from './components/Layout'
import Home from './pages/Home'
import ProjectPage from './pages/ProjectPage'
import NoteEditor from './pages/NoteEditor'
import AllTasks from './pages/AllTasks'
import Search from './pages/Search'
import Calendar from './pages/Calendar'
import Login from './pages/Login'
import RequireAuth from './components/RequireAuth'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/p/:projectId" element={<ProjectPage />} />
          <Route path="/tasks" element={<AllTasks />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/search" element={<Search />} />
          <Route path="*" element={<Home />} />
        </Route>
        <Route path="/p/:projectId/n/:noteId" element={<NoteEditor />} />
      </Route>
    </Routes>
  )
}

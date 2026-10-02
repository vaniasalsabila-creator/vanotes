import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { Page } from '../components/Layout'
import TaskRows, { type TaskWithSource } from '../components/TaskRows'

export default function AllTasks() {
  const data = useLiveQuery(async () => {
    const [tasks, projects, notes] = await Promise.all([db.tasks.toArray(), db.projects.toArray(), db.notes.toArray()])
    const titles = new Map(notes.map((n) => [n.id, n.title || n.bodyText.split('\n')[0].slice(0, 60)]))
    return projects
      .map((project) => ({
        project,
        tasks: tasks
          .filter((t) => t.projectId === project.id)
          .map((t): TaskWithSource => ({ ...t, project, noteTitle: titles.get(t.noteId) ?? '' }))
          .sort((a, b) => b.createdAt - a.createdAt || a.order - b.order),
      }))
      .filter((g) => g.tasks.length)
  })

  const open = data?.reduce((n, g) => n + g.tasks.filter((t) => !t.done).length, 0) ?? 0

  return (
    <Page>
      <h1 className="font-display text-4xl sm:text-5xl">all tasks</h1>
      <p className="mt-2 font-mono text-sm text-muted">{open} open · pulled from checklists in every project</p>

      {data?.length === 0 && <TaskRows tasks={[]} showProject={false} />}
      <div className="mt-10 space-y-10">
        {data?.map(({ project, tasks }) => (
          <section key={project.id}>
            <h2 className="flex items-center gap-2.5 border-b border-line pb-2 font-display text-xl">
              <span className="h-3 w-3 rounded-[4px]" style={{ background: project.color }} />
              {project.name}
            </h2>
            <TaskRows tasks={tasks} showProject={false} />
          </section>
        ))}
      </div>
    </Page>
  )
}

import { demoProjects } from "@/lib/demo-data";

export default function ProjectsPage() {
  return (
    <main className="main">
      <header className="topbar">
        <div>
          <p className="eyeline">Projects</p>
          <h1>Project and vault inventory</h1>
        </div>
        <button className="primary-button" type="button">
          Create project
        </button>
      </header>
      <article className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Slug</th>
              <th>Vaults</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {demoProjects.map((project) => (
              <tr key={project.slug}>
                <td>{project.name}</td>
                <td>{project.slug}</td>
                <td>{project.vaultCount}</td>
                <td>{project.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </main>
  );
}

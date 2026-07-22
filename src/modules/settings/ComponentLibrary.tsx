import { AlertCircle, Check, LoaderCircle, Plus, Search } from "lucide-react";

export function ComponentLibrary() {
  return (
    <div className="module-page component-library">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Developer route · visual regression</span>
          <h1>Component library</h1>
          <p>Core controls rendered in every interaction state.</p>
        </div>
      </header>
      <section>
        <h2>Buttons</h2>
        <div className="component-row">
          <button className="button primary">Primary</button>
          <button className="button">Default</button>
          <button className="button" disabled>
            Disabled
          </button>
          <button className="button loading">
            <LoaderCircle /> Loading
          </button>
          <button className="icon-button">
            <Plus />
          </button>
        </div>
      </section>
      <section>
        <h2>Inputs</h2>
        <div className="component-row">
          <input placeholder="Default input" />
          <div className="settings-search">
            <Search />
            <input value="With content" readOnly />
          </div>
          <input value="Disabled" disabled readOnly />
          <label className="field-error">
            <input value="Invalid value" readOnly />
            <small>
              <AlertCircle /> Explain how to fix this value.
            </small>
          </label>
        </div>
      </section>
      <section>
        <h2>Status</h2>
        <div className="component-row">
          <span className="status success">
            <Check /> Complete
          </span>
          <span className="status warning">
            <AlertCircle /> Needs attention
          </span>
          <span className="status neutral">Neutral</span>
        </div>
      </section>
      <section>
        <h2>Empty state</h2>
        <div className="empty-state">
          <Search />
          <h2>No matching notes</h2>
          <p>Try another query or create a note with this title.</p>
          <button className="button primary">Create note</button>
        </div>
      </section>
    </div>
  );
}

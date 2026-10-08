import { Component, type ReactNode } from 'react'

type Props = { name: string; children: ReactNode }

/** Keeps a crash on one page from blanking the whole app, and says which page broke. */
export class PageBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`${this.props.name} crashed:`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="page-error">
        <h1 className="page-title">{this.props.name} stopped working</h1>
        <p className="dim">{this.state.error.message}</p>
        <button className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </main>
    )
  }
}

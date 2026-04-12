import { ArtifactWindow } from '@/app/window/artifact.js'
import type { AppInterface } from '@/lib/app.js'
import type { Tool } from '@/lib/providers/index.js'

export const render_html: Tool = {
  type: 'function',
  function: {
    name: 'render_html',
    parameters: {
      type: 'object',
      properties: {
        window_title: {
          type: 'string',
          description: 'An optional descriptive title for the window. Defaults to "Preview". Use a consistent title to update an existing window.'
        },
        html: {
          type: 'string',
          description: 'The raw HTML string to be rendered. Must include CSS and JS inline.'
        }
      },
      required: ['html']
    },
    description: 'Renders HTML content inside a standalone artifact window. Use this for complex UIs, games, or data visualizations. If a window with the same title already exists, it will be updated with the new content. Returns the HTML content on success.'
  }
}

export function handle_render_html(app: AppInterface, args: Record<string, unknown>): string {
  const window_title = typeof args.window_title === 'string' && args.window_title ? args.window_title : 'Preview'
  let html = typeof args.html === 'string' ? args.html : ''

  if (!html) {
    return 'Error: html is required.'
  }

  const closingTag = '</html>'
  const closingIndex = html.toLowerCase().lastIndexOf(closingTag)
  if (closingIndex !== -1) {
    html = html.substring(0, closingIndex + closingTag.length)
  }

  try {
    const existingWindow = app.activeArtifacts.get(window_title)
    if (existingWindow) {
      existingWindow.update(window_title, html)
    } else {
      const window = new ArtifactWindow(app, window_title, html)
      app.activeArtifacts.set(window_title, window)
      window.present()
    }

    return html
  } catch (e) {
    return `Error rendering artifact: ${e instanceof Error ? e.message : String(e)}`
  }
}

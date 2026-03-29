import Adw from 'gi://Adw?version=1'
import WebKit from 'gi://WebKit?version=6.0'

import type { OllamaTool } from '@/lib/ollama.js'

export const render_html: OllamaTool = {
  type: 'function',
  function: {
    name: 'render_html',
    parameters: {
      type: 'object',
      properties: {
        html_content: {
          type: 'string',
          description: 'The raw HTML string to be rendered.'
        }
      },
      required: ['html_content']
    },
    description: 'Renders HTML content inside a new internal application window. Use this tool as an interactive canvas to generate and display complex UIs, games, data visualizations (e.g., charts, graphs), or any dynamic web content. The HTML string should be fully self-contained. Note that external resources may be blocked; embed CSS and JS directly.'
  }
}

export function handle_render_html(args: Record<string, unknown>): string {
  const htmlContent = typeof args.html_content === 'string' ? args.html_content : ''

  if (!htmlContent) {
    return 'Error: html_content is required.'
  }

  try {
    const webView = new WebKit.WebView()
    webView.load_html(htmlContent, null)

    const toolbarView = new Adw.ToolbarView()
    const headerBar = new Adw.HeaderBar()
    toolbarView.add_top_bar(headerBar)
    toolbarView.set_content(webView)

    const window = new Adw.Window({
      title: 'HTML Preview',
      default_width: 800,
      default_height: 600
    })

    window.set_content(toolbarView)
    window.present()

    return 'Successfully rendered HTML in an internal preview window.'
  } catch (e) {
    return `Error rendering HTML internally: ${e instanceof Error ? e.message : String(e)}`
  }
}

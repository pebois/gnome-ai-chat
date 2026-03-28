import Gio from 'gi://Gio'

import type { OllamaTool } from '@/lib/ollama.js'

export const run_automation_command: OllamaTool = {
  type: 'function',
  function: {
    name: 'run_automation_command',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The ydotool subcommands and arguments (e.g., \'mousemove --absolute -x 100 -y 100\', \'click 0xC0\', \'type "Hello"\').'
        }
      },
      required: ['command']
    },
    description: 'Executes a ydotool command for Wayland desktop automation. IMPORTANT: You MUST take a screenshot using `take_screenshot` first to determine coordinates.'
  }
}

export async function handle_run_automation_command(args: Record<string, unknown>): Promise<string> {
  const command = args.command as string
  if (!command) {
    return 'Error: No command provided.'
  }

  try {
    const argv = ['ydotool', ...command.match(/(?:[^\s"]+|"[^"]*")+/g) || []]

    const proc = new Gio.Subprocess({
      argv,
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    })

    return new Promise((resolve) => {
      proc.init(null)
      proc.communicate_utf8_async(null, null, (p, res) => {
        try {
          const [, stdout, stderr] = (p as Gio.Subprocess).communicate_utf8_finish(res)
          const success = (p as Gio.Subprocess).get_if_exited() && (p as Gio.Subprocess).get_exit_status() === 0
          if (success) {
            resolve(stdout || 'Command executed successfully.')
          } else {
            resolve(`Error executing command: ${stderr || 'Unknown error'}`)
          }
        } catch (err) {
          resolve(`Error: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    })
  } catch (err) {
    return `Error starting ydotool: ${err instanceof Error ? err.message : String(err)}`
  }
}

import Gio, { type File } from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import type { AppInterface } from '@/lib/app.js'
import type { OllamaTool } from '@/lib/ollama.js'

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish')
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish')
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish')

export const read_file: OllamaTool = {
  type: 'function',
  function: {
    name: 'read_file',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute or relative path to the file to read.'
        }
      },
      required: ['file_path']
    },
    description: 'Reads and returns the complete text content of a specified file. Note that it reads the entire file into context.'
  }
}

export const write_file: OllamaTool = {
  type: 'function',
  function: {
    name: 'write_file',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute or relative path where the file will be saved.'
        },
        content: {
          type: 'string',
          description: 'The complete text content to write to the file.'
        }
      },
      required: ['file_path', 'content']
    },
    description: 'Writes the provided content to a file. WARNING: This completely overwrites existing files.'
  }
}

export const list_directory: OllamaTool = {
  type: 'function',
  function: {
    name: 'list_directory',
    parameters: {
      type: 'object',
      properties: {
        dir_path: {
          type: 'string',
          description: 'The path to the directory to list.'
        }
      },
      required: ['dir_path']
    },
    description: 'Lists the names of files and subdirectories directly within a specified directory.'
  }
}

export const run_shell_command: OllamaTool = {
  type: 'function',
  function: {
    name: 'run_shell_command',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The exact shell command to execute as `bash -c <command>`.'
        }
      },
      required: ['command']
    },
    description: 'Executes a given shell command as a subprocess. WARNING: Ensure commands are non-interactive (e.g., use `-y` flags, avoid `vim` or `top`) and complete in a reasonable time.'
  }
}

export function handle_read_file(args: Record<string, unknown>): Promise<string> {
  const filePath = args.file_path as string
  if (!filePath) {
    return Promise.resolve('Error: file_path is required.')
  }

  try {
    const file = Gio.File.new_for_path(filePath) as File
    const [success, contents] = GLib.file_get_contents(file.get_path() || filePath)
    if (success) {
      return Promise.resolve(new TextDecoder().decode(contents))
    }
    return Promise.resolve('Error: Could not read file.')
  } catch (err) {
    return Promise.resolve(`Error reading file: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function handle_write_file(app: AppInterface, args: Record<string, unknown>): Promise<string> {
  const filePath = args.file_path as string
  const content = args.content as string
  if (!filePath) {
    return 'Error: file_path is required.'
  }

  if (app.settings.permissions?.files !== 'auto-accept') {
    const allowed = await app.requestToolPermission(
      'Allow File Edit?',
      `The model wants to write to the following file:\n\n${filePath}`
    )
    if (!allowed) {
      return 'Error: User denied permission to write file.'
    }
  }

  try {
    const file = Gio.File.new_for_path(filePath) as File
    const encoder = new TextEncoder()
    const bytes = encoder.encode(content || '')

    await file.replace_contents_bytes_async(
      new GLib.Bytes(bytes),
      null,
      false,
      Gio.FileCreateFlags.NONE,
      null
    )
    return `Successfully wrote to ${filePath}`
  } catch (err) {
    return `Error writing file: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_list_directory(args: Record<string, unknown>): Promise<string> {
  const dirPath = args.dir_path as string
  if (!dirPath) {
    return 'Error: dir_path is required.'
  }

  try {
    const dir = Gio.File.new_for_path(dirPath) as File
    const enumerator = (await dir.enumerate_children_async(
      'standard::name,standard::type',
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT,
      null
    ))

    const entries: string[] = []
    let files = await enumerator.next_files_async(100, GLib.PRIORITY_DEFAULT, null)
    while (files && files.length > 0) {
      for (const info of files) {
        const name = info.get_name()
        const isDir = info.get_file_type() === Gio.FileType.DIRECTORY
        entries.push(isDir ? `${name}/` : name)
      }
      files = await enumerator.next_files_async(100, GLib.PRIORITY_DEFAULT, null)
    }

    await enumerator.close_async(GLib.PRIORITY_DEFAULT, null)

    if (entries.length === 0) {
      return '(empty directory)'
    }
    return entries.sort().join('\n')
  } catch (err) {
    return `Error listing directory: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_run_shell_command(app: AppInterface, args: Record<string, unknown>): Promise<string> {
  const command = args.command as string
  if (!command) {
    return 'Error: command is required.'
  }

  if (app.settings.permissions?.terminal !== 'auto-accept') {
    const allowed = await app.requestToolPermission(
      'Allow Terminal Command?',
      `The model wants to execute the following terminal command:\n\n${command}`
    )
    if (!allowed) {
      return 'Error: User denied permission to run command.'
    }
  }

  try {
    const proc = new Gio.Subprocess({
      argv: ['bash', '-c', command],
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    })

    return new Promise((resolve) => {
      proc.init(null)
      proc.communicate_utf8_async(null, null, (p, res) => {
        try {
          const [, stdout, stderr] = (p as Gio.Subprocess).communicate_utf8_finish(res)
          const exitCode = (p as Gio.Subprocess).get_exit_status()
          resolve(`Exit Code: ${exitCode}\nStdout:\n${stdout || '(empty)'}\nStderr:\n${stderr || '(empty)'}`)
        } catch (err) {
          resolve(`Error reading output: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    })
  } catch (err) {
    return `Error running command: ${err instanceof Error ? err.message : String(err)}`
  }
}

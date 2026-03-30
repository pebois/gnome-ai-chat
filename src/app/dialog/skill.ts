import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/app/index.js'

export function showSkillDialog(app: AppInterface, parent: Gtk.Window, index: number | undefined, onSave: () => void): void {
  const dialog = new Adw.MessageDialog({
    heading: index !== undefined ? 'Edit Skill' : 'Add Skill',
    body: 'Configure the skill persona and its system prompt.',
    transient_for: parent
  })

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12
  })
  // box.add_css_class('margin-12')
  box.set_size_request(500, -1)

  const skill = index !== undefined ? app.settings.skills[index] : null

  const nameEntry = new Adw.EntryRow({
    title: 'Name',
    text: skill?.name || ''
  })
  box.append(nameEntry)

  const descEntry = new Adw.EntryRow({
    title: 'Description',
    text: skill?.description || ''
  })
  box.append(descEntry)

  const promptScrolled = new Gtk.ScrolledWindow({
    min_content_height: 250,
    propagate_natural_height: true
  })
  promptScrolled.add_css_class('frame')
  const promptView = new Gtk.TextView({
    wrap_mode: Gtk.WrapMode.WORD_CHAR,
    left_margin: 12,
    right_margin: 12,
    top_margin: 12,
    bottom_margin: 12
  })
  promptView.get_buffer().set_text(skill?.prompt || '', -1)
  promptScrolled.set_child(promptView)
  box.append(promptScrolled)

  dialog.set_extra_child(box)

  dialog.add_response('cancel', 'Cancel')
  dialog.add_response('save', 'Save')
  dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED)

  dialog.connect('response', (_d, responseId) => {
    if (responseId === 'save') {
      const newName = nameEntry.get_text().trim()
      const newDesc = descEntry.get_text().trim()
      const buf = promptView.get_buffer()
      const newPrompt = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), false).trim()

      if (newName && newPrompt) {
        const newSkill = {
          id: skill?.id || newName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: newName,
          description: newDesc,
          prompt: newPrompt
        }

        if (index !== undefined) {
          app.settings.skills[index] = newSkill
        } else {
          if (!app.settings.skills) {
            app.settings.skills = []
          }
          app.settings.skills.push(newSkill)
        }
        app.settings.skills.sort((a, b) => {
          return a.name.localeCompare(b.name)
        })
        app.saveSettings()
        onSave()
      }
    }
    dialog.close()
  })

  dialog.present()
}

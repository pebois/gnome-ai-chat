import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'

import type { AppInterface } from '@/app/index.js'
import { DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'

export function showSkillDialog(app: AppInterface, parent: Gtk.Window, index: number | undefined, onSave: () => void): void {
  const dialog = new Adw.MessageDialog({
    heading: index !== undefined ? 'Edit Skill' : 'Add Skill',
    body: 'Configure the skill persona and its system prompt.',
    transient_for: parent,
    width_request: 450
  })

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12
  })

  const skill = index !== undefined ? app.settings.skills[index] : null

  const infoGroup = new Adw.PreferencesGroup()
  box.append(infoGroup)

  const nameEntry = new Adw.EntryRow({
    title: 'Name',
    text: skill?.name || ''
  })
  infoGroup.add(nameEntry)

  const descEntry = new Adw.EntryRow({
    title: 'Description',
    text: skill?.description || ''
  })
  infoGroup.add(descEntry)

  const promptGroup = new Adw.PreferencesGroup({ title: 'System Prompt' })
  box.append(promptGroup)

  const promptScrolled = new Gtk.ScrolledWindow({
    propagate_natural_height: true,
    min_content_height: 150,
    max_content_height: 300,
    hscrollbar_policy: Gtk.PolicyType.NEVER
  })
  promptScrolled.add_css_class('view')
  promptScrolled.add_css_class('frame')

  const lm = GtkSource.LanguageManager.get_default()
  const promptBuffer = new GtkSource.Buffer()
  const lang = lm.get_language('markdown')
  if (lang) {
    promptBuffer.set_language(lang)
  }

  const sm = GtkSource.StyleSchemeManager.get_default()
  const scheme = sm.get_scheme(app.settings.syntax || DEFAULT_SYNTAX_THEME)
  if (scheme) {
    promptBuffer.set_style_scheme(scheme)
  }

  const promptView = new GtkSource.View({
    buffer: promptBuffer,
    wrap_mode: Gtk.WrapMode.WORD_CHAR,
    left_margin: 12,
    right_margin: 12,
    top_margin: 12,
    bottom_margin: 12,
    monospace: true
  })
  promptBuffer.set_text(skill?.prompt || '', -1)
  promptScrolled.set_child(promptView)
  promptGroup.add(promptScrolled)

  const syntaxSignalId = app.connect('syntax-changed', (_, theme: string) => {
    const scheme = sm.get_scheme(theme)
    if (scheme) {
      promptBuffer.set_style_scheme(scheme)
    }
  })

  dialog.connect('destroy', () => {
    app.disconnect(syntaxSignalId)
  })

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
